const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Range = '1D' | '1W' | '1M' | 'ALL';

const FINNHUB_KEY = Deno.env.get('FINNHUB_API_KEY') || '';

// ── In-memory caches ──
const quoteCache = new Map<string, { price: number; ts: number }>();
const QUOTE_TTL = 30_000; // 30s

const responseCache = new Map<string, { body: string; ts: number }>();
function responseTTL(range: Range): number {
  switch (range) {
    case '1D': return 15_000;
    case '1W': return 5 * 60_000;
    case '1M': return 15 * 60_000;
    case 'ALL': return 60 * 60_000;
  }
}

// ── Bucket generation ──
function generateBuckets(range: Range, portfolioCreatedAt: number, now: number): number[] {
  let start: number, step: number;

  switch (range) {
    case '1D': {
      // Market open 9:30 ET = 14:30 UTC
      const today = new Date(now);
      today.setUTCHours(14, 30, 0, 0);
      start = today.getTime();
      if (start > now) start -= 24 * 60 * 60 * 1000; // yesterday if before market open
      step = 5 * 60 * 1000;
      break;
    }
    case '1W':
      start = now - 7 * 24 * 60 * 60 * 1000;
      step = 30 * 60 * 1000;
      break;
    case '1M':
      start = now - 30 * 24 * 60 * 60 * 1000;
      step = 4 * 60 * 60 * 1000;
      break;
    case 'ALL':
      start = portfolioCreatedAt;
      step = 24 * 60 * 60 * 1000;
      break;
  }

  // Don't go before portfolio creation
  if (start < portfolioCreatedAt) start = portfolioCreatedAt;

  // Align to bucket boundary
  start = Math.floor(start / step) * step;

  const buckets: number[] = [];
  let t = start;
  while (t <= now) {
    buckets.push(t);
    t += step;
  }
  // Always include current time as last bucket
  if (buckets.length === 0 || buckets[buckets.length - 1] < now) {
    buckets.push(now);
  }
  return buckets;
}

