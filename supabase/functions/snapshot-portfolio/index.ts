const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── In-memory quote cache (30s TTL) ──
const quoteCache = new Map<string, { price: number; prevClose: number; fetchedAt: number }>();
const CACHE_TTL = 30_000;
const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;
const TRADE_DEDUP_MS = 2 * 60 * 1000;
const LAST_QUOTE_MAX_AGE_MS = 15 * 60 * 1000; // 15 min
const MAX_CONCURRENT = 6;

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

interface QuoteResult {
  price: number;
  prevClose: number;
  fetchedAt: number;
  source: 'live' | 'cache' | 'last_known';
}

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

/** Concurrency-limited parallel executor */
async function parallelLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
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

    if (!FINNHUB_API_KEY) {
      return new Response(JSON.stringify({ error: 'Missing FINNHUB_API_KEY' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Auth
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

    const { portfolio_id, reason, trade_id } = await req.json();
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

    if (holdingsList.length === 0) {
      // No holdings, just return cash value
      return new Response(JSON.stringify({
        total_value: cash,
        holdings_value: 0,
        cash_value: cash,
        day_reference_value: cash,
        cost_basis: 0,
        snapshot_written: false,
        last_snapshot_at: null,
        stale: false,
        quote_coverage: 1,
        quality: 'good',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Fetch last-known quotes from DB (for fallback) ──
    const symbols = holdingsList.map(h => h.symbol);
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

    // ── Parallel quote fetching (max 6 concurrent) ──
    const quoteResults = new Map<string, QuoteResult>();
    const upsertRows: Array<{ symbol: string; price: number; prev_close: number | null; quote_time: string }> = [];
    const missingSymbols: string[] = [];
    const quoteTimes: number[] = [];

    await parallelLimit(holdingsList, MAX_CONCURRENT, async (h) => {
      const symbol = h.symbol;
      const now = Date.now();

      // Check in-memory cache first
      const cached = quoteCache.get(symbol);
      if (cached && cached.fetchedAt + CACHE_TTL > now) {
        quoteResults.set(symbol, { price: cached.price, prevClose: cached.prevClose, fetchedAt: cached.fetchedAt, source: 'cache' });
        quoteTimes.push(cached.fetchedAt);
        return;
      }

      // Fetch from Finnhub
      const live = await fetchQuoteFromFinnhub(symbol, FINNHUB_API_KEY);
      if (live) {
        const fetchedAt = Date.now();
        quoteCache.set(symbol, { price: live.price, prevClose: live.prevClose, fetchedAt });
        quoteResults.set(symbol, { price: live.price, prevClose: live.prevClose, fetchedAt, source: 'live' });
        quoteTimes.push(fetchedAt);
        // Prepare UPSERT
        upsertRows.push({
          symbol,
          price: live.price,
          prev_close: live.prevClose,
          quote_time: new Date(fetchedAt).toISOString(),
        });
        return;
      }

      // Fallback to symbol_last_quotes (only if < 15 min old)
      const lk = lastKnownMap.get(symbol);
      if (lk && (now - lk.quoteTime) < LAST_QUOTE_MAX_AGE_MS) {
        quoteResults.set(symbol, { price: lk.price, prevClose: lk.prevClose, fetchedAt: lk.quoteTime, source: 'last_known' });
        quoteTimes.push(lk.quoteTime);
        return;
      }

      // No valid quote
      missingSymbols.push(symbol);
    });

    // UPSERT fresh quotes into symbol_last_quotes
    if (upsertRows.length > 0) {
      await admin.from('symbol_last_quotes').upsert(upsertRows, { onConflict: 'symbol' });
    }

    // ── Compute values ──
    let holdingsValue = 0;
    let dayReferenceValue = 0;
    let coveredValue = 0;
    let totalPositionValue = 0; // for coverage calc using avg_cost as weight
    const costBasis = holdingsList.reduce((s, h) => s + Number(h.avg_cost) * Number(h.shares), 0);

    for (const h of holdingsList) {
      const shares = Number(h.shares);
      const positionWeight = Math.abs(Number(h.avg_cost) * shares);
      totalPositionValue += positionWeight;

      const qr = quoteResults.get(h.symbol);
      if (qr) {
        holdingsValue += shares * qr.price;
        dayReferenceValue += shares * qr.prevClose;
        coveredValue += positionWeight;
      } else {
        // No quote at all — do NOT use avg_cost as price
        // These shares contribute 0 to holdingsValue (coverage will gate)
      }
    }

    const quoteCoverage = totalPositionValue > 0 ? coveredValue / totalPositionValue : 1;
    const quality = quoteCoverage >= 0.98 ? 'good' : quoteCoverage >= 0.8 ? 'degraded' : 'stale';

    // If coverage too low, don't write
    const totalValue = holdingsValue + cash;
    dayReferenceValue += cash;

    const quoteTimeSpread = quoteTimes.length >= 2
      ? Math.round((Math.max(...quoteTimes) - Math.min(...quoteTimes)) / 1000)
      : 0;

    // ── Snapshot write decision ──
    const { data: lastSnap } = await admin
      .from('value_history')
      .select('recorded_at, metadata')
      .eq('portfolio_id', portfolio_id)
      .order('recorded_at', { ascending: false })
      .limit(1);

    const lastSnapAt = lastSnap?.[0]?.recorded_at ? new Date(lastSnap[0].recorded_at).getTime() : 0;
    const sinceLastSnap = Date.now() - lastSnapAt;

    let snapshotWritten = false;
    let shouldWrite = false;

    if (quality === 'stale') {
      // Never write stale snapshots
      shouldWrite = false;
    } else if (reason === 'trade' && trade_id) {
      // Trade with trade_id: dedup by trade_id, not time
      const { data: existing } = await admin
        .from('value_history')
        .select('id')
        .eq('portfolio_id', portfolio_id)
        .contains('metadata', { trade_id })
        .limit(1);
      shouldWrite = !existing || existing.length === 0;
    } else if (reason === 'trade') {
      // Trade without trade_id: backwards-compatible time dedup
      shouldWrite = sinceLastSnap >= TRADE_DEDUP_MS;
    } else {
      // Non-trade: 5-minute interval
      shouldWrite = sinceLastSnap >= SNAPSHOT_INTERVAL_MS;
    }

    if (shouldWrite) {
      const unrealizedPL = holdingsValue - costBasis;
      const metadata: Record<string, unknown> = {};
      if (missingSymbols.length > 0) metadata.missing_symbols = missingSymbols;
      if (trade_id) metadata.trade_id = trade_id;

      await admin.from('value_history').insert({
        portfolio_id,
        value: totalValue,
        invested_value: holdingsValue,
        cash_value: cash,
        cost_basis: costBasis,
        unrealized_pl: unrealizedPL,
        day_reference_value: dayReferenceValue,
        quality,
        quote_coverage: quoteCoverage,
        quote_time_spread_seconds: quoteTimeSpread,
        source: reason,
        metadata: Object.keys(metadata).length > 0 ? metadata : null,
      });
      snapshotWritten = true;
    }

    return new Response(JSON.stringify({
      total_value: totalValue,
      holdings_value: holdingsValue,
      cash_value: cash,
      day_reference_value: dayReferenceValue,
      cost_basis: costBasis,
      snapshot_written: snapshotWritten,
      last_snapshot_at: snapshotWritten ? new Date().toISOString() : (lastSnap?.[0]?.recorded_at || null),
      stale: quality === 'stale',
      quote_coverage: quoteCoverage,
      quality,
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
