import { Holding, AssetClass } from './types';
import { ASSET_CATALOG, LocalAsset, getCatalogAsset } from './assetCatalog';
import { searchSymbolsApi, FinnhubSearchResult } from './finnhub';

/**
 * Unified search result type that works for both local and API results
 */
export interface SearchAssetResult {
  symbol: string;
  name: string;
  type: string;
  assetClass: AssetClass;
  category?: string;
  source: 'holding' | 'local' | 'api';
  matchScore: number; // Higher = better match (for ranking)
}

/**
 * Client-side search result cache
 */
const searchCache = new Map<string, { results: SearchAssetResult[]; timestamp: number }>();
const SEARCH_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Rate limit tracking
 */
let rateLimitedUntil = 0;

/**
 * Simple Levenshtein distance for fuzzy matching (optimized for short strings)
 */
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  if (a === b) return 0;

  // Optimization: if lengths differ by more than 2, skip
  if (Math.abs(a.length - b.length) > 2) return 999;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate match score for ranking
 * Higher score = better match
 */
function calculateMatchScore(
  asset: LocalAsset | FinnhubSearchResult,
  query: string,
  isHolding: boolean
): number {
  const q = query.toLowerCase();
  const symbol = asset.symbol.toLowerCase();
  const name = asset.name.toLowerCase();
  
  let score = 0;
  
  // User holdings get highest priority
  if (isHolding) score += 10000;
  
  // Exact symbol match
  if (symbol === q) score += 5000;
  
  // Symbol prefix match
  else if (symbol.startsWith(q)) score += 3000;
  
  // Name prefix match (word-level)
  else if (name.startsWith(q)) score += 2000;
  
  // Name contains query as word start
  else if (name.split(/\s+/).some(word => word.startsWith(q))) score += 1500;
  
  // Name contains query anywhere
  else if (name.includes(q)) score += 1000;
  
  // Symbol contains query
  else if (symbol.includes(q)) score += 800;
  
  // Fuzzy match on symbol (for typos like "appl" -> "aapl")
  else {
    const symbolDist = levenshteinDistance(q, symbol);
    if (symbolDist <= 1) score += 500;
    else if (symbolDist <= 2) score += 200;
    else {
      // Fuzzy match on name words
      const nameWords = name.split(/\s+/);
      for (const word of nameWords) {
        const wordDist = levenshteinDistance(q, word);
        if (wordDist <= 1) {
          score += 300;
          break;
        } else if (wordDist <= 2) {
          score += 100;
          break;
        }
      }
    }
  }
  
  // Add popularity bonus for local assets (0-100 range, scaled down)
  if ('popularity' in asset) {
    score += (asset as LocalAsset).popularity;
  }
  
  return score;
}

/**
 * Search local catalog synchronously
 */
export function searchLocalCatalog(
  query: string,
  holdings: Holding[] = [],
  limit: number = 15
): SearchAssetResult[] {
  if (!query || query.length < 1) return [];
  
  const q = query.toLowerCase().trim();
  const holdingSymbols = new Set(holdings.map(h => h.symbol.toUpperCase()));
  const results: SearchAssetResult[] = [];
  const seen = new Set<string>();
  
  // First, check user holdings
  for (const holding of holdings) {
    const symbol = holding.symbol.toUpperCase();
    const name = holding.name.toLowerCase();
    
    if (symbol.toLowerCase().includes(q) || name.includes(q)) {
      // Try to get additional info from catalog
      const catalogAsset = getCatalogAsset(symbol);
      
      results.push({
        symbol,
        name: catalogAsset?.name || holding.name,
        type: catalogAsset?.type || (holding.assetClass === 'etf' ? 'ETF' : 
              holding.assetClass === 'reit' ? 'REIT' : 
              holding.assetClass === 'bond' ? 'Bond ETF' : 'Stock'),
        assetClass: holding.assetClass,
        category: catalogAsset?.category,
        source: 'holding',
        matchScore: calculateMatchScore(
          catalogAsset || {
            symbol,
            name: holding.name,
            normalizedSymbol: symbol.toLowerCase(),
            normalizedName: name,
            type: 'Stock',
            assetClass: holding.assetClass,
            popularity: 100,
          },
          q,
          true
        ),
      });
      seen.add(symbol);
    }
  }
  
  // Then search catalog
  for (const asset of ASSET_CATALOG) {
    if (seen.has(asset.symbol)) continue;
    
    const score = calculateMatchScore(asset, q, holdingSymbols.has(asset.symbol));
    
    // Only include if there's some relevance
    if (score > 0) {
      results.push({
        symbol: asset.symbol,
        name: asset.name,
        type: asset.type,
        assetClass: asset.assetClass,
        category: asset.category,
        source: holdingSymbols.has(asset.symbol) ? 'holding' : 'local',
        matchScore: score,
      });
      seen.add(asset.symbol);
    }
  }
  
  // Sort by score (descending) and limit
  return results
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit);
}

