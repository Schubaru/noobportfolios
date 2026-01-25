/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Curated universe of growth-friendly assets for new traders
// Mix of large-cap stocks + broad ETFs (50-200 symbols)
const CANDIDATE_UNIVERSE = [
  // Broad Market ETFs (must have at least 1)
  'VOO', 'VTI', 'IVV', 'SPY',
  // Nasdaq/Growth ETFs
  'QQQ', 'VUG', 'SCHG', 'IWF',
  // Large-Cap Tech
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'AVGO', 'CRM', 'ADBE', 'ORCL', 'CSCO', 'AMD', 'INTC',
  // Healthcare
  'JNJ', 'UNH', 'PFE', 'ABBV', 'MRK', 'LLY', 'TMO', 'ABT',
  // Financial
  'JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'BLK', 'AXP',
  // Consumer
  'WMT', 'PG', 'KO', 'PEP', 'COST', 'MCD', 'NKE', 'SBUX', 'HD', 'LOW',
  // Industrial
  'CAT', 'DE', 'UPS', 'HON', 'GE', 'MMM', 'RTX', 'LMT',
  // Energy
  'XOM', 'CVX', 'COP', 'SLB', 'EOG',
  // Communication
  'DIS', 'NFLX', 'CMCSA', 'VZ', 'T',
  // Dividend ETFs
  'SCHD', 'VYM', 'DVY',
];

// Fallback picks if API fails
const FALLBACK_PICKS = [
  { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', assetClass: 'etf', sector: 'Broad Market' },
  { symbol: 'AAPL', name: 'Apple Inc.', assetClass: 'stock', sector: 'Technology' },
  { symbol: 'MSFT', name: 'Microsoft Corp.', assetClass: 'stock', sector: 'Technology' },
  { symbol: 'JNJ', name: 'Johnson & Johnson', assetClass: 'stock', sector: 'Healthcare' },
  { symbol: 'JPM', name: 'JPMorgan Chase', assetClass: 'stock', sector: 'Financial' },
];

const BROAD_MARKET_ETFS = new Set(['VOO', 'VTI', 'IVV', 'SPY']);
const GROWTH_ETFS = new Set(['QQQ', 'VUG', 'SCHG', 'IWF']);
const ALL_ETFS = new Set([...BROAD_MARKET_ETFS, ...GROWTH_ETFS, 'SCHD', 'VYM', 'DVY']);

interface AssetScore {
  symbol: string;
  name: string;
  score: number;
  assetClass: string;
  sector: string;
  marketCap: number;
  price: number;
  metrics: {
    marketCap: number;
    peRatio: number | null;
    revenueGrowth: number | null;
    roe: number | null;
    beta: number | null;
  };
}

async function fetchQuote(symbol: string, apiKey: string): Promise<{ c: number; pc: number } | null> {
  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`
    );
    if (!response.ok) return null;
    const data = await response.json();
    if (!data.c || data.c === 0) return null;
    return data;
  } catch {
    return null;
  }
}

async function fetchMetrics(symbol: string, apiKey: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/stock/metric?symbol=${symbol}&metric=all&token=${apiKey}`
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data.metric || null;
  } catch {
    return null;
  }
}

