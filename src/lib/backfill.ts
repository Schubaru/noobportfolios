import { supabase } from '@/integrations/supabase/client';
import { SnapshotRow } from '@/lib/snapshots';
import { Holding } from '@/lib/types';

interface HoldingAtTime {
  symbol: string;
  shares: number;
  avgCost: number;
}

/**
 * Backfill daily close snapshots for days when the user was offline.
 * Uses market-history edge function to get daily candle close prices
 * and reconstructs approximate portfolio values.
 */
export async function backfillDailyCloses(
  portfolioId: string,
  holdings: Holding[],
  existingSnapshots: SnapshotRow[]
): Promise<boolean> {
  if (holdings.length === 0 || existingSnapshots.length === 0) return false;

  const sorted = [...existingSnapshots].sort((a, b) => a.timestamp - b.timestamp);
  const firstTimestamp = sorted[0].timestamp;
  const now = Date.now();

  // Build set of dates (YYYY-MM-DD) that already have snapshots
  const coveredDates = new Set<string>();
  for (const s of sorted) {
    coveredDates.add(new Date(s.timestamp).toISOString().slice(0, 10));
  }

  // Find gap days (dates with no snapshots between first snapshot and yesterday)
  const gapDays: string[] = [];
  const oneDayMs = 24 * 60 * 60 * 1000;
  const yesterday = new Date(now - oneDayMs);
  const currentDate = new Date(firstTimestamp);
  currentDate.setUTCHours(0, 0, 0, 0);

  while (currentDate <= yesterday) {
    const dateStr = currentDate.toISOString().slice(0, 10);
    if (!coveredDates.has(dateStr)) {
      gapDays.push(dateStr);
    }
    currentDate.setTime(currentDate.getTime() + oneDayMs);
  }

  if (gapDays.length === 0) return false;

  // Limit backfill to 30 gap days max per run to avoid API overload
  const daysToFill = gapDays.slice(0, 30);

  // Determine holdings at the time by finding the nearest snapshot with metadata
  // For simplicity, use the current holdings (this is approximate for backfill)
  const symbols = [...new Set(holdings.map(h => h.symbol))];

  // Fetch daily candles for each symbol covering the full gap range
  const fromTs = Math.floor(new Date(daysToFill[0]).getTime() / 1000);
  const toTs = Math.floor(new Date(daysToFill[daysToFill.length - 1]).getTime() / 1000) + 86400;

  const candlesBySymbol = new Map<string, Map<string, number>>();

  // Fetch candles sequentially to avoid rate limits
  for (const symbol of symbols) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/market-history?symbol=${encodeURIComponent(symbol)}&from=${fromTs}&to=${toTs}&resolution=D`;
      const res = await fetch(url, {
        headers: {
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
      });

      if (!res.ok) continue;

      const data = await res.json();
      if (!data.candles || !Array.isArray(data.candles)) continue;

      const dateMap = new Map<string, number>();
      for (const candle of data.candles) {
        const dateStr = new Date(candle.timestamp).toISOString().slice(0, 10);
        dateMap.set(dateStr, candle.close);
      }
      candlesBySymbol.set(symbol, dateMap);

      // Small delay between symbols to respect rate limits
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      console.warn(`Backfill: failed to fetch candles for ${symbol}:`, err);
    }
  }

  if (candlesBySymbol.size === 0) return false;

  // Build snapshots for each gap day
  const rows: Array<{
    portfolio_id: string;
    value: number;
    invested_value: number;
    cost_basis: number;
    unrealized_pl: number;
    source: string;
    recorded_at: string;
  }> = [];

  const costBasis = holdings.reduce((sum, h) => sum + h.avgCost * h.shares, 0);

  for (const dateStr of daysToFill) {
    let investedValue = 0;
    let allFound = true;

    for (const h of holdings) {
      const dateMap = candlesBySymbol.get(h.symbol);
      const closePrice = dateMap?.get(dateStr);
      if (closePrice != null) {
        investedValue += closePrice * h.shares;
      } else {
        // No candle for this day (weekend/holiday) — skip this day
        allFound = false;
        break;
      }
    }

    if (!allFound) continue;

    rows.push({
      portfolio_id: portfolioId,
      value: investedValue,
      invested_value: investedValue,
      cost_basis: costBasis,
      unrealized_pl: investedValue - costBasis,
      source: 'backfill',
      recorded_at: `${dateStr}T20:00:00.000Z`, // 4 PM ET approximate market close
    });
  }

  if (rows.length === 0) return false;

  // Insert in batches
  const { error } = await supabase.from('value_history').insert(rows);
  if (error) {
    console.warn('Backfill insert failed:', error);
    return false;
  }

  console.log(`Backfill: inserted ${rows.length} daily close snapshots`);
  return true;
}
