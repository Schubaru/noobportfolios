/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GrowthPick {
  symbol: string;
  name: string;
  assetClass: string;
  sector: string;
  price: number;
  score: number;
}

const FALLBACK_PICKS: GrowthPick[] = [
  { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', assetClass: 'etf', sector: 'Broad Market', price: 500, score: 80 },
  { symbol: 'AAPL', name: 'Apple Inc.', assetClass: 'stock', sector: 'Technology', price: 190, score: 75 },
  { symbol: 'MSFT', name: 'Microsoft Corp.', assetClass: 'stock', sector: 'Technology', price: 420, score: 75 },
  { symbol: 'JNJ', name: 'Johnson & Johnson', assetClass: 'stock', sector: 'Healthcare', price: 150, score: 70 },
  { symbol: 'JPM', name: 'JPMorgan Chase', assetClass: 'stock', sector: 'Financial', price: 200, score: 70 },
];

async function fetchCurrentPrice(symbol: string, apiKey: string): Promise<number | null> {
  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data.c || null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const FINNHUB_API_KEY = Deno.env.get('FINNHUB_API_KEY');
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Missing Supabase credentials');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { portfolioId } = await req.json();
    if (!portfolioId) {
      return new Response(
        JSON.stringify({ error: 'Portfolio ID required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify user owns this portfolio and it's an example
    const { data: portfolio, error: portfolioError } = await supabaseAdmin
      .from('portfolios')
      .select('*')
      .eq('id', portfolioId)
      .eq('user_id', user.id)
      .eq('is_example', true)
      .maybeSingle();

    if (portfolioError || !portfolio) {
      return new Response(
        JSON.stringify({ error: 'Portfolio not found or not an example portfolio' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Regenerating portfolio:', portfolioId);

    // Get fresh picks (force refresh by calling the function)
    let picks: GrowthPick[] = FALLBACK_PICKS;
    
    try {
      const picksResponse = await fetch(`${SUPABASE_URL}/functions/v1/get-top-growth-picks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (picksResponse.ok) {
        const picksData = await picksResponse.json();
        if (picksData.picks && picksData.picks.length >= 5) {
          picks = picksData.picks;
        }
      }
    } catch (error) {
      console.error('Error fetching picks:', error);
    }

    // Get current prices
    if (FINNHUB_API_KEY) {
      const pricePromises = picks.map(async (pick) => {
        const price = await fetchCurrentPrice(pick.symbol, FINNHUB_API_KEY);
        return { ...pick, price: price || pick.price || 100 };
      });
      picks = await Promise.all(pricePromises);
    }

    const startingCash = 10000;
    const allocationPerAsset = startingCash / 5;

    // Clear existing data
    await supabaseAdmin.from('holdings').delete().eq('portfolio_id', portfolioId);
    await supabaseAdmin.from('transactions').delete().eq('portfolio_id', portfolioId);
    await supabaseAdmin.from('value_history').delete().eq('portfolio_id', portfolioId);
    await supabaseAdmin.from('dividend_history').delete().eq('portfolio_id', portfolioId);

    // Create new holdings and transactions
    const holdings: Array<{
      portfolio_id: string;
      symbol: string;
      name: string;
      shares: number;
      avg_cost: number;
      asset_class: string;
    }> = [];
    
    const transactions: Array<{
      portfolio_id: string;
      symbol: string;
      name: string;
      type: string;
      shares: number;
      price: number;
      total: number;
    }> = [];

    let totalSpent = 0;

    for (const pick of picks) {
      const price = pick.price || 100;
      const shares = Math.floor(allocationPerAsset / price);
      
      if (shares <= 0) continue;
      
      const total = shares * price;
      totalSpent += total;

      holdings.push({
        portfolio_id: portfolioId,
        symbol: pick.symbol,
        name: pick.name,
        shares,
        avg_cost: price,
        asset_class: pick.assetClass,
      });

      transactions.push({
        portfolio_id: portfolioId,
        symbol: pick.symbol,
        name: pick.name,
        type: 'buy',
        shares,
        price,
        total,
      });
    }

    await supabaseAdmin.from('holdings').insert(holdings);
    await supabaseAdmin.from('transactions').insert(transactions);

    const remainingCash = startingCash - totalSpent;
    
    await supabaseAdmin
      .from('portfolios')
      .update({ 
        cash: remainingCash,
        starting_cash: startingCash,
        updated_at: new Date().toISOString(),
      })
      .eq('id', portfolioId);

    const totalValue = remainingCash + holdings.reduce((sum, h) => sum + h.shares * h.avg_cost, 0);
    await supabaseAdmin.from('value_history').insert({
      portfolio_id: portfolioId,
      value: totalValue,
    });

    console.log('Portfolio regenerated:', {
      portfolioId,
      holdings: holdings.length,
      totalSpent,
      remainingCash,
    });

    return new Response(
      JSON.stringify({ 
        message: 'Portfolio regenerated',
        portfolioId,
        picks: picks.map(p => ({ symbol: p.symbol, name: p.name })),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in regenerate-portfolio:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
