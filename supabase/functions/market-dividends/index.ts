/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// In-memory cache
const cache = new Map<string, { data: unknown; expiry: number }>();

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface DividendPayment {
  symbol: string;
  amount: number;
  exDate: string;      // Ex-dividend date
  payDate: string;     // Payment date
  recordDate: string;  // Record date
  currency: string;
}

export interface DividendInfo {
  symbol: string;
  dividends: DividendPayment[];
  annualDividend: number | null;  // Estimated annual dividend per share
  dividendYield: number | null;   // Current yield percentage
  frequency: string | null;       // monthly, quarterly, semi-annual, annual
}

// Detect payment frequency based on dividend history
function detectFrequency(dividends: DividendPayment[]): string | null {
  if (dividends.length < 2) return null;
  
  // Sort by pay date
  const sorted = [...dividends].sort((a, b) => 
    new Date(a.payDate).getTime() - new Date(b.payDate).getTime()
  );
  
  // Calculate average gap between payments
  let totalGapDays = 0;
  for (let i = 1; i < sorted.length; i++) {
    const gap = new Date(sorted[i].payDate).getTime() - new Date(sorted[i-1].payDate).getTime();
    totalGapDays += gap / (1000 * 60 * 60 * 24);
  }
  
  const avgGap = totalGapDays / (sorted.length - 1);
  
  if (avgGap < 45) return 'monthly';
  if (avgGap < 100) return 'quarterly';
  if (avgGap < 200) return 'semi-annual';
  return 'annual';
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
    const cacheKey = `dividends:${symbol}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      console.log(`Cache hit for dividends ${symbol}`);
      return new Response(
        JSON.stringify(cached.data),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetching dividend data for ${symbol}`);

    // Fetch last 2 years of dividend history
    const now = new Date();
    const twoYearsAgo = new Date(now);
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    
    const fromDate = twoYearsAgo.toISOString().split('T')[0];
    const toDate = now.toISOString().split('T')[0];
    
    const response = await fetch(
      `https://finnhub.io/api/v1/stock/dividend?symbol=${symbol}&from=${fromDate}&to=${toDate}&token=${FINNHUB_API_KEY}`
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
        JSON.stringify({ error: 'Failed to fetch dividends' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    
    // Finnhub returns array of dividend objects
    const dividends: DividendPayment[] = (data || []).map((d: {
      symbol: string;
      amount: number;
      date: string;
      payDate: string;
      recordDate: string;
      currency: string;
    }) => ({
      symbol: d.symbol || symbol,
      amount: d.amount || 0,
      exDate: d.date || '',
      payDate: d.payDate || d.date || '',
      recordDate: d.recordDate || '',
      currency: d.currency || 'USD',
    }));

    // Sort by pay date descending (most recent first)
    dividends.sort((a, b) => 
      new Date(b.payDate).getTime() - new Date(a.payDate).getTime()
    );

    // Calculate annual dividend (sum of last 4 quarterly or 12 monthly payments)
    let annualDividend: number | null = null;
    if (dividends.length > 0) {
      // Get dividends from the last year
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      
      const lastYearDividends = dividends.filter(d => 
        new Date(d.payDate) >= oneYearAgo
      );
      
      if (lastYearDividends.length > 0) {
        annualDividend = lastYearDividends.reduce((sum, d) => sum + d.amount, 0);
      }
    }

    const frequency = detectFrequency(dividends);

    const result: DividendInfo = {
      symbol,
      dividends,
      annualDividend,
      dividendYield: null, // Will be calculated client-side with current price
      frequency,
    };

    // Cache the result
    cache.set(cacheKey, {
      data: result,
      expiry: Date.now() + CACHE_TTL_MS,
    });

    console.log(`Dividend data returned for ${symbol}: ${dividends.length} payments`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in market-dividends function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});