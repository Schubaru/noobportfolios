/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getAlpacaConfig, missingKeysResponse, alpacaFetch, type AlpacaConfig } from '../_shared/alpaca.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

type Range = '1D' | '1W' | '1M' | 'ALL';

// ── Response cache ──
const responseCache = new Map<string, { body: string; ts: number }>();
function responseTTL(range: Range): number {
  switch (range) {
    case '1D': return 10_000;
    case '1W': return 5 * 60_000;
    case '1M': return 15 * 60_000;
    case 'ALL': return 60 * 60_000;
  }
}

// ── Range → Alpaca timeframe + window ──
function rangeConfig(range: Range, portfolioCreatedAt: number, now: number) {
  switch (range) {
    case '1D': {
      // Market open 9:30 ET = 14:30 UTC
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
      feed: 'sip',
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

// ── Fetch live snapshots from Alpaca ──
async function fetchSnapshots(
  cfg: AlpacaConfig,
  symbols: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (symbols.length === 0) return result;

  const res = await alpacaFetch('/v2/stocks/snapshots', cfg, {
    symbols: symbols.join(','),
  });
  if (!res.ok) return result;

  const snapshots = await res.json();
  for (const sym of symbols) {
    const snap = snapshots[sym];
    if (snap) {
      const price = snap.latestTrade?.p ?? snap.minuteBar?.c ?? snap.dailyBar?.c;
      if (price) result.set(sym, price);
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
  result.push(points[points.length - 1]); // always include last
  return result;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const alpacaCfg = getAlpacaConfig();
    if (!alpacaCfg) return missingKeysResponse(corsHeaders);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

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

    // Response cache
    const cacheKey = `${portfolioId}:${range}`;
    const cachedResp = responseCache.get(cacheKey);
    if (cachedResp && Date.now() - cachedResp.ts < responseTTL(range)) {
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

    // Collect all unique symbols
    const allSymbols = [...new Set(holdingsRows.map(r => r.symbol))];

    // Get range config
    const { timeframe, start, end } = rangeConfig(range, portfolioCreatedAt, now);

    // Fetch bars from Alpaca
    const barsBySymbol = await fetchBars(alpacaCfg, allSymbols, timeframe, start, end);

    // Build canonical timestamp set (union of all bar timestamps)
    const tsSet = new Set<number>();
    for (const bars of barsBySymbol.values()) {
      for (const b of bars) tsSet.add(b.t);
    }
    const canonicalTs = [...tsSet].sort((a, b) => a - b);

    if (canonicalTs.length === 0) {
      // No bar data — maybe market is closed or no data. Return minimal.
      return new Response(JSON.stringify({
        points: [], range, available: false,
        message: 'No market data available for the selected range.',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Pre-build forward-fill price maps per symbol
    // For each symbol, at each canonical timestamp, find the latest bar at or before t
    const priceMaps = new Map<string, Map<number, number>>();
    for (const sym of allSymbols) {
      const bars = barsBySymbol.get(sym) || [];
      const priceMap = new Map<number, number>();
      let lastPrice: number | null = null;
      let barIdx = 0;

      for (const t of canonicalTs) {
        // Advance barIdx to latest bar at or before t
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

    // Helper: get cash at a given timestamp
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

    // Helper: get active holdings at a given timestamp
    function getActiveHoldings(t: number) {
      const active: { symbol: string; shares: number; avgCost: number }[] = [];
      for (const h of holdingsRows) {
        const from = new Date(h.effective_from).getTime();
        const to = h.effective_to ? new Date(h.effective_to).getTime() : Infinity;
        if (from <= t && t < to) {
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

    // Append live point for 1D
    if (range === '1D' && allSymbols.length > 0) {
      const liveQuotes = await fetchSnapshots(alpacaCfg, allSymbols);
      const liveHoldings = getActiveHoldings(now);
      let liveHV = 0;
      let liveCB = 0;
      for (const h of liveHoldings) {
        liveCB += h.shares * h.avgCost;
        const price = liveQuotes.get(h.symbol);
        if (price) {
          liveHV += h.shares * price;
        } else {
          // Fallback to last bar price
          const lastBar = priceMaps.get(h.symbol);
          if (lastBar && lastBar.size > 0) {
            const lastTs = [...lastBar.keys()].pop()!;
            liveHV += h.shares * lastBar.get(lastTs)!;
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

      // Replace or append
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

    // Downsample to ~300 points
    const points = downsample(rawPoints, 300);

    const responseBody = JSON.stringify({
      points,
      range,
      available: points.length >= 2,
      message: points.length < 2 ? 'Not enough data yet. Make a trade to start tracking.' : undefined,
    });

    responseCache.set(cacheKey, { body: responseBody, ts: Date.now() });

    return new Response(responseBody, {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('portfolio-performance error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
