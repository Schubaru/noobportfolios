/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// In-memory cache (resets on cold start, but effective for warm instances)
const cache = new Map<string, { data: unknown; expiry: number }>();

const CACHE_TTL_SECONDS = 10;

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
    const symbol = url.searchParams.get('symbol')?.toUpperCase();

    if (!symbol) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: symbol' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check cache
    const cacheKey = `quote:${symbol}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      console.log(`Cache hit for ${symbol}`);
      return new Response(
        JSON.stringify(cached.data),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetching quote for ${symbol} from Finnhub`);
    
    const response = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`
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
        JSON.stringify({ error: 'Failed to fetch quote data' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();

    // Finnhub returns { c, d, dp, h, l, o, pc, t } when valid
    // c = current price, d = change, dp = percent change, h = high, l = low, o = open, pc = prev close, t = timestamp
    if (!data || data.c === 0) {
      console.error(`Invalid symbol or no data for ${symbol}`);
      return new Response(
        JSON.stringify({ error: `Invalid symbol or no data available for: ${symbol}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const normalizedData = {
      symbol,
      price: data.c,
      change: data.d,
      changePct: data.dp,
      dayHigh: data.h,
      dayLow: data.l,
      dayOpen: data.o,
      prevClose: data.pc,
      timestamp: data.t ? data.t * 1000 : Date.now(),
    };

    // Cache the result
    cache.set(cacheKey, {
      data: normalizedData,
      expiry: Date.now() + CACHE_TTL_SECONDS * 1000,
    });

    console.log(`Quote fetched successfully for ${symbol}`);

    return new Response(
      JSON.stringify(normalizedData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in market-quote function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
