import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const usePortfolioTodaySummary = (portfolioIds: string[]) => {
  const [baselines, setBaselines] = useState<Map<string, number>>(new Map());

  const fetchBaselines = useCallback(async () => {
    if (portfolioIds.length === 0) return;

    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const { data, error } = await supabase
      .from('value_history')
      .select('portfolio_id, day_reference_value, recorded_at')
      .in('portfolio_id', portfolioIds)
      .not('day_reference_value', 'is', null)
      .gte('recorded_at', threeDaysAgo.toISOString())
      .order('portfolio_id')
      .order('recorded_at', { ascending: false })
      .limit(portfolioIds.length * 10);

    if (error || !data) return;

    // Dedupe: first row per portfolio_id is the most recent
    const map = new Map<string, number>();
    const seen = new Set<string>();
    for (const row of data) {
      if (!seen.has(row.portfolio_id)) {
        seen.add(row.portfolio_id);
        map.set(row.portfolio_id, Number(row.day_reference_value));
      }
    }
    setBaselines(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolioIds.join(',')]);

  useEffect(() => {
    fetchBaselines();
  }, [fetchBaselines]);

  const getTodayBaseline = useCallback(
    (portfolioId: string): number | null => baselines.get(portfolioId) ?? null,
    [baselines]
  );

  return { getTodayBaseline, refetchBaselines: fetchBaselines };
};