/**
 * Search API with caching and rate limit handling
 */
async function searchApiWithCache(
  query: string,
  abortSignal?: AbortSignal
): Promise<{ results: FinnhubSearchResult[]; rateLimited: boolean; error: boolean }> {
  const cacheKey = query.toLowerCase().trim();
  const now = Date.now();
  
  // Check cache first
  const cached = searchCache.get(cacheKey);
  if (cached && (now - cached.timestamp) < SEARCH_CACHE_TTL) {
    return { results: cached.results as unknown as FinnhubSearchResult[], rateLimited: false, error: false };
  }
  
  // Check if we're rate limited
  if (now < rateLimitedUntil) {
    return { results: [], rateLimited: true, error: false };
  }
  
  try {
    // Make API call
    const response = await searchSymbolsApi(query);
    
    if (response.error?.includes('429') || response.error?.includes('rate')) {
      rateLimitedUntil = now + 60000; // Back off for 60 seconds
      return { results: [], rateLimited: true, error: false };
    }
    
    if (response.error) {
      return { results: [], rateLimited: false, error: true };
    }
    
    const results = response.data || [];
    
    // Cache results
    searchCache.set(cacheKey, { 
      results: results as unknown as SearchAssetResult[], 
      timestamp: now 
    });
    
    return { results, rateLimited: false, error: false };
  } catch (err) {
    if (abortSignal?.aborted) {
      return { results: [], rateLimited: false, error: false };
    }
    console.error('API search error:', err);
    return { results: [], rateLimited: false, error: true };
  }
}

/**
 * Known ETF/REIT/Bond symbols for classification fallback
 */
const KNOWN_ETF_SYMBOLS = new Set([
  'JEPI', 'JEPQ', 'SCHD', 'VYM', 'SPHD', 'DVY', 'HDV', 'DIVO', 'QYLD', 'XYLD',
  'VOO', 'VTI', 'QQQ', 'SPY', 'IVV', 'VIG', 'VUG', 'VTV', 'VXUS', 'VEA',
  'VWO', 'BND', 'AGG', 'TLT', 'IEF', 'LQD', 'HYG', 'VCIT', 'VCSH', 'BSV',
  'VNQ', 'VNQI', 'SCHH', 'IYR', 'XLRE', 'RWR', 'VHT', 'XLV', 'XLF', 'XLE',
  'XLK', 'XLI', 'XLP', 'XLY', 'XLB', 'XLU', 'ARKK', 'ARKW', 'ARKG', 'ARKF',
]);

const KNOWN_BOND_SYMBOLS = new Set([
  'BND', 'AGG', 'TLT', 'IEF', 'LQD', 'HYG', 'VCIT', 'VCSH', 'BSV', 'BIV',
  'GOVT', 'MUB', 'TIP', 'SHY', 'SCHZ', 'BNDX', 'EMB', 'JNK', 'VGIT', 'VGLT',
]);

const KNOWN_REIT_SYMBOLS = new Set([
  'VNQ', 'O', 'SPG', 'AMT', 'PLD', 'CCI', 'EQIX', 'DLR', 'PSA', 'EXR',
  'WELL', 'AVB', 'EQR', 'SCHH', 'IYR', 'RWR', 'XLRE', 'STAG', 'NNN', 'WPC',
]);

