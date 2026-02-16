import { supabase } from '@/integrations/supabase/client';

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

/** Call the snapshot-portfolio edge function */
export const callSnapshotPortfolio = async (
  portfolioId: string,
  reason: 'trade' | 'view_load' | 'auto' | 'manual_refresh',
  tradeId?: string
): Promise<{
  total_value: number;
  holdings_value: number;
  cash_value: number;
  day_reference_value: number;
  cost_basis: number;
  snapshot_written: boolean;
  last_snapshot_at: string | null;
  stale: boolean;
  quote_coverage: number;
  quality: string;
} | null> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/snapshot-portfolio`;
    const body: Record<string, unknown> = { portfolio_id: portfolioId, reason };
    if (tradeId) body.trade_id = tradeId;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
};
