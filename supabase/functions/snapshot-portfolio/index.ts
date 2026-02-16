const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const quoteCache = new Map<string, { price: number; prevClose: number; expiry: number }>();
const CACHE_TTL = 30_000; // 30s
const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000; // 5 min
const TRADE_DEDUP_MS = 2 * 60 * 1000; // 2 min

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchQuote(symbol: string, apiKey: string): Promise<{ price: number; prevClose: number } | null> {
  const cached = quoteCache.get(symbol);
  if (cached && cached.expiry > Date.now()) return { price: cached.price, prevClose: cached.prevClose };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`);
      if (res.status === 429) {
        await delay(500 * Math.pow(2, attempt));
        continue;
      }
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || data.c === 0) return null;
      const result = { price: data.c, prevClose: data.pc };
      quoteCache.set(symbol, { ...result, expiry: Date.now() + CACHE_TTL });
      return result;
    } catch {
      if (attempt < 2) await delay(500 * Math.pow(2, attempt));
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const FINNHUB_API_KEY = Deno.env.get('FINNHUB_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!FINNHUB_API_KEY) {
      return new Response(JSON.stringify({ error: 'Missing FINNHUB_API_KEY' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Auth: get user from JWT
    const authHeader = req.headers.get('Authorization') || '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(SUPABASE_URL, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { portfolio_id, reason } = await req.json();
    if (!portfolio_id || !reason) {
      return new Response(JSON.stringify({ error: 'Missing portfolio_id or reason' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Verify ownership
    const { data: portfolio, error: pErr } = await admin
      .from('portfolios')
      .select('id, cash, user_id')
      .eq('id', portfolio_id)
      .single();

    if (pErr || !portfolio || portfolio.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Portfolio not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch holdings
    const { data: holdings } = await admin
      .from('holdings')
      .select('symbol, shares, avg_cost, name')
      .eq('portfolio_id', portfolio_id);

    const cash = Number(portfolio.cash);
    const holdingsList = holdings || [];

    // Fetch quotes
    let holdingsValue = 0;
    let dayReferenceValue = 0;
    let stale = false;
    const missingSymbols: string[] = [];
    const costBasis = holdingsList.reduce((s, h) => s + Number(h.avg_cost) * Number(h.shares), 0);

    for (let i = 0; i < holdingsList.length; i++) {
      const h = holdingsList[i];
      if (i > 0) await delay(150);
      const quote = await fetchQuote(h.symbol, FINNHUB_API_KEY);
      const shares = Number(h.shares);
      if (quote) {
        holdingsValue += shares * quote.price;
        dayReferenceValue += shares * quote.prevClose;
      } else {
        // Fallback to avg_cost
        stale = true;
        missingSymbols.push(h.symbol);
        const fallback = Number(h.avg_cost);
        holdingsValue += shares * fallback;
        dayReferenceValue += shares * fallback;
      }
    }

    const totalValue = holdingsValue + cash;
    dayReferenceValue += cash;

    // Snapshot decision
    const { data: lastSnap } = await admin
      .from('value_history')
      .select('recorded_at')
      .eq('portfolio_id', portfolio_id)
      .order('recorded_at', { ascending: false })
      .limit(1);

    const lastSnapAt = lastSnap?.[0]?.recorded_at ? new Date(lastSnap[0].recorded_at).getTime() : 0;
    const sinceLastSnap = Date.now() - lastSnapAt;

    let snapshotWritten = false;
    const shouldWrite = reason === 'trade'
      ? sinceLastSnap >= TRADE_DEDUP_MS
      : sinceLastSnap >= SNAPSHOT_INTERVAL_MS;

    if (shouldWrite && holdingsList.length > 0) {
      const unrealizedPL = holdingsValue - costBasis;
      await admin.from('value_history').insert({
        portfolio_id,
        value: totalValue,
        invested_value: holdingsValue,
        cost_basis: costBasis,
        unrealized_pl: unrealizedPL,
        source: reason,
        metadata: missingSymbols.length > 0 ? { missing_symbols: missingSymbols } : null,
      });
      snapshotWritten = true;
    }

    return new Response(JSON.stringify({
      total_value: totalValue,
      holdings_value: holdingsValue,
      cash,
      day_reference_value: dayReferenceValue,
      cost_basis: costBasis,
      snapshot_written: snapshotWritten,
      last_snapshot_at: snapshotWritten ? new Date().toISOString() : (lastSnap?.[0]?.recorded_at || null),
      stale,
      missing_symbols: missingSymbols,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('snapshot-portfolio error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', stale: true }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
