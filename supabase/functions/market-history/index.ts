/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// In-memory cache (warm instances only)
const cache = new Map<string, { data: unknown; expiry: number }>();

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 500;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url);

      if (response.status === 429 && attempt < retries - 1) {
        const wait = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
        console.log(`Rate limited, retrying in ${wait}ms (attempt ${attempt + 1}/${retries})`);
        await delay(wait);
        continue;
      }

      if (response.status >= 500 && response.status < 600 && attempt < retries - 1) {
        const wait = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
        console.log(`Server error ${response.status}, retrying in ${wait}ms (attempt ${attempt + 1}/${retries})`);
        await delay(wait);
        continue;
      }

      return response;
    } catch (error) {
      if (attempt === retries - 1) throw error;
      const wait = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
      console.log(`Network error, retrying in ${wait}ms (attempt ${attempt + 1}/${retries}):`, error);
      await delay(wait);
    }
  }

  throw new Error('Max retries exceeded');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const FINNHUB_API_KEY = Deno.env.get('FINNHUB_API_KEY');
    if (!FINNHUB_API_KEY) {
      console.error('Missing FINNHUB_API_KEY');
      return new Response(
        JSON.stringify({ error: 'Missing FINNHUB_API_KEY in Secrets.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const url = new URL(req.url);
    const symbol = url.searchParams.get('symbol')?.toUpperCase();
    let resolution = url.searchParams.get('resolution') || 'D';
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    if (!symbol || !from || !to) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: symbol, from, to' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Finnhub free tier only supports daily candles.
    // Always use 'D' resolution—intraday requires a premium subscription.
    if (resolution !== 'D') {
      console.log(`Requested resolution ${resolution} not supported on free tier; falling back to D`);
      resolution = 'D';
    }

    const cacheKey = `candles:${symbol}:${resolution}:${from}:${to}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      console.log(`Cache hit for ${cacheKey}`);
      return new Response(JSON.stringify(cached.data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Fetching candles for ${symbol} (${resolution}) from=${from} to=${to}`);

    const finnhubUrl = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=${encodeURIComponent(resolution)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&token=${FINNHUB_API_KEY}`;
    const response = await fetchWithRetry(finnhubUrl);

    if (!response.ok) {
      console.error(`Finnhub responded with status ${response.status}`);
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limited. Please retry after a short delay.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ error: 'Failed to fetch historical price data' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();

    // Finnhub candle API: s == "ok" when data exists.
    if (!data || data.s !== 'ok' || !Array.isArray(data.t) || !Array.isArray(data.c)) {
      console.warn(`No candle data for ${symbol}:`, data?.s);
      return new Response(
        JSON.stringify({ error: `No historical data available for: ${symbol}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const candles = data.t.map((t: number, i: number) => ({
      timestamp: t * 1000,
      close: data.c[i],
    }));

    console.log(`Returning ${candles.length} candles for ${symbol}`);

    const normalized = { symbol, resolution, candles };

    const ttlMs = 60 * 60_000; // 1 hour cache for daily candles
    cache.set(cacheKey, { data: normalized, expiry: Date.now() + ttlMs });

    return new Response(JSON.stringify(normalized), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in market-history function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