// ── Finnhub quote fetch with cache ──
async function getQuote(symbol: string): Promise<number | null> {
  const cached = quoteCache.get(symbol);
  if (cached && Date.now() - cached.ts < QUOTE_TTL) return cached.price;

  try {
    const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_KEY}`);
    if (!res.ok) return cached?.price ?? null;
    const data = await res.json();
    if (data.c && data.c > 0) {
      quoteCache.set(symbol, { price: data.c, ts: Date.now() });
      return data.c;
    }
    return cached?.price ?? null;
  } catch {
    return cached?.price ?? null;
  }
}

// ── Batch fetch quotes for all symbols ──
async function batchGetQuotes(symbols: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  // Fetch sequentially with 200ms delay to respect rate limits
  for (const sym of symbols) {
    const price = await getQuote(sym);
    if (price !== null) result.set(sym, price);
    if (symbols.indexOf(sym) < symbols.length - 1) {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization') || '';
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const serviceClient = createClient(SUPABASE_URL, SERVICE_KEY);

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

    // Check response cache
    const cacheKey = `${portfolioId}:${range}`;
    const cachedResp = responseCache.get(cacheKey);
    if (cachedResp && Date.now() - cachedResp.ts < responseTTL(range)) {
      return new Response(cachedResp.body, {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get portfolio (for created_at and cash)
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

    // Generate deterministic time buckets
    const buckets = generateBuckets(range, portfolioCreatedAt, now);

    // Fetch all holdings_history for this portfolio
    const { data: holdingsRows } = await userClient
      .from('holdings_history')
      .select('symbol, shares, avg_cost, effective_from, effective_to')
      .eq('portfolio_id', portfolioId)
      .order('effective_from', { ascending: true });

    // Fetch all cash_history for this portfolio
    const { data: cashRows } = await userClient
      .from('cash_history')
      .select('amount, effective_from, effective_to')
      .eq('portfolio_id', portfolioId)
      .order('effective_from', { ascending: true });

    if (!holdingsRows?.length && !cashRows?.length) {
      // No history yet - return minimal response
      const body = JSON.stringify({
        points: [],
        range,
        available: false,
        message: 'No history data available yet. Make a trade to start tracking.',
      });
      return new Response(body, {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Collect all unique symbols needed
    const allSymbols = [...new Set((holdingsRows || []).map(r => r.symbol))];

    // Determine which dates need prices (for historical buckets)
    const todayStr = new Date(now).toISOString().split('T')[0];
    const historicalDates = new Set<string>();
    for (const bt of buckets) {
      const dateStr = new Date(bt).toISOString().split('T')[0];
      if (dateStr < todayStr) historicalDates.add(dateStr);
    }

    // Fetch daily prices from cache
    let dailyPrices = new Map<string, number>(); // key: "SYMBOL:YYYY-MM-DD"
    if (historicalDates.size > 0 && allSymbols.length > 0) {
      const { data: priceRows } = await serviceClient
        .from('symbol_daily_prices')
        .select('symbol, date, close_price')
        .in('symbol', allSymbols);

      if (priceRows) {
        for (const r of priceRows) {
          dailyPrices.set(`${r.symbol}:${r.date}`, Number(r.close_price));
        }
      }

      // Check for missing dates and trigger lazy backfill
      const missingSymbols = new Set<string>();
      for (const sym of allSymbols) {
        for (const date of historicalDates) {
          if (!dailyPrices.has(`${sym}:${date}`)) {
            missingSymbols.add(sym);
            break;
          }
        }
      }

      if (missingSymbols.size > 0) {
        // Lazy backfill: fetch candles for missing symbols
        for (const sym of missingSymbols) {
          try {
            const earliestDate = [...historicalDates].sort()[0];
            const from = Math.floor(new Date(earliestDate).getTime() / 1000);
            const to = Math.floor(now / 1000);
            const candleRes = await fetch(
              `https://finnhub.io/api/v1/stock/candle?symbol=${sym}&resolution=D&from=${from}&to=${to}&token=${FINNHUB_KEY}`
            );
            if (candleRes.ok) {
              const candle = await candleRes.json();
              if (candle.s === 'ok' && candle.c && candle.t) {
                const toUpsert: { symbol: string; date: string; close_price: number }[] = [];
                for (let i = 0; i < candle.t.length; i++) {
                  const d = new Date(candle.t[i] * 1000).toISOString().split('T')[0];
                  dailyPrices.set(`${sym}:${d}`, candle.c[i]);
                  if (!dailyPrices.has(`${sym}:${d}`) || true) {
                    toUpsert.push({ symbol: sym, date: d, close_price: candle.c[i] });
                  }
                }
                // Persist to DB (fire and forget)
                if (toUpsert.length > 0) {
                  serviceClient
                    .from('symbol_daily_prices')
                    .upsert(toUpsert, { onConflict: 'symbol,date' })
                    .then(() => {});
                }
              }
            }
            await new Promise(r => setTimeout(r, 250));
          } catch (e) {
            console.error(`Failed to backfill ${sym}:`, e);
          }
        }
      }
    }

    // Fetch current quotes for today's buckets
    const currentQuotes = await batchGetQuotes(allSymbols);

    // ── Compute portfolio value at each bucket ──
    const points: { t: string; v: number; hv: number }[] = [];

    for (const bucketTime of buckets) {
      const bucketDate = new Date(bucketTime).toISOString().split('T')[0];
      const isToday = bucketDate >= todayStr;

      // Get holdings active at this time
      let holdingsValue = 0;
      for (const h of (holdingsRows || [])) {
        const from = new Date(h.effective_from).getTime();
        const to = h.effective_to ? new Date(h.effective_to).getTime() : Infinity;
        if (from <= bucketTime && bucketTime < to) {
          // Get price
          let price: number | null = null;
          if (isToday) {
            price = currentQuotes.get(h.symbol) ?? null;
          } else {
            // Try exact date, then nearby dates
            price = dailyPrices.get(`${h.symbol}:${bucketDate}`) ?? null;
            if (price === null) {
              // Find closest earlier date
              const sortedDates = [...dailyPrices.keys()]
                .filter(k => k.startsWith(h.symbol + ':'))
                .map(k => k.split(':')[1])
                .filter(d => d <= bucketDate)
                .sort()
                .reverse();
              if (sortedDates.length > 0) {
                price = dailyPrices.get(`${h.symbol}:${sortedDates[0]}`) ?? null;
              }
            }
          }
          // Fallback to avg_cost if no price available
          if (price === null) price = Number(h.avg_cost);
          holdingsValue += Number(h.shares) * price;
        }
      }

      // Get cash at this time
      let cashAtTime = Number(portfolio.starting_cash); // default
      for (const c of (cashRows || [])) {
        const from = new Date(c.effective_from).getTime();
        const to = c.effective_to ? new Date(c.effective_to).getTime() : Infinity;
        if (from <= bucketTime && bucketTime < to) {
          cashAtTime = Number(c.amount);
        }
      }

      const totalValue = holdingsValue + cashAtTime;
      points.push({
        t: new Date(bucketTime).toISOString(),
        v: Math.round(totalValue * 100) / 100,
        hv: Math.round(holdingsValue * 100) / 100, // always numeric, never null
      });
    }

    // ── Live last point for 1D ──
    if (range === '1D' && points.length > 0) {
      // Recompute current holdings value with freshest quotes
      let liveHV = 0;
      for (const h of (holdingsRows || [])) {
        const from = new Date(h.effective_from).getTime();
        const to = h.effective_to ? new Date(h.effective_to).getTime() : Infinity;
        if (from <= now && now < to) {
          const price = currentQuotes.get(h.symbol) ?? Number(h.avg_cost);
          liveHV += Number(h.shares) * price;
        }
      }
      // Get current cash
      let liveCash = Number(portfolio.starting_cash);
      for (const c of (cashRows || [])) {
        const from = new Date(c.effective_from).getTime();
        const to = c.effective_to ? new Date(c.effective_to).getTime() : Infinity;
        if (from <= now && now < to) {
          liveCash = Number(c.amount);
        }
      }
      const liveV = Math.round((liveHV + liveCash) * 100) / 100;
      liveHV = Math.round(liveHV * 100) / 100;

      const livePoint = { t: new Date(now).toISOString(), v: liveV, hv: liveHV };
      const lastPoint = points[points.length - 1];
      const lastTs = new Date(lastPoint.t).getTime();
      // Replace if within 60s, else append
      if (now - lastTs < 60_000) {
        points[points.length - 1] = livePoint;
      } else {
        points.push(livePoint);
      }
    }

    const responseBody = JSON.stringify({
      points,
      range,
      available: points.length >= 2,
      message: points.length < 2 ? 'Not enough data yet. Make a trade to start tracking.' : undefined,
    });

    // Cache response
    responseCache.set(cacheKey, { body: responseBody, ts: Date.now() });

    return new Response(responseBody, {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('portfolio-performance error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
