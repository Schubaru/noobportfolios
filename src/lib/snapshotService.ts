/**
 * Snapshot Service - Records portfolio value snapshots for chart history
 * 
 * This service enables the self-recorded chart system that works with
 * Finnhub free tier (no historical candle data required).
 */

import { supabase } from '@/integrations/supabase/client';
import { fetchMultipleQuotes } from '@/lib/finnhub';

/** Throttle: max 1 snapshot per 5 minutes per portfolio */
const SNAPSHOT_THROTTLE_MS = 5 * 60 * 1000;

/** In-memory throttle cache to avoid DB query on every call */
const lastSnapshotTime = new Map<string, number>();

interface SnapshotResult {
  recorded: boolean;
  investedValue?: number;
  portfolioValue?: number;
  error?: string;
}

/**
 * Check if enough time has passed since last snapshot
 */
async function shouldRecordSnapshot(portfolioId: string): Promise<boolean> {
  const now = Date.now();
  
  // Check in-memory cache first (fast path)
  const cached = lastSnapshotTime.get(portfolioId);
  if (cached && now - cached < SNAPSHOT_THROTTLE_MS) {
    return false;
  }
  
  // Check database for last snapshot
  const { data, error } = await supabase
    .from('value_history')
    .select('recorded_at')
    .eq('portfolio_id', portfolioId)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (error) {
    console.error('[snapshotService] Error checking last snapshot:', error);
    return true; // Allow on error to be safe
  }
  
  if (!data) return true; // No snapshots yet
  
  const lastRecorded = new Date(data.recorded_at).getTime();
  const shouldRecord = now - lastRecorded > SNAPSHOT_THROTTLE_MS;
  
  // Update cache
  if (!shouldRecord) {
    lastSnapshotTime.set(portfolioId, lastRecorded);
  }
  
  return shouldRecord;
}

/**
 * Record a portfolio value snapshot
 * 
 * @param portfolioId - The portfolio to snapshot
 * @param source - Where the snapshot was triggered from ('page_view', 'trade', 'scheduled')
 * @param force - Skip throttle check (used after trades)
 */
export async function recordPortfolioSnapshot(
  portfolioId: string,
  source: 'page_view' | 'trade' | 'scheduled' = 'page_view',
  force = false
): Promise<SnapshotResult> {
  try {
    // Check throttle (skip for forced snapshots like trades)
    if (!force) {
      const shouldRecord = await shouldRecordSnapshot(portfolioId);
      if (!shouldRecord) {
        return { recorded: false, error: 'Throttled - too soon since last snapshot' };
      }
    }
    
    // Fetch portfolio data
    const { data: portfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .select('cash')
      .eq('id', portfolioId)
      .maybeSingle();
    
    if (portfolioError || !portfolio) {
      return { recorded: false, error: 'Portfolio not found' };
    }
    
    // Fetch holdings
    const { data: holdings, error: holdingsError } = await supabase
      .from('holdings')
      .select('symbol, shares, avg_cost')
      .eq('portfolio_id', portfolioId);
    
    if (holdingsError) {
      return { recorded: false, error: 'Failed to fetch holdings' };
    }
    
    // Calculate invested value using current quotes
    let investedValue = 0;
    
    if (holdings && holdings.length > 0) {
      const symbols = holdings.map(h => h.symbol);
      const quotes = await fetchMultipleQuotes(symbols);
      
      for (const holding of holdings) {
        const quote = quotes.get(holding.symbol.toUpperCase());
        const price = quote?.price ?? holding.avg_cost;
        investedValue += holding.shares * price;
      }
    }
    
    const portfolioValue = investedValue + Number(portfolio.cash);
    
    // Insert snapshot
    const { error: insertError } = await supabase
      .from('value_history')
      .insert({
        portfolio_id: portfolioId,
        value: portfolioValue,
        invested_value: investedValue,
        source,
      });
    
    if (insertError) {
      console.error('[snapshotService] Insert error:', insertError);
      return { recorded: false, error: 'Failed to insert snapshot' };
    }
    
    // Update in-memory cache
    lastSnapshotTime.set(portfolioId, Date.now());
    
    console.log(`[snapshotService] Recorded snapshot: invested=$${investedValue.toFixed(2)}, total=$${portfolioValue.toFixed(2)}, source=${source}`);
    
    return {
      recorded: true,
      investedValue,
      portfolioValue,
    };
  } catch (err) {
    console.error('[snapshotService] Unexpected error:', err);
    return { recorded: false, error: 'Unexpected error' };
  }
}

/**
 * Clear the in-memory throttle cache for a portfolio
 * (useful after trades to allow immediate next snapshot)
 */
export function clearSnapshotThrottle(portfolioId: string): void {
  lastSnapshotTime.delete(portfolioId);
}
