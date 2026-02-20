/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getAlpacaConfig, missingKeysResponse, alpacaFetch, type AlpacaConfig } from '../_shared/alpaca.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

type Range = '1D' | '1W' | '1M' | 'ALL';

// Convert UTC ms to US/Eastern YYYY-MM-DD for symbol_daily_prices queries
function toEasternDate(ms: number): string {
  return new Date(ms).toLocaleString('en-CA', { timeZone: 'America/New_York' }).split(',')[0];
}

// Fetch most recent daily close per symbol BEFORE range start
async function fetchSeedPrices(
  serviceClient: ReturnType<typeof createClient>,
  symbols: string[],
  rangeStartMs: number,
): Promise<Map<string, number>> {
  const seedPrices = new Map<string, number>();
  if (symbols.length === 0) return seedPrices;

  const startDate = toEasternDate(rangeStartMs);
  const { data } = await serviceClient
    .from('symbol_daily_prices')
    .select('symbol, close_price, date')
    .in('symbol', symbols)
    .lt('date', startDate)
    .order('date', { ascending: false })
    .limit(symbols.length * 5);

  for (const row of (data || [])) {
    if (!seedPrices.has(row.symbol)) {
      seedPrices.set(row.symbol, Number(row.close_price));
    }
  }
  return seedPrices;
}

// ── Response cache (bars only, not live point) ──
const responseCache = new Map<string, { body: string; ts: number }>();
function responseTTL(range: Range): number {
  switch (range) {
    case '1D': return 60_000;      // 60s for bar data
    case '1W': return 60_000;      // 60s
    case '1M': return 15 * 60_000; // 15m
    case 'ALL': return 60 * 60_000; // 1h
  }
}

// ── Range → Alpaca timeframe + window ──
function rangeConfig(range: Range, portfolioCreatedAt: number, now: number) {
  switch (range) {
    case '1D': {
      const today = new Date(now);
      today.setUTCHours(14, 30, 0, 0);
      let start = today.getTime();
      if (start > now) start -= 24 * 60 * 60 * 1000;
      return { timeframe: '5Min', start: Math.max(start, portfolioCreatedAt), end: now };
    }
    case '1W':
      return { timeframe: '30Min', start: Math.max(now - 7 * 24 * 3600_000, portfolioCreatedAt), end: now };
    case '1M':
      return { timeframe: '1Hour', start: Math.max(now - 30 * 24 * 3600_000, portfolioCreatedAt), end: now };
    case 'ALL':
      return { timeframe: '1Day', start: portfolioCreatedAt, end: now };
  }
}

// ── Fetch multi-symbol bars from Alpaca ──
async function fetchBars(
  cfg: AlpacaConfig,
  symbols: string[],
  timeframe: string,
  startMs: number,
  endMs: number,
): Promise<Map<string, { t: number; c: number }[]>> {
  const result = new Map<string, { t: number; c: number }[]>();
  if (symbols.length === 0) return result;

  for (const sym of symbols) result.set(sym, []);

  const startISO = new Date(startMs).toISOString();
  const endISO = new Date(endMs).toISOString();

  let pageToken: string | undefined;
  const MAX_PAGES = 5;

  for (let page = 0; page < MAX_PAGES; page++) {
    const params: Record<string, string> = {
      symbols: symbols.join(','),
      timeframe,
      start: startISO,
      end: endISO,
      limit: '10000',
      adjustment: 'split',
      feed: 'iex',
      sort: 'asc',
    };
    if (pageToken) params.page_token = pageToken;

    const res = await alpacaFetch('/v2/stocks/bars', cfg, params);
    if (!res.ok) {
      console.error(`Alpaca bars error: ${res.status}`);
      break;
    }

    const data = await res.json();
    const barsMap = data.bars || {};
    for (const sym of symbols) {
      const bars = barsMap[sym] || [];
      const arr = result.get(sym)!;
      for (const b of bars) {
        arr.push({ t: new Date(b.t).getTime(), c: b.c });
      }
    }

    pageToken = data.next_page_token;
    if (!pageToken) break;
  }

  return result;
}

