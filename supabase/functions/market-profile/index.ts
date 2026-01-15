/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// In-memory cache
const cache = new Map<string, { data: unknown; expiry: number }>();

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

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
    const cacheKey = `profile:${symbol}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      console.log(`Cache hit for profile ${symbol}`);
      return new Response(
        JSON.stringify(cached.data),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetching profile for ${symbol} from Finnhub`);
    
    const response = await fetch(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${FINNHUB_API_KEY}`
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
        JSON.stringify({ error: 'Failed to fetch profile data' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();

    // Profile might be empty for some symbols
    if (!data || !data.name) {
      console.log(`No profile data available for ${symbol}`);
      return new Response(
        JSON.stringify({ 
          symbol, 
          name: null, 
          exchange: null, 
          currency: null, 
          industry: null, 
          logoUrl: null, 
          country: null 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const normalizedData = {
      symbol,
      name: data.name ?? null,
      exchange: data.exchange ?? null,
      currency: data.currency ?? null,
      industry: data.finnhubIndustry ?? null,
      logoUrl: data.logo ?? null,
      country: data.country ?? null,
    };

    // Cache the result
    cache.set(cacheKey, {
      data: normalizedData,
      expiry: Date.now() + CACHE_TTL_MS,
    });

    console.log(`Profile fetched successfully for ${symbol}`);

    return new Response(
      JSON.stringify(normalizedData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in market-profile function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
