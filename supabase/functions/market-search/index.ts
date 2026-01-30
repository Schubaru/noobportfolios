/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// In-memory cache
const cache = new Map<string, { data: unknown; expiry: number }>();

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Known ETF symbols that Finnhub may return as "COMMON STOCK"
const ETF_SYMBOLS = new Set([
  // Popular dividend/income ETFs
  'JEPI', 'JEPQ', 'SCHD', 'VYM', 'SPHD', 'DVY', 'HDV', 'DIVO', 'QYLD', 'XYLD',
  // Core index ETFs
  'VOO', 'VTI', 'QQQ', 'SPY', 'IVV', 'VIG', 'VUG', 'VTV', 'VXUS', 'VEA', 'VWO',
  // Sector ETFs
  'VHT', 'XLV', 'XLF', 'XLE', 'XLK', 'XLI', 'XLP', 'XLY', 'XLB', 'XLU',
  // ARK ETFs
  'ARKK', 'ARKW', 'ARKG', 'ARKF', 'ARKQ',
  // International
  'EFA', 'EEM', 'IEFA', 'IEMG',
]);

// Known Bond ETF symbols
const BOND_SYMBOLS = new Set([
  'BND', 'AGG', 'TLT', 'IEF', 'LQD', 'HYG', 'VCIT', 'VCSH', 'BSV', 'BIV',
  'GOVT', 'MUB', 'TIP', 'SHY', 'SCHZ', 'BNDX', 'EMB', 'JNK', 'VGIT', 'VGLT',
]);

// Known REIT symbols
const REIT_SYMBOLS = new Set([
  'VNQ', 'O', 'SPG', 'AMT', 'PLD', 'CCI', 'EQIX', 'DLR', 'PSA', 'EXR',
  'WELL', 'AVB', 'EQR', 'SCHH', 'IYR', 'RWR', 'XLRE', 'STAG', 'NNN', 'WPC',
  'VNQI', 'USRT', 'BBRE', 'REET',
]);

// Asset type mappings from Finnhub types
function getAssetType(finnhubType: string, symbol: string): { type: string; assetClass: string } {
  const upperType = finnhubType.toUpperCase();
  const upperSymbol = symbol.toUpperCase();
  
  // Check known symbol lists FIRST (most reliable - overrides Finnhub type)
  if (BOND_SYMBOLS.has(upperSymbol)) {
    return { type: 'Bond ETF', assetClass: 'bond' };
  }
  
  if (REIT_SYMBOLS.has(upperSymbol)) {
    return { type: 'REIT', assetClass: 'reit' };
  }
  
  if (ETF_SYMBOLS.has(upperSymbol)) {
    return { type: 'ETF', assetClass: 'etf' };
  }
  
  // Then check Finnhub type
  if (upperType.includes('ETP') || upperType.includes('ETF') || upperType === 'ETF') {
    return { type: 'ETF', assetClass: 'etf' };
  }
  
  // Common Stock
  if (upperType === 'COMMON STOCK' || upperType.includes('STOCK')) {
    return { type: 'Stock', assetClass: 'stock' };
  }
  
  // ADR
  if (upperType.includes('ADR')) {
    return { type: 'ADR', assetClass: 'stock' };
  }
  
  // Default to stock
  return { type: finnhubType || 'Stock', assetClass: 'stock' };
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const FINNHUB_API_KEY = Deno.env.get('FINNHUB_API_KEY');
    
    if (!FINNHUB_API_KEY) {
      console.error('Missing FINNHUB_API_KEY in secrets');
      return new Response(
        JSON.stringify({ error: 'Missing FINNHUB_API_KEY in Secrets.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const url = new URL(req.url);
    const query = url.searchParams.get('q')?.trim();

    if (!query || query.length < 1) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid query parameter: q' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check cache
    const cacheKey = `search:${query.toLowerCase()}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      console.log(`Cache hit for search "${query}"`);
      return new Response(
        JSON.stringify(cached.data),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Searching symbols for "${query}" from Finnhub`);
    
    const response = await fetch(
      `https://finnhub.io/api/v1/search?q=${encodeURIComponent(query)}&token=${FINNHUB_API_KEY}`
    );

    if (response.status === 429) {
      console.error('Rate limited by Finnhub');
      return new Response(
        JSON.stringify({ error: 'Rate limited. Please retry after a short delay.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!response.ok) {
      console.error(`Finnhub error: ${response.status}`);
      return new Response(
        JSON.stringify({ error: 'Failed to search symbols' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();

    // Finnhub returns { count, result: [{ description, displaySymbol, symbol, type }] }
    // Expanded filter to include ETFs, REITs, ADRs, and other tradeable securities
    const allowedTypes = [
      'COMMON STOCK',
      'ETP',      // Exchange Traded Products (ETFs)
      'ETF',
      'ADR',      // American Depositary Receipts
      'REIT',
      'UNIT',     // Fund units
    ];
    
    const results = (data.result || [])
      .filter((item: { symbol: string; type: string }) => {
        // Must have symbol
        if (!item.symbol) return false;
        
        // Filter out non-US exchanges (symbols with dots like .L, .T, etc.)
        // But allow some common formats
        if (item.symbol.includes('.') && !item.symbol.endsWith('.U')) return false;
        
        // Check if type is in allowed list
        const upperType = (item.type || '').toUpperCase();
        return allowedTypes.some(allowed => upperType.includes(allowed));
      })
      .slice(0, 25) // Increased limit for better client-side filtering
      .map((item: { symbol: string; description: string; type: string }) => {
        const { type, assetClass } = getAssetType(item.type, item.symbol);
        return {
          symbol: item.symbol,
          name: item.description,
          type,
          assetClass,
        };
      });

    // Cache the result
    cache.set(cacheKey, {
      data: { results },
      expiry: Date.now() + CACHE_TTL_MS,
    });

    console.log(`Search returned ${results.length} results for "${query}"`);

    return new Response(
      JSON.stringify({ results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in market-search function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