function detectAssetClass(type: string, symbol: string): AssetClass {
  const upperSymbol = symbol.toUpperCase();
  
  if (KNOWN_BOND_SYMBOLS.has(upperSymbol)) return 'bond';
  if (KNOWN_REIT_SYMBOLS.has(upperSymbol)) return 'reit';
  if (KNOWN_ETF_SYMBOLS.has(upperSymbol)) return 'etf';
  
  const lower = type.toLowerCase();
  if (lower.includes('bond')) return 'bond';
  if (lower.includes('reit')) return 'reit';
  if (lower.includes('etf') || lower.includes('etp')) return 'etf';
  
  return 'stock';
}

/**
 * Hybrid search: local first (instant), then API (debounced)
 * Returns local results immediately, API results when ready
 */
export async function hybridSearch(
  query: string,
  holdings: Holding[] = [],
  options: {
    includeApi?: boolean;
    limit?: number;
    abortSignal?: AbortSignal;
  } = {}
): Promise<{
  results: SearchAssetResult[];
  isLoading: boolean;
  isRateLimited: boolean;
  hasError: boolean;
}> {
  const { includeApi = true, limit = 15, abortSignal } = options;
  
  if (!query || query.trim().length < 1) {
    return { results: [], isLoading: false, isRateLimited: false, hasError: false };
  }
  
  const q = query.trim();
  
  // Get local results first (instant)
  const localResults = searchLocalCatalog(q, holdings, limit);
  const seenSymbols = new Set(localResults.map(r => r.symbol));
  
  // If query is too short for API, return local only
  if (q.length < 2 || !includeApi) {
    return { results: localResults, isLoading: false, isRateLimited: false, hasError: false };
  }
  
  // Fetch API results
  const { results: apiResults, rateLimited, error } = await searchApiWithCache(q, abortSignal);
  
  if (abortSignal?.aborted) {
    return { results: localResults, isLoading: false, isRateLimited: false, hasError: false };
  }
  
  // Merge API results (deduplicated)
  const mergedResults = [...localResults];
  
  for (const apiResult of apiResults) {
    if (seenSymbols.has(apiResult.symbol)) continue;
    
    const assetClass = (apiResult.assetClass as AssetClass) || detectAssetClass(apiResult.type, apiResult.symbol);
    
    mergedResults.push({
      symbol: apiResult.symbol,
      name: apiResult.name,
      type: apiResult.type,
      assetClass,
      source: 'api',
      matchScore: calculateMatchScore(apiResult, q, false),
    });
    seenSymbols.add(apiResult.symbol);
  }
  
  // Re-sort merged results and limit
  const finalResults = mergedResults
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit);
  
  return {
    results: finalResults,
    isLoading: false,
    isRateLimited: rateLimited,
    hasError: error,
  };
}

/**
 * Check if we're currently rate limited
 */
export function isRateLimited(): boolean {
  return Date.now() < rateLimitedUntil;
}

/**
 * Clear the search cache (useful for testing)
 */
export function clearSearchCache(): void {
  searchCache.clear();
}

/**
 * Highlight matched portions of text
 * Returns array of { text: string, highlighted: boolean } segments
 */
export function highlightMatch(
  text: string,
  query: string
): { text: string; highlighted: boolean }[] {
  if (!query || query.length < 1) {
    return [{ text, highlighted: false }];
  }
  
  const q = query.toLowerCase();
  const lowerText = text.toLowerCase();
  const segments: { text: string; highlighted: boolean }[] = [];
  
  let lastIndex = 0;
  let matchIndex = lowerText.indexOf(q);
  
  while (matchIndex !== -1) {
    // Add non-highlighted segment before match
    if (matchIndex > lastIndex) {
      segments.push({
        text: text.slice(lastIndex, matchIndex),
        highlighted: false,
      });
    }
    
    // Add highlighted segment
    segments.push({
      text: text.slice(matchIndex, matchIndex + q.length),
      highlighted: true,
    });
    
    lastIndex = matchIndex + q.length;
    matchIndex = lowerText.indexOf(q, lastIndex);
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    segments.push({
      text: text.slice(lastIndex),
      highlighted: false,
    });
  }
  
  return segments.length > 0 ? segments : [{ text, highlighted: false }];
}
