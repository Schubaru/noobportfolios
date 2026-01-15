/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// In-memory cache
const cache = new Map<string, { data: unknown; expiry: number }>();

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

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
    const results = (data.result || [])
      .filter((item: { symbol: string; type: string }) => {
        // Filter to US stocks primarily
        return item.symbol && !item.symbol.includes('.') && item.type === 'Common Stock';
      })
      .slice(0, 10)
      .map((item: { symbol: string; description: string; type: string }) => ({
        symbol: item.symbol,
        name: item.description,
        type: item.type,
      }));

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
