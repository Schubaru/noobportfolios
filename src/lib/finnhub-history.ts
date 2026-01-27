import { TimeRange } from '@/lib/timeRange';

export interface HistoricalClosePoint {
  timestamp: number; // ms
  close: number;
}

interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

/**
 * Finnhub free tier does NOT support historical candle data (403 Forbidden).
 * This function always returns an error to trigger the graceful fallback
 * in buildInvestedValueSeries, which will use current prices instead.
 * 
 * To enable historical charts, upgrade to a Finnhub paid plan and update
 * this function to call the market-history edge function.
 */
export async function fetchHistoricalCloses(_symbol: string, _range: TimeRange): Promise<ApiResponse<HistoricalClosePoint[]>> {
  // Always return error to trigger graceful fallback to current prices
  return {
    data: null,
    error: 'Historical data requires Finnhub premium subscription. Using current prices.',
  };
}
