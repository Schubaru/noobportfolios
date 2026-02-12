import { supabase } from '@/integrations/supabase/client';
import { Portfolio, PortfolioMetrics } from '@/lib/types';

export interface SnapshotRow {
  id: string;
  timestamp: number;
  value: number;
  investedValue: number | null;
  costBasis: number | null;
  unrealizedPL: number | null;
  realizedPL: number | null;
  source: string | null;
}

// Rate-limit: skip if last snapshot was < minMs ago (unless source is 'trade')
const shouldCapture = async (portfolioId: string, minMs = 5000): Promise<boolean> => {
  const { data } = await supabase
    .from('value_history')
    .select('recorded_at')
    .eq('portfolio_id', portfolioId)
    .order('recorded_at', { ascending: false })
    .limit(1);
  if (!data?.length) return true;
  return Date.now() - new Date(data[0].recorded_at).getTime() >= minMs;
};

export const hasSnapshotToday = async (portfolioId: string): Promise<boolean> => {
  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  const { data } = await supabase
    .from('value_history')
    .select('id')
    .eq('portfolio_id', portfolioId)
    .gte('recorded_at', startOfDay.toISOString())
    .lt('recorded_at', endOfDay.toISOString())
    .limit(1);

  return (data?.length ?? 0) > 0;
};

export const capturePortfolioSnapshot = async (
  portfolioId: string,
  portfolio: Portfolio,
  metrics: PortfolioMetrics,
  source: 'auto' | 'trade' | 'daily' | 'baseline'
): Promise<void> => {
  try {
    // Rate-limit: auto/baseline = 5s, trade/daily = 2min
    if (source === 'auto' || source === 'baseline') {
      const ok = await shouldCapture(portfolioId, 5000);
      if (!ok) return;
    } else if (source === 'trade' || source === 'daily') {
      const ok = await shouldCapture(portfolioId, 120_000);
      if (!ok) return;
    }

    const holdingsMetadata = portfolio.holdings.map(h => ({
      symbol: h.symbol,
      shares: h.shares,
      avgCost: h.avgCost,
      currentPrice: h.currentPrice ?? h.avgCost,
    }));

    await supabase.from('value_history').insert({
      portfolio_id: portfolioId,
      value: metrics.totalValue,
      invested_value: metrics.holdingsValue,
      cost_basis: metrics.costBasis,
      unrealized_pl: metrics.unrealizedPL,
      realized_pl: metrics.realizedPL,
      source,
      metadata: holdingsMetadata as any,
    });
  } catch (err) {
    console.warn('Snapshot capture failed:', err);
  }
};

export const fetchSnapshots = async (
  portfolioId: string,
  fromDate?: Date
): Promise<SnapshotRow[]> => {
  let query = supabase
    .from('value_history')
    .select('id, recorded_at, value, invested_value, cost_basis, unrealized_pl, realized_pl, source')
    .eq('portfolio_id', portfolioId)
    .order('recorded_at', { ascending: true });

  if (fromDate) {
    query = query.gte('recorded_at', fromDate.toISOString());
  }

  const { data, error } = await query;
  if (error || !data) return [];

  return data.map(row => ({
    id: row.id,
    timestamp: new Date(row.recorded_at).getTime(),
    value: Number(row.value),
    investedValue: row.invested_value != null ? Number(row.invested_value) : null,
    costBasis: row.cost_basis != null ? Number(row.cost_basis) : null,
    unrealizedPL: row.unrealized_pl != null ? Number(row.unrealized_pl) : null,
    realizedPL: row.realized_pl != null ? Number(row.realized_pl) : null,
    source: row.source,
  }));
};

export const getLastSnapshotAge = async (portfolioId: string): Promise<number | null> => {
  const { data } = await supabase
    .from('value_history')
    .select('recorded_at')
    .eq('portfolio_id', portfolioId)
    .order('recorded_at', { ascending: false })
    .limit(1);
  if (!data?.length) return null;
  return Date.now() - new Date(data[0].recorded_at).getTime();
};

export const ensureRecentSnapshot = async (
  portfolioId: string,
  portfolio: Portfolio,
  metrics: PortfolioMetrics
): Promise<void> => {
  if (portfolio.holdings.length === 0) return;
  const age = await getLastSnapshotAge(portfolioId);
  // Create if no snapshots or last one > 15 min old
  if (age === null || age >= 15 * 60 * 1000) {
    await capturePortfolioSnapshot(portfolioId, portfolio, metrics, 'baseline');
  }
};
