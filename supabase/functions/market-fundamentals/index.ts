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
    const symbol = url.searchParams.get('symbol')?.toUpperCase();

    if (!symbol) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: symbol' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check cache
    const cacheKey = `fundamentals:${symbol}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      console.log(`Cache hit for fundamentals ${symbol}`);
      return new Response(
        JSON.stringify(cached.data),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetching fundamentals for ${symbol} from Finnhub`);
    
    const response = await fetch(
      `https://finnhub.io/api/v1/stock/metric?symbol=${symbol}&metric=all&token=${FINNHUB_API_KEY}`
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
        JSON.stringify({ error: 'Failed to fetch fundamentals data' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();

    // Extract only the fields we need from the metric object
    const metrics = data.metric || {};
    
    const normalizedData = {
      symbol,
      marketCap: metrics.marketCapitalization ?? null,
      peTTM: metrics.peNormalizedAnnual ?? metrics.peTTM ?? null,
      epsTTM: metrics.epsNormalizedAnnual ?? metrics.epsTTM ?? null,
      dividendYieldTTM: metrics.dividendYieldIndicatedAnnual ?? null,
      dividendsPerShareTTM: metrics.dividendsPerShareTTM ?? null,
      week52High: metrics['52WeekHigh'] ?? null,
      week52Low: metrics['52WeekLow'] ?? null,
      beta: metrics.beta ?? null,
      avgVolume10d: metrics['10DayAverageTradingVolume'] ?? null,
    };

    // Cache the result
    cache.set(cacheKey, {
      data: normalizedData,
      expiry: Date.now() + CACHE_TTL_MS,
    });

    console.log(`Fundamentals fetched successfully for ${symbol}`);

    return new Response(
      JSON.stringify(normalizedData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in market-fundamentals function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
