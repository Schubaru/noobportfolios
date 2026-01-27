import { TimeRange, getTimeRangeStartMs } from '@/lib/timeRange';

export interface HistoricalClosePoint {
  timestamp: number; // ms
  close: number;
}

interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

type Resolution = '15' | 'D';

const resolveResolution = (range: TimeRange): Resolution => {
  // Keep this intentionally simple: intraday for 1D, daily closes otherwise.
  return range === '1D' ? '15' : 'D';
};

const candlesCache = new Map<string, { data: HistoricalClosePoint[]; expiry: number }>();

// 1D changes quickly; longer ranges are effectively immutable day-to-day.
const cacheTtlMsForRange = (range: TimeRange) => (range === '1D' ? 5 * 60_000 : 60 * 60_000);

export async function fetchHistoricalCloses(symbol: string, range: TimeRange): Promise<ApiResponse<HistoricalClosePoint[]>> {
  try {
    const upper = symbol.toUpperCase();
    const nowMs = Date.now();
    const fromMs = getTimeRangeStartMs(range, nowMs);
    const resolution = resolveResolution(range);

    const fromSec = Math.floor(fromMs / 1000);
    const toSec = Math.floor(nowMs / 1000);

    const cacheKey = `${upper}|${resolution}|${fromSec}|${toSec}`;
    const cached = candlesCache.get(cacheKey);
    if (cached && cached.expiry > nowMs) {
      return { data: cached.data, error: null };
    }

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/market-history?symbol=${encodeURIComponent(upper)}&resolution=${encodeURIComponent(resolution)}&from=${fromSec}&to=${toSec}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      }
    );

    const result = await response.json();
    if (!response.ok) {
      return { data: null, error: result?.error || 'Failed to fetch historical prices' };
    }

    const points: HistoricalClosePoint[] = (result?.candles || []).map((p: any) => ({
      timestamp: Number(p.timestamp),
      close: Number(p.close),
    }));

    candlesCache.set(cacheKey, { data: points, expiry: nowMs + cacheTtlMsForRange(range) });
    return { data: points, error: null };
  } catch (err) {
    console.error('Error fetching historical candles:', err);
    return { data: null, error: 'Network error' };
  }
}
