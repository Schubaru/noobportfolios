/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// In-memory cache
const cache = new Map<string, { data: unknown; expiry: number }>();

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Asset type mappings from Finnhub types
function getAssetType(finnhubType: string, symbol: string): { type: string; assetClass: string } {
  const upperType = finnhubType.toUpperCase();
  const upperSymbol = symbol.toUpperCase();
  
  // ETF detection
  if (upperType.includes('ETP') || upperType.includes('ETF') || upperType === 'ETF') {
    return { type: 'ETF', assetClass: 'etf' };
  }
  
  // REIT detection (common REIT indicators in name/symbol)
  const reitSymbols = ['VNQ', 'O', 'SPG', 'AMT', 'PLD', 'CCI', 'EQIX', 'DLR', 'PSA', 'EXR', 'WELL', 'AVB', 'EQR', 'SCHH', 'IYR', 'RWR', 'XLRE'];
  if (reitSymbols.includes(upperSymbol)) {
    return { type: 'REIT', assetClass: 'reit' };
  }
  
  // Bond ETF detection
  const bondSymbols = ['BND', 'AGG', 'TLT', 'IEF', 'LQD', 'HYG', 'VCIT', 'VCSH', 'BSV', 'BIV', 'GOVT', 'MUB', 'TIP', 'SHY', 'SCHZ'];
  if (bondSymbols.includes(upperSymbol)) {
    return { type: 'Bond ETF', assetClass: 'bond' };
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
      .slice(0, 15) // Increased limit for better results
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
