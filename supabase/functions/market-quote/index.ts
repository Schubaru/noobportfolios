/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// In-memory cache (resets on cold start, but effective for warm instances)
const cache = new Map<string, { data: unknown; expiry: number }>();

const CACHE_TTL_SECONDS = 10;
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 500;

// Helper function to delay execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Retry with exponential backoff
async function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url);
      
      // If rate limited, wait and retry
      if (response.status === 429 && attempt < retries - 1) {
        const waitTime = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
        console.log(`Rate limited, retrying in ${waitTime}ms (attempt ${attempt + 1}/${retries})`);
        await delay(waitTime);
        continue;
      }
      
      // If server error (500-599) and not last attempt, retry
      if (response.status >= 500 && response.status < 600 && attempt < retries - 1) {
        const waitTime = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
        console.log(`Server error ${response.status}, retrying in ${waitTime}ms (attempt ${attempt + 1}/${retries})`);
        await delay(waitTime);
        continue;
      }
      
      return response;
    } catch (error) {
      if (attempt === retries - 1) {
        throw error;
      }
      const waitTime = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
      console.log(`Network error, retrying in ${waitTime}ms (attempt ${attempt + 1}/${retries}):`, error);
      await delay(waitTime);
    }
  }
  
  throw new Error('Max retries exceeded');
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
    
    const response = await fetchWithRetry(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`
    );

    if (!response.ok) {
      console.error(`Finnhub error after retries: ${response.status}`);
      
      // If we have cached data (even if expired), return it as fallback
      if (cached) {
        console.log(`Returning stale cache for ${symbol} due to API error`);
        return new Response(
          JSON.stringify(cached.data),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache-Status': 'stale' } }
        );
      }
      
      // No cache available, return error
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limited. Please retry after a short delay.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        return new Response(
          JSON.stringify({ error: 'Failed to fetch quote data' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
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