// ── Fetch live quotes from shared DB cache via quote-cache-refresh ──
async function fetchLiveQuotesFromCache(
  symbols: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (symbols.length === 0) return result;

  // Use service role to read symbol_quote_cache directly
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // First try to read fresh quotes from cache
  const { data: cached } = await supabase
    .from('symbol_quote_cache')
    .select('symbol, price, updated_at')
    .in('symbol', symbols);

  const now = Date.now();
  const QUOTE_FRESHNESS_MS = 30_000; // 30s — accept slightly stale
  const staleSymbols: string[] = [];

  for (const row of (cached || [])) {
    const age = now - new Date(row.updated_at).getTime();
    if (age < QUOTE_FRESHNESS_MS) {
      result.set(row.symbol, Number(row.price));
    } else {
      staleSymbols.push(row.symbol);
    }
  }

  // Check for symbols not in cache at all
  const cachedSymbols = new Set((cached || []).map(r => r.symbol));
  for (const sym of symbols) {
    if (!cachedSymbols.has(sym) && !result.has(sym)) {
      staleSymbols.push(sym);
    }
  }

  // If we have stale symbols, call quote-cache-refresh to update them
  if (staleSymbols.length > 0) {
    try {
      const refreshUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/quote-cache-refresh?symbols=${staleSymbols.join(',')}&max_age_ms=15000`;
      const res = await fetch(refreshUrl, {
        headers: {
          'apikey': Deno.env.get('SUPABASE_ANON_KEY')!,
        },
      });
      if (res.ok) {
        const { quotes } = await res.json();
        for (const [sym, q] of Object.entries(quotes as Record<string, { price: number }>)) {
          result.set(sym, q.price);
        }
      }
    } catch (err) {
      console.error('Failed to refresh stale quotes:', err);
      // Fall back to stale cache data
      for (const row of (cached || [])) {
        if (!result.has(row.symbol)) {
          result.set(row.symbol, Number(row.price));
        }
      }
    }
  }

  return result;
}

// ── Downsample to ~maxPoints ──
function downsample<T extends { t: string }>(points: T[], maxPoints: number): T[] {
  if (points.length <= maxPoints) return points;
  const step = (points.length - 1) / (maxPoints - 1);
  const result: T[] = [];
  for (let i = 0; i < maxPoints - 1; i++) {
    result.push(points[Math.round(i * step)]);
  }
  result.push(points[points.length - 1]);
  return result;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const alpacaCfg = getAlpacaConfig();
    if (!alpacaCfg) return missingKeysResponse(corsHeaders);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

    const serviceClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const authHeader = req.headers.get('Authorization') || '';
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    const portfolioId = url.searchParams.get('portfolio_id');
    const range = (url.searchParams.get('range') || '1D') as Range;

    if (!portfolioId) {
      return new Response(JSON.stringify({ error: 'Missing portfolio_id' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Response cache check
    const cacheKey = `${portfolioId}:${range}`;
    const cachedResp = responseCache.get(cacheKey);
    const ttl = responseTTL(range);
    
    // For 1D, we cache bar data separately and always append fresh live point
    // For other ranges, cache the full response
    if (range !== '1D' && cachedResp && Date.now() - cachedResp.ts < ttl) {
      return new Response(cachedResp.body, {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch portfolio
    const { data: portfolio, error: pfErr } = await userClient
      .from('portfolios')
      .select('id, created_at, cash, starting_cash')
      .eq('id', portfolioId)
      .maybeSingle();

    if (pfErr || !portfolio) {
      return new Response(JSON.stringify({ error: 'Portfolio not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const portfolioCreatedAt = new Date(portfolio.created_at).getTime();
    const now = Date.now();

    // Fetch holdings + cash history
    const [holdingsRes, cashRes] = await Promise.all([
      userClient.from('holdings_history')
        .select('symbol, shares, avg_cost, effective_from, effective_to')
        .eq('portfolio_id', portfolioId)
        .order('effective_from', { ascending: true }),
      userClient.from('cash_history')
        .select('amount, effective_from, effective_to')
        .eq('portfolio_id', portfolioId)
        .order('effective_from', { ascending: true }),
    ]);

    const holdingsRows = holdingsRes.data || [];
    const cashRows = cashRes.data || [];

    if (!holdingsRows.length && !cashRows.length) {
      return new Response(JSON.stringify({
        points: [], range, available: false,
        message: 'No history data available yet. Make a trade to start tracking.',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const allSymbols = [...new Set(holdingsRows.map(r => r.symbol))];
    const { timeframe, start, end } = rangeConfig(range, portfolioCreatedAt, now);

    // Fetch seed prices (most recent close before range start)
    const seedPrices = await fetchSeedPrices(serviceClient, allSymbols, start);

    // Track unpriced symbols (no seed AND no bars)
    // We'll finalize this after fetching bars below

    // For 1D, check bar cache separately (bars cached 60s)
    const barCacheKey = `bars:${portfolioId}:${range}`;
    let barsBySymbol: Map<string, { t: number; c: number }[]>;
    
    const cachedBars = responseCache.get(barCacheKey);
    if (cachedBars && Date.now() - cachedBars.ts < ttl) {
      barsBySymbol = new Map(JSON.parse(cachedBars.body));
    } else {
      barsBySymbol = await fetchBars(alpacaCfg, allSymbols, timeframe, start, end);
      // Cache bars
      const serialized = JSON.stringify([...barsBySymbol.entries()]);
      responseCache.set(barCacheKey, { body: serialized, ts: Date.now() });
    }

    // Build canonical timestamp set
    const tsSet = new Set<number>();
    for (const bars of barsBySymbol.values()) {
      for (const b of bars) tsSet.add(b.t);
    }
    const canonicalTs = [...tsSet].sort((a, b) => a - b);

    // Determine unpriced symbols: no seed AND no bars
    const unpricedSymbols: string[] = [];
    for (const sym of allSymbols) {
      const bars = barsBySymbol.get(sym) || [];
      if (!seedPrices.has(sym) && bars.length === 0) {
        unpricedSymbols.push(sym);
      }
    }

    if (canonicalTs.length === 0) {
      return new Response(JSON.stringify({
        points: [], range, available: false,
        unpricedSymbols: unpricedSymbols.length > 0 ? unpricedSymbols : undefined,
        message: 'No market data available for the selected range.',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Pre-build forward-fill price maps per symbol
    const priceMaps = new Map<string, Map<number, number>>();
    for (const sym of allSymbols) {
      const bars = barsBySymbol.get(sym) || [];
      const priceMap = new Map<number, number>();
      let lastPrice: number | null = seedPrices.get(sym) ?? null;
      let barIdx = 0;

      for (const t of canonicalTs) {
        while (barIdx < bars.length && bars[barIdx].t <= t) {
          lastPrice = bars[barIdx].c;
          barIdx++;
        }
        if (lastPrice !== null) {
          priceMap.set(t, lastPrice);
        }
      }
      priceMaps.set(sym, priceMap);
    }

    function getCashAt(t: number): number {
      let cash = Number(portfolio!.starting_cash);
      for (const c of cashRows) {
        const from = new Date(c.effective_from).getTime();
        const to = c.effective_to ? new Date(c.effective_to).getTime() : Infinity;
        if (from <= t && t < to) {
          cash = Number(c.amount);
        }
      }
      return cash;
    }

    function getActiveHoldings(t: number) {
      const active: { symbol: string; shares: number; avgCost: number }[] = [];
      for (const h of holdingsRows) {
        const from = new Date(h.effective_from).getTime();
        const to = h.effective_to ? new Date(h.effective_to).getTime() : Infinity;
        if (from <= t && t < to && Number(h.shares) > 0) {
          active.push({ symbol: h.symbol, shares: Number(h.shares), avgCost: Number(h.avg_cost) });
        }
      }
      return active;
    }

    // Compute value at each canonical timestamp
    const rawPoints: { t: string; v: number; hv: number; cb: number }[] = [];
    for (const t of canonicalTs) {
      const holdings = getActiveHoldings(t);
      let hv = 0;
      let cb = 0;
      for (const h of holdings) {
        cb += h.shares * h.avgCost;
        const price = priceMaps.get(h.symbol)?.get(t);
        if (price !== undefined) {
          hv += h.shares * price;
        }
      }
      const cash = getCashAt(t);
      rawPoints.push({
        t: new Date(t).toISOString(),
        v: Math.round((hv + cash) * 100) / 100,
        hv: Math.round(hv * 100) / 100,
        cb: Math.round(cb * 100) / 100,
      });
    }

    // Append live point for 1D using shared DB quote cache
    if (range === '1D' && allSymbols.length > 0) {
      const liveQuotes = await fetchLiveQuotesFromCache(allSymbols);
      const liveHoldings = getActiveHoldings(now);
      let liveHV = 0;
      let liveCB = 0;
      for (const h of liveHoldings) {
        liveCB += h.shares * h.avgCost;
        const price = liveQuotes.get(h.symbol);
        if (price) {
          liveHV += h.shares * price;
        } else {
          const lastBar = priceMaps.get(h.symbol);
          if (lastBar && lastBar.size > 0) {
            const lastTs = [...lastBar.keys()].pop()!;
            liveHV += h.shares * lastBar.get(lastTs)!;
          } else {
            const seed = seedPrices.get(h.symbol);
            if (seed) liveHV += h.shares * seed;
          }
        }
      }
      const liveCash = getCashAt(now);
      const livePoint = {
        t: new Date(now).toISOString(),
        v: Math.round((liveHV + liveCash) * 100) / 100,
        hv: Math.round(liveHV * 100) / 100,
        cb: Math.round(liveCB * 100) / 100,
      };

      if (rawPoints.length > 0) {
        const lastTs = new Date(rawPoints[rawPoints.length - 1].t).getTime();
        if (now - lastTs < 60_000) {
          rawPoints[rawPoints.length - 1] = livePoint;
        } else {
          rawPoints.push(livePoint);
        }
      } else {
        rawPoints.push(livePoint);
      }
    }

    const points = downsample(rawPoints, 300);

    const responseBody = JSON.stringify({
      points,
      range,
      available: points.length >= 2,
      holdingsCount: allSymbols.length,
      unpricedSymbols: unpricedSymbols.length > 0 ? unpricedSymbols : undefined,
      message: points.length < 2 ? 'Not enough data yet. Make a trade to start tracking.' : undefined,
    });

    // Cache full response for non-1D ranges
    if (range !== '1D') {
      responseCache.set(cacheKey, { body: responseBody, ts: Date.now() });
    }

    return new Response(responseBody, {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('portfolio-performance error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
