import { fetchMultipleQuotes } from '@/lib/finnhub';
import { fetchHistoricalCloses, HistoricalClosePoint } from '@/lib/finnhub-history';
import { TimeRange, getTimeRangeStartMs } from '@/lib/timeRange';

export interface InvestedValuePoint {
  timestamp: number; // ms
  investedValue: number;
}

interface PositionLot {
  symbol: string;
  shares: number;
  avgCost?: number;
}

interface BuildInvestedValueSeriesOptions {
  /**
   * Optional test hook / dependency injection.
   * When provided, we skip backend loads and use these holdings.
   */
  holdings?: PositionLot[];
  /**
   * Optional test hook: provide historical closes (ms timestamps, close prices).
   */
  historicalProvider?: (symbol: string, range: TimeRange) => Promise<HistoricalClosePoint[]>;
  /**
   * Optional test hook: provide latest price for a symbol.
   */
  latestPriceProvider?: (symbols: string[]) => Promise<Map<string, number>>;
  nowMs?: number;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const seriesCache = new Map<string, { data: InvestedValuePoint[]; expiry: number }>();
const SERIES_TTL_MS = 60_000; // keep short; holdings/prices move.

const round2 = (n: number) => Math.round(n * 100) / 100;

const buildSeriesCacheKey = (portfolioId: string, range: TimeRange, holdings: PositionLot[]) => {
  const holdingsKey = holdings
    .slice()
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
    .map((h) => `${h.symbol.toUpperCase()}:${h.shares}`)
    .join('|');
  return `${portfolioId}|${range}|${holdingsKey}`;
};

const toDayKeyUtc = (timestampMs: number) => {
  const d = new Date(timestampMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const buildUnifiedGridKeys = (range: TimeRange, bySymbol: Map<string, HistoricalClosePoint[]>) => {
  if (range === '1D') {
    const keys = new Set<number>();
    for (const points of bySymbol.values()) {
      for (const p of points) keys.add(p.timestamp);
    }
    return Array.from(keys).sort((a, b) => a - b);
  }

  const keys = new Set<string>();
  for (const points of bySymbol.values()) {
    for (const p of points) keys.add(toDayKeyUtc(p.timestamp));
  }
  return Array.from(keys).sort();
};

const priceLookupForSymbol = (range: TimeRange, points: HistoricalClosePoint[]) => {
  if (points.length === 0) {
    return {
      get: (_key: number | string) => null as number | null,
    };
  }

  if (range === '1D') {
    // map exact timestamps; if missing at a grid key, carry forward last known close.
    const sorted = points.slice().sort((a, b) => a.timestamp - b.timestamp);
    const map = new Map<number, number>(sorted.map((p) => [p.timestamp, p.close] as const));
    const timestamps = sorted.map((p) => p.timestamp);

    return {
      get: (key: number | string) => {
        const t = Number(key);
        if (map.has(t)) return map.get(t)!;
        // find last candle before t
        let lo = 0;
        let hi = timestamps.length - 1;
        let bestIdx = -1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (timestamps[mid] <= t) {
            bestIdx = mid;
            lo = mid + 1;
          } else {
            hi = mid - 1;
          }
        }
        if (bestIdx === -1) return null;
        return map.get(timestamps[bestIdx]) ?? null;
      },
    };
  }

  // Daily ranges: map by YYYY-MM-DD (UTC); carry forward last known close.
  const sorted = points.slice().sort((a, b) => a.timestamp - b.timestamp);
  const dayKeys = sorted.map((p) => toDayKeyUtc(p.timestamp));
  const map = new Map<string, number>(sorted.map((p) => [toDayKeyUtc(p.timestamp), p.close] as const));

  return {
    get: (key: number | string) => {
      const k = String(key);
      if (map.has(k)) return map.get(k)!;
      // find last available day <= k
      let lo = 0;
      let hi = dayKeys.length - 1;
      let bestIdx = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (dayKeys[mid] <= k) {
          bestIdx = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      if (bestIdx === -1) return null;
      const bestKey = dayKeys[bestIdx];
      return map.get(bestKey) ?? null;
    },
  };
};

const defaultHistoricalProvider = async (symbol: string, range: TimeRange) => {
  const res = await fetchHistoricalCloses(symbol, range);
  if (!res.data) throw new Error(res.error || 'Missing historical data');
  return res.data;
};

const defaultLatestPriceProvider = async (symbols: string[]) => {
  const quotes = await fetchMultipleQuotes(symbols);
  const m = new Map<string, number>();
  for (const s of symbols) {
    const q = quotes.get(s.toUpperCase());
    if (q) m.set(s.toUpperCase(), q.price);
  }
  return m;
};

async function loadHoldingsFromBackend(portfolioId: string): Promise<PositionLot[]> {
  // Dynamic import so unit tests can run in non-browser environments
  // without evaluating the auth storage (localStorage) setup.
  const { supabase } = await import('@/integrations/supabase/client');

  const { data, error } = await supabase
    .from('holdings')
    .select('symbol, shares, avg_cost')
    .eq('portfolio_id', portfolioId);

  if (error) throw error;
  return (data || []).map((r: any) => ({
    symbol: String(r.symbol),
    shares: Number(r.shares),
    avgCost: Number(r.avg_cost),
  }));
}

/**
 * buildInvestedValueSeries(portfolioId, range) -> [{timestamp, investedValue}]
 *
 * Single source of truth for the line chart + header + hover.
 * - Excludes cash
 * - Aggregates across ALL holdings
 * - Uses historical close prices for the selected range
 */
export async function buildInvestedValueSeries(
  portfolioId: string,
  range: TimeRange,
  options: BuildInvestedValueSeriesOptions = {}
): Promise<{ series: InvestedValuePoint[]; hasHistory: boolean }>
{
  const nowMs = options.nowMs ?? Date.now();

  const holdings = (options.holdings ?? (await loadHoldingsFromBackend(portfolioId)))
    .filter((h) => h.shares > 0);

  // No holdings => invested value is 0.
  if (holdings.length === 0) {
    return { series: [{ timestamp: nowMs, investedValue: 0 }], hasHistory: true };
  }

  const cacheKey = buildSeriesCacheKey(portfolioId, range, holdings);
  const cached = seriesCache.get(cacheKey);
  if (cached && cached.expiry > nowMs) {
    return { series: cached.data, hasHistory: true };
  }

  const symbols = holdings.map((h) => h.symbol.toUpperCase());
  const historicalProvider = options.historicalProvider ?? defaultHistoricalProvider;
  const latestPriceProvider = options.latestPriceProvider ?? defaultLatestPriceProvider;

  try {
    // 1) Fetch historical closes per symbol (throttled)
    const bySymbol = new Map<string, HistoricalClosePoint[]>();
    for (let i = 0; i < symbols.length; i++) {
      if (i > 0) await delay(250);
      const sym = symbols[i];
      const points = await historicalProvider(sym, range);
      bySymbol.set(sym, points);
    }

    // 2) Build unified grid so holding order never matters
    const gridKeys = buildUnifiedGridKeys(range, bySymbol);
    if (gridKeys.length === 0) throw new Error('No historical data returned');

    // 3) Build price lookup per symbol
    const lookupBySymbol = new Map<string, ReturnType<typeof priceLookupForSymbol>>();
    for (const sym of symbols) {
      lookupBySymbol.set(sym, priceLookupForSymbol(range, bySymbol.get(sym) ?? []));
    }

    // 4) Aggregate invested value across ALL holdings at each grid point
    const series: InvestedValuePoint[] = [];
    for (const key of gridKeys) {
      let invested = 0;
      for (const lot of holdings) {
        const sym = lot.symbol.toUpperCase();
        const px = lookupBySymbol.get(sym)?.get(key);
        if (px === null || px === undefined) {
          // Missing symbol data => abort; we don't guess per-symbol baselines.
          throw new Error(`Missing historical price for ${sym} at grid point`);
        }
        invested += lot.shares * px;
      }

      // Convert grid key -> timestamp
      const ts = range === '1D'
        ? Number(key)
        : new Date(String(key) + 'T00:00:00.000Z').getTime();

      // Keep points in-range (Finnhub can return earlier data)
      const rangeStart = getTimeRangeStartMs(range, nowMs);
      if (ts >= rangeStart && ts <= nowMs) {
        series.push({ timestamp: ts, investedValue: round2(invested) });
      }
    }

    // 5) Ensure a final "now" point using latest prices
    const latestPx = await latestPriceProvider(symbols);
    let nowInvested = 0;
    for (const lot of holdings) {
      const sym = lot.symbol.toUpperCase();
      const px = latestPx.get(sym) ?? lot.avgCost ?? 0;
      nowInvested += lot.shares * px;
    }

    const finalPoint: InvestedValuePoint = { timestamp: nowMs, investedValue: round2(nowInvested) };
    const last = series[series.length - 1];
    if (!last || Math.abs(last.investedValue - finalPoint.investedValue) > 0.01) {
      series.push(finalPoint);
    }

    series.sort((a, b) => a.timestamp - b.timestamp);

    // Cache
    seriesCache.set(cacheKey, { data: series, expiry: nowMs + SERIES_TTL_MS });
    return { series, hasHistory: true };
  } catch (err) {
    // Hard rule: if history fails, compute *current* invested value across ALL holdings and show 0 change.
    console.error('[buildInvestedValueSeries] historical failed:', err);
    const latestPx = await latestPriceProvider(symbols).catch(() => new Map<string, number>());
    let nowInvested = 0;
    for (const lot of holdings) {
      const sym = lot.symbol.toUpperCase();
      const px = latestPx.get(sym) ?? lot.avgCost ?? 0;
      nowInvested += lot.shares * px;
    }
    const v = round2(nowInvested);
    // Two identical points => $ change is 0; percent should display as —%.
    return {
      series: [
        { timestamp: nowMs - 1000, investedValue: v },
        { timestamp: nowMs, investedValue: v },
      ],
      hasHistory: false,
    };
  }
}
