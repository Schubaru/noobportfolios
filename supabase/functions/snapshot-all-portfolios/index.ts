const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CACHE_TTL = 30_000;
const LAST_QUOTE_MAX_AGE_MS = 15 * 60 * 1000;
const MAX_CONCURRENT = 6;
const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchQuoteFromFinnhub(
  symbol: string,
  apiKey: string
): Promise<{ price: number; prevClose: number } | null> {
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
      return { price: data.c, prevClose: data.pc };
    } catch {
      if (attempt < 2) await delay(500 * Math.pow(2, attempt));
    }
  }
  return null;
}

async function parallelLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const FINNHUB_API_KEY = Deno.env.get('FINNHUB_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const CRON_SECRET = Deno.env.get('CRON_SECRET');

    if (!FINNHUB_API_KEY) {
      return new Response(JSON.stringify({ error: 'Missing FINNHUB_API_KEY' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Auth: require CRON_SECRET header OR service role key via Authorization
    const providedSecret = req.headers.get('x-cron-secret') || '';
    const authHeader = req.headers.get('Authorization') || '';
    const providedToken = authHeader.replace('Bearer ', '');
    const isValidCronSecret = CRON_SECRET && providedSecret === CRON_SECRET;
    const isServiceRole = providedToken === SERVICE_ROLE_KEY;
    if (!isValidCronSecret && !isServiceRole) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Get all portfolios with at least one holding
    const { data: portfolioIds } = await admin
      .from('holdings')
      .select('portfolio_id')
      .limit(1000);

    const uniqueIds = [...new Set((portfolioIds || []).map(r => r.portfolio_id))];

    let written = 0;
    let skipped = 0;
    let failed = 0;

    for (const pid of uniqueIds) {
      try {
        // Check last snapshot time
        const { data: lastSnap } = await admin
          .from('value_history')
          .select('recorded_at')
          .eq('portfolio_id', pid)
          .order('recorded_at', { ascending: false })
          .limit(1);

        const lastAt = lastSnap?.[0]?.recorded_at ? new Date(lastSnap[0].recorded_at).getTime() : 0;
        if (Date.now() - lastAt < SNAPSHOT_INTERVAL_MS) {
          skipped++;
          continue;
        }

        // Fetch portfolio cash
        const { data: portfolio } = await admin
          .from('portfolios')
          .select('cash')
          .eq('id', pid)
          .single();

        const cash = portfolio ? Number(portfolio.cash) : 0;

        // Fetch holdings
        const { data: holdings } = await admin
          .from('holdings')
          .select('symbol, shares, avg_cost')
          .eq('portfolio_id', pid);

        const holdingsList = holdings || [];
        if (holdingsList.length === 0) { skipped++; continue; }

        const symbols = holdingsList.map(h => h.symbol);

        // Fetch last known quotes
        const { data: lastKnownRows } = await admin
          .from('symbol_last_quotes')
          .select('symbol, price, prev_close, quote_time')
          .in('symbol', symbols);

        const lastKnownMap = new Map<string, { price: number; prevClose: number; quoteTime: number }>();
        for (const row of lastKnownRows || []) {
          lastKnownMap.set(row.symbol, {
            price: Number(row.price),
            prevClose: row.prev_close != null ? Number(row.prev_close) : Number(row.price),
            quoteTime: new Date(row.quote_time).getTime(),
          });
        }

        // Fetch quotes
        const quoteResults = new Map<string, { price: number; prevClose: number }>();
        const upsertRows: Array<{ symbol: string; price: number; prev_close: number | null; quote_time: string }> = [];
        let coveredValue = 0;
        let totalPositionValue = 0;

        await parallelLimit(holdingsList, MAX_CONCURRENT, async (h) => {
          const symbol = h.symbol;
          const posWeight = Math.abs(Number(h.avg_cost) * Number(h.shares));
          totalPositionValue += posWeight;

          const live = await fetchQuoteFromFinnhub(symbol, FINNHUB_API_KEY);
          if (live) {
            quoteResults.set(symbol, live);
            coveredValue += posWeight;
            upsertRows.push({ symbol, price: live.price, prev_close: live.prevClose, quote_time: new Date().toISOString() });
            return;
          }

          const lk = lastKnownMap.get(symbol);
          if (lk && (Date.now() - lk.quoteTime) < LAST_QUOTE_MAX_AGE_MS) {
            quoteResults.set(symbol, { price: lk.price, prevClose: lk.prevClose });
            coveredValue += posWeight;
            return;
          }
        });

        if (upsertRows.length > 0) {
          await admin.from('symbol_last_quotes').upsert(upsertRows, { onConflict: 'symbol' });
        }

        const coverage = totalPositionValue > 0 ? coveredValue / totalPositionValue : 1;
        if (coverage < 0.98) { skipped++; continue; }

        let holdingsValue = 0;
        let dayRefValue = 0;
        const costBasis = holdingsList.reduce((s, h) => s + Number(h.avg_cost) * Number(h.shares), 0);

        for (const h of holdingsList) {
          const q = quoteResults.get(h.symbol);
          if (q) {
            holdingsValue += Number(h.shares) * q.price;
            dayRefValue += Number(h.shares) * q.prevClose;
          }
        }

        const totalValue = holdingsValue + cash;
        dayRefValue += cash;

        await admin.from('value_history').insert({
          portfolio_id: pid,
          value: totalValue,
          invested_value: holdingsValue,
          cash_value: cash,
          cost_basis: costBasis,
          unrealized_pl: holdingsValue - costBasis,
          day_reference_value: dayRefValue,
          quality: 'good',
          quote_coverage: coverage,
          source: 'scheduled',
        });

        written++;

        // Delay between portfolios to respect rate limits
        await delay(1000);
      } catch (e) {
        console.error(`Failed portfolio ${pid}:`, e);
        failed++;
      }
    }

    return new Response(JSON.stringify({
      total: uniqueIds.length,
      written,
      skipped,
      failed,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('snapshot-all-portfolios error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