async function fetchProfile(symbol: string, apiKey: string): Promise<{ name: string; finnhubIndustry: string; marketCapitalization: number } | null> {
  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${apiKey}`
    );
    if (!response.ok) return null;
    const data = await response.json();
    if (!data.name) return null;
    return data;
  } catch {
    return null;
  }
}

function calculateScore(
  symbol: string,
  quote: { c: number; pc: number },
  metrics: Record<string, unknown> | null,
  profile: { marketCapitalization: number; finnhubIndustry: string } | null
): number {
  let score = 50; // Base score

  const marketCap = profile?.marketCapitalization || (metrics?.marketCapitalization as number) || 0;
  const peRatio = (metrics?.peNormalizedAnnual as number) || (metrics?.peTTM as number) || null;
  const roe = (metrics?.roeTTM as number) || null;
  const revenueGrowth = (metrics?.revenueGrowthTTMYoy as number) || null;
  const beta = (metrics?.beta as number) || null;

  // Market cap preference (larger = better for beginners)
  if (marketCap > 500) score += 15; // > $500B
  else if (marketCap > 100) score += 10; // > $100B
  else if (marketCap > 50) score += 5; // > $50B
  else if (marketCap < 10) score -= 10; // < $10B (too small)

  // P/E ratio (reasonable valuation preferred)
  if (peRatio !== null) {
    if (peRatio > 0 && peRatio < 15) score += 10; // Value
    else if (peRatio >= 15 && peRatio <= 30) score += 5; // Reasonable
    else if (peRatio > 50) score -= 10; // Very expensive
    else if (peRatio > 100) score -= 20; // Extremely expensive
    else if (peRatio < 0) score -= 5; // Negative earnings
  }

  // Revenue growth (positive is good)
  if (revenueGrowth !== null) {
    if (revenueGrowth > 20) score += 15;
    else if (revenueGrowth > 10) score += 10;
    else if (revenueGrowth > 0) score += 5;
    else if (revenueGrowth < -10) score -= 10;
  }

  // ROE (profitability)
  if (roe !== null) {
    if (roe > 20) score += 10;
    else if (roe > 10) score += 5;
    else if (roe < 0) score -= 10;
  }

  // Beta (volatility penalty for very high beta)
  if (beta !== null) {
    if (beta > 2) score -= 15; // Very volatile
    else if (beta > 1.5) score -= 5; // Somewhat volatile
    else if (beta >= 0.8 && beta <= 1.2) score += 5; // Market-like
  }

  // Bonus for broad market ETFs (stability)
  if (BROAD_MARKET_ETFS.has(symbol)) score += 20;
  if (GROWTH_ETFS.has(symbol)) score += 10;

  return score;
}

async function getTopGrowthPicks(apiKey: string): Promise<AssetScore[]> {
  console.log('Starting to fetch data for candidate universe...');
  
  const results: AssetScore[] = [];
  const batchSize = 10;
  
  // Process in batches to avoid rate limiting
  for (let i = 0; i < CANDIDATE_UNIVERSE.length; i += batchSize) {
    const batch = CANDIDATE_UNIVERSE.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (symbol) => {
      const [quote, metrics, profile] = await Promise.all([
        fetchQuote(symbol, apiKey),
        fetchMetrics(symbol, apiKey),
        fetchProfile(symbol, apiKey),
      ]);
      
      if (!quote || quote.c === 0) {
        console.log(`Skipping ${symbol}: no quote data`);
        return null;
      }
      
      const score = calculateScore(symbol, quote, metrics, profile);
      const isEtf = ALL_ETFS.has(symbol);
      
      return {
        symbol,
        name: profile?.name || symbol,
        score,
        assetClass: isEtf ? 'etf' : 'stock',
        sector: profile?.finnhubIndustry || 'Unknown',
        marketCap: profile?.marketCapitalization || 0,
        price: quote.c,
        metrics: {
          marketCap: profile?.marketCapitalization || 0,
          peRatio: (metrics?.peNormalizedAnnual as number) || (metrics?.peTTM as number) || null,
          revenueGrowth: (metrics?.revenueGrowthTTMYoy as number) || null,
          roe: (metrics?.roeTTM as number) || null,
          beta: (metrics?.beta as number) || null,
        },
      } as AssetScore;
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults.filter((r): r is AssetScore => r !== null));
    
    // Small delay between batches to respect rate limits
    if (i + batchSize < CANDIDATE_UNIVERSE.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  console.log(`Fetched data for ${results.length} assets`);
  
  // Sort by score descending
  results.sort((a, b) => b.score - a.score);
  
  // Apply diversification constraints
  const selected: AssetScore[] = [];
  const sectorCount: Record<string, number> = {};
  let hasMarketEtf = false;
  let etfCount = 0;
  
  for (const asset of results) {
    if (selected.length >= 5) break;
    
    // Check sector limit (max 2 per sector)
    const sector = asset.sector;
    if ((sectorCount[sector] || 0) >= 2) continue;
    
    // Don't allow more than 2 ETFs (but ensure at least 1 market ETF)
    if (asset.assetClass === 'etf') {
      if (etfCount >= 2 && !BROAD_MARKET_ETFS.has(asset.symbol)) continue;
    }
    
    selected.push(asset);
    sectorCount[sector] = (sectorCount[sector] || 0) + 1;
    if (BROAD_MARKET_ETFS.has(asset.symbol) || GROWTH_ETFS.has(asset.symbol)) {
      hasMarketEtf = true;
    }
    if (asset.assetClass === 'etf') etfCount++;
  }
  
  // Ensure we have at least one broad market ETF
  if (!hasMarketEtf && selected.length === 5) {
    // Replace lowest scored non-ETF with VOO
    const voo = results.find(r => r.symbol === 'VOO');
    if (voo) {
      const nonEtfIndex = selected.findIndex(s => s.assetClass !== 'etf');
      if (nonEtfIndex !== -1) {
        selected[nonEtfIndex] = voo;
      }
    }
  }
  
  return selected;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const FINNHUB_API_KEY = Deno.env.get('FINNHUB_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!FINNHUB_API_KEY) {
      console.error('Missing FINNHUB_API_KEY');
      return new Response(
        JSON.stringify({ picks: FALLBACK_PICKS, source: 'fallback', error: 'Missing API key' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Missing Supabase credentials');
      return new Response(
        JSON.stringify({ picks: FALLBACK_PICKS, source: 'fallback', error: 'Missing Supabase credentials' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const today = new Date().toISOString().split('T')[0];

    // Check cache first
    const { data: cachedPicks } = await supabase
      .from('daily_picks')
      .select('*')
      .eq('pick_date', today)
      .maybeSingle();

    if (cachedPicks) {
      console.log('Returning cached picks for', today);
      return new Response(
        JSON.stringify({ picks: cachedPicks.tickers, source: 'cache', date: today }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch fresh picks
    console.log('Fetching fresh picks for', today);
    let picks: AssetScore[];
    
    try {
      picks = await getTopGrowthPicks(FINNHUB_API_KEY);
      
      if (picks.length < 5) {
        console.log('Not enough picks from API, using fallback');
        picks = FALLBACK_PICKS.map(p => ({
          ...p,
          score: 50,
          marketCap: 0,
          price: 0,
          metrics: { marketCap: 0, peRatio: null, revenueGrowth: null, roe: null, beta: null },
        }));
      }
    } catch (error) {
      console.error('Error fetching picks:', error);
      picks = FALLBACK_PICKS.map(p => ({
        ...p,
        score: 50,
        marketCap: 0,
        price: 0,
        metrics: { marketCap: 0, peRatio: null, revenueGrowth: null, roe: null, beta: null },
      }));
    }

    // Cache the picks (upsert to handle race conditions)
    const { error: cacheError } = await supabase
      .from('daily_picks')
      .upsert({
        pick_date: today,
        tickers: picks,
        scoring_snapshot: { 
          candidateCount: CANDIDATE_UNIVERSE.length,
          timestamp: new Date().toISOString(),
        },
      }, { onConflict: 'pick_date' });

    if (cacheError) {
      console.error('Error caching picks:', cacheError);
    }

    return new Response(
      JSON.stringify({ picks, source: 'fresh', date: today }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in get-top-growth-picks:', error);
    return new Response(
      JSON.stringify({ 
        picks: FALLBACK_PICKS.map(p => ({
          ...p,
          score: 50,
          marketCap: 0,
          price: 0,
          metrics: { marketCap: 0, peRatio: null, revenueGrowth: null, roe: null, beta: null },
        })), 
        source: 'fallback', 
        error: 'Internal server error' 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
