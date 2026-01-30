/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// In-memory cache (resets on cold start, but effective for warm instances)
const cache = new Map<string, { data: unknown; expiry: number }>();

const CACHE_TTL_SECONDS = 120; // 2 minutes cache
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

interface QuoteData {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  dayHigh: number;
  dayLow: number;
  dayOpen: number;
  prevClose: number;
  timestamp: number;
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
    const symbolsParam = url.searchParams.get('symbols');

    if (!symbolsParam) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: symbols (comma-separated)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const symbols = symbolsParam.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    
    if (symbols.length === 0) {
      return new Response(
        JSON.stringify({ quotes: {} }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (symbols.length > 20) {
      return new Response(
        JSON.stringify({ error: 'Maximum 20 symbols per request' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Batch fetching quotes for: ${symbols.join(', ')}`);

    const quotes: Record<string, QuoteData> = {};
    const errors: Record<string, string> = {};
    const now = Date.now();

    // Process symbols sequentially to avoid rate limits
    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      
      // Check cache first
      const cacheKey = `quote:${symbol}`;
      const cached = cache.get(cacheKey);
      if (cached && cached.expiry > now) {
        console.log(`Cache hit for ${symbol}`);
        quotes[symbol] = cached.data as QuoteData;
        continue;
      }

      // Add delay between API calls (except for first one)
      if (i > 0) {
        await delay(150); // 150ms between requests
      }

      try {
        const response = await fetchWithRetry(
          `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`
        );

        if (!response.ok) {
          // Try to use stale cache if available
          if (cached) {
            console.log(`Using stale cache for ${symbol} due to API error`);
            quotes[symbol] = cached.data as QuoteData;
          } else {
            errors[symbol] = `API error: ${response.status}`;
          }
          continue;
        }

        const data = await response.json();

        if (!data || data.c === 0) {
          errors[symbol] = 'No data available';
          continue;
        }

        const normalizedData: QuoteData = {
          symbol,
          price: data.c,
          change: data.d,
          changePct: data.dp,
          dayHigh: data.h,
          dayLow: data.l,
          dayOpen: data.o,
          prevClose: data.pc,
          timestamp: data.t ? data.t * 1000 : now,
        };

        // Cache the result
        cache.set(cacheKey, {
          data: normalizedData,
          expiry: now + CACHE_TTL_SECONDS * 1000,
        });

        quotes[symbol] = normalizedData;
        console.log(`Fetched quote for ${symbol}: $${data.c}`);
      } catch (error) {
        console.error(`Error fetching ${symbol}:`, error);
        // Try stale cache
        if (cached) {
          quotes[symbol] = cached.data as QuoteData;
        } else {
          errors[symbol] = 'Fetch failed';
        }
      }
    }

    console.log(`Batch complete: ${Object.keys(quotes).length} quotes, ${Object.keys(errors).length} errors`);

    return new Response(
      JSON.stringify({ quotes, errors: Object.keys(errors).length > 0 ? errors : undefined }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in market-quote-batch function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
