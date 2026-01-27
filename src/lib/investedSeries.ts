/**
 * Invested Value Series Builder
 * 
 * Reads from value_history table (self-recorded snapshots) to build
 * the portfolio chart. Works with Finnhub free tier.
 */

import { supabase } from '@/integrations/supabase/client';
import { fetchMultipleQuotes } from '@/lib/finnhub';
import { TimeRange, getTimeRangeStartMs } from '@/lib/timeRange';

export interface InvestedValuePoint {
  timestamp: number; // ms
  investedValue: number;
}

interface BuildSeriesResult {
  series: InvestedValuePoint[];
  hasHistory: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Fetch current invested value for a portfolio (fallback when no history)
 */
async function fetchCurrentInvestedValue(portfolioId: string): Promise<number> {
  const { data: holdings } = await supabase
    .from('holdings')
    .select('symbol, shares, avg_cost')
    .eq('portfolio_id', portfolioId);

  if (!holdings || holdings.length === 0) return 0;

  const symbols = holdings.map(h => h.symbol);
  const quotes = await fetchMultipleQuotes(symbols);

  let investedValue = 0;
  for (const holding of holdings) {
    const quote = quotes.get(holding.symbol.toUpperCase());
    const price = quote?.price ?? holding.avg_cost;
    investedValue += holding.shares * price;
  }

  return round2(investedValue);
}

/**
 * Build invested value series from value_history snapshots
 * 
 * @param portfolioId - Portfolio to build series for
 * @param range - Time range to query (1D, 1W, 1M, etc.)
 */
export async function buildInvestedValueSeries(
  portfolioId: string,
  range: TimeRange
): Promise<BuildSeriesResult> {
  const nowMs = Date.now();
  const rangeStartMs = getTimeRangeStartMs(range, nowMs);
  const rangeStartISO = new Date(rangeStartMs).toISOString();

  try {
    // Query snapshots within the time range
    const { data: snapshots, error } = await supabase
      .from('value_history')
      .select('recorded_at, invested_value, value')
      .eq('portfolio_id', portfolioId)
      .gte('recorded_at', rangeStartISO)
      .order('recorded_at', { ascending: true });

    if (error) {
      console.error('[buildInvestedValueSeries] Query error:', error);
      throw error;
    }

    // Map snapshots to series points
    const series: InvestedValuePoint[] = [];
    
    for (const snap of snapshots || []) {
      const timestamp = new Date(snap.recorded_at).getTime();
      
      // Use invested_value if available, otherwise approximate from total value
      // (legacy snapshots may only have 'value' which includes cash)
      let investedValue: number;
      
      if (snap.invested_value !== null && snap.invested_value !== undefined) {
        investedValue = Number(snap.invested_value);
      } else if (snap.value !== null) {
        // Legacy fallback: can't perfectly extract invested-only value
        // but this is better than nothing
        investedValue = Number(snap.value);
      } else {
        continue; // Skip invalid snapshots
      }
      
      series.push({
        timestamp,
        investedValue: round2(investedValue),
      });
    }

    // If we have data points, ensure we also have a "now" point with current value
    if (series.length > 0) {
      const lastPoint = series[series.length - 1];
      const timeSinceLastPoint = nowMs - lastPoint.timestamp;
      
      // If last point is more than 1 minute old, add current value
      if (timeSinceLastPoint > 60_000) {
        const currentValue = await fetchCurrentInvestedValue(portfolioId);
        series.push({
          timestamp: nowMs,
          investedValue: currentValue,
        });
      }
      
      return { series, hasHistory: series.length >= 2 };
    }

    // No snapshots in range - try to get the most recent snapshot before range
    const { data: lastSnapshot } = await supabase
      .from('value_history')
      .select('recorded_at, invested_value, value')
      .eq('portfolio_id', portfolioId)
      .lt('recorded_at', rangeStartISO)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Get current value
    const currentValue = await fetchCurrentInvestedValue(portfolioId);

    if (lastSnapshot) {
      // We have a snapshot before the range start - use it as baseline
      const baselineValue = lastSnapshot.invested_value !== null 
        ? Number(lastSnapshot.invested_value) 
        : Number(lastSnapshot.value ?? 0);
      
      return {
        series: [
          { timestamp: rangeStartMs, investedValue: round2(baselineValue) },
          { timestamp: nowMs, investedValue: currentValue },
        ],
        hasHistory: true,
      };
    }

    // No history at all - show flat line at current value
    // Two identical points = $0 change, hasHistory=false shows "—%"
    return {
      series: [
        { timestamp: rangeStartMs, investedValue: currentValue },
        { timestamp: nowMs, investedValue: currentValue },
      ],
      hasHistory: false,
    };
  } catch (err) {
    console.error('[buildInvestedValueSeries] Failed:', err);
    
    // Fallback: current value only
    const currentValue = await fetchCurrentInvestedValue(portfolioId).catch(() => 0);
    
    return {
      series: [
        { timestamp: rangeStartMs, investedValue: currentValue },
        { timestamp: nowMs, investedValue: currentValue },
      ],
      hasHistory: false,
    };
  }
}
