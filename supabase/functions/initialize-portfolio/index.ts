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

    // Get authorization header to identify user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with user's token
    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verify user
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Initializing portfolio for user:', user.id);

    // Use service role client for database operations
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check if user already has portfolios
    const { data: existingPortfolios, error: checkError } = await supabaseAdmin
      .from('portfolios')
      .select('id')
      .eq('user_id', user.id);

    if (checkError) {
      console.error('Error checking portfolios:', checkError);
      return new Response(
        JSON.stringify({ error: 'Database error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If user has portfolios, return early
    if (existingPortfolios && existingPortfolios.length > 0) {
      console.log('User already has portfolios, skipping initialization');
      return new Response(
        JSON.stringify({ message: 'User already has portfolios', initialized: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body for regenerate mode
    let regenerate = false;
    let existingPortfolioId: string | null = null;
    
    try {
      const body = await req.json();
      regenerate = body.regenerate === true;
      existingPortfolioId = body.portfolioId || null;
    } catch {
      // No body or invalid JSON, that's fine
    }

    // Get top growth picks
    let picks: GrowthPick[] = FALLBACK_PICKS;
    
    try {
      // Call the get-top-growth-picks function
      const picksResponse = await fetch(`${SUPABASE_URL}/functions/v1/get-top-growth-picks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (picksResponse.ok) {
        const picksData = await picksResponse.json();
        if (picksData.picks && picksData.picks.length >= 5) {
          picks = picksData.picks;
          console.log('Got picks from API:', picks.map(p => p.symbol).join(', '));
        }
      }
    } catch (error) {
      console.error('Error fetching picks, using fallback:', error);
    }

    // Get current prices for all picks
    if (FINNHUB_API_KEY) {
      const pricePromises = picks.map(async (pick) => {
        const price = await fetchCurrentPrice(pick.symbol, FINNHUB_API_KEY);
        return { ...pick, price: price || pick.price || 100 };
      });
      picks = await Promise.all(pricePromises);
    }

    const startingCash = 10000;
    const allocationPerAsset = startingCash / 5; // 20% each

    // Create or regenerate portfolio
    let portfolioId: string;

    if (regenerate && existingPortfolioId) {
      // Clear existing holdings and transactions for regenerate
      await supabaseAdmin.from('holdings').delete().eq('portfolio_id', existingPortfolioId);
      await supabaseAdmin.from('transactions').delete().eq('portfolio_id', existingPortfolioId);
      await supabaseAdmin.from('value_history').delete().eq('portfolio_id', existingPortfolioId);
      
      // Reset portfolio cash
      await supabaseAdmin
        .from('portfolios')
        .update({ cash: startingCash, updated_at: new Date().toISOString() })
        .eq('id', existingPortfolioId);
      
      portfolioId = existingPortfolioId;
      console.log('Regenerating portfolio:', portfolioId);
    } else {
      // Create new portfolio
      const { data: newPortfolio, error: createError } = await supabaseAdmin
        .from('portfolios')
        .insert({
          user_id: user.id,
          name: 'N00B Portfolio',
          starting_cash: startingCash,
          cash: startingCash,
          is_example: true,
          created_by_system: true,
        })
        .select('id')
        .single();

      if (createError || !newPortfolio) {
        console.error('Error creating portfolio:', createError);
        return new Response(
          JSON.stringify({ error: 'Failed to create portfolio' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      portfolioId = newPortfolio.id;
      console.log('Created portfolio:', portfolioId);
    }

    // Create holdings and transactions
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

    // Insert holdings
    const { error: holdingsError } = await supabaseAdmin
      .from('holdings')
      .insert(holdings);

    if (holdingsError) {
      console.error('Error creating holdings:', holdingsError);
    }

    // Insert transactions
    const { error: transactionsError } = await supabaseAdmin
      .from('transactions')
      .insert(transactions);

    if (transactionsError) {
      console.error('Error creating transactions:', transactionsError);
    }

    // Update cash
    const remainingCash = startingCash - totalSpent;
    await supabaseAdmin
      .from('portfolios')
      .update({ cash: remainingCash })
      .eq('id', portfolioId);

    // Close the initial cash_history row and insert post-trade row
    const tradeTime = new Date().toISOString();

    // Find and close latest open cash_history row by id
    const { data: openCashRow } = await supabaseAdmin
      .from('cash_history')
      .select('id')
      .eq('portfolio_id', portfolioId)
      .is('effective_to', null)
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (openCashRow) {
      await supabaseAdmin
        .from('cash_history')
        .update({ effective_to: tradeTime })
        .eq('id', openCashRow.id);
    }

    // Insert new cash_history row with remaining cash
    await supabaseAdmin.from('cash_history').insert({
      portfolio_id: portfolioId,
      amount: remainingCash,
      effective_from: tradeTime,
    });

    // Insert holdings_history rows for each initial holding
    const holdingsHistoryRows = holdings.map(h => ({
      portfolio_id: portfolioId,
      symbol: h.symbol,
      shares: h.shares,
      avg_cost: h.avg_cost,
      effective_from: tradeTime,
    }));

    if (holdingsHistoryRows.length > 0) {
      const { error: hhError } = await supabaseAdmin
        .from('holdings_history')
        .insert(holdingsHistoryRows);
      if (hhError) console.error('Error creating holdings_history:', hhError);
    }

    // Create initial value history entry
    const totalValue = remainingCash + holdings.reduce((sum, h) => sum + h.shares * h.avg_cost, 0);
    await supabaseAdmin
      .from('value_history')
      .insert({
        portfolio_id: portfolioId,
        value: totalValue,
      });

    console.log('Portfolio initialized successfully:', {
      portfolioId,
      holdings: holdings.length,
      totalSpent,
      remainingCash,
    });

    return new Response(
      JSON.stringify({ 
        message: regenerate ? 'Portfolio regenerated' : 'Portfolio created',
        initialized: true,
        portfolioId,
        picks: picks.map(p => ({ symbol: p.symbol, name: p.name, assetClass: p.assetClass })),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in initialize-portfolio:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
