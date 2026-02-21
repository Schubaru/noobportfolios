import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Fetches two baselines per portfolio from value_history:
 *   1. day_reference_value (most recent non-null within 3 days)
 *   2. earliest snapshot value recorded today (ET midnight)
 */
export const usePortfolioTodaySummary = (portfolioIds: string[]) => {
  const [baselines, setBaselines] = useState<Map<string, number>>(new Map());
  const [earliestToday, setEarliestToday] = useState<Map<string, number>>(new Map());

  const fetchBaselines = useCallback(async () => {
    if (portfolioIds.length === 0) return;

    // --- Query 1: day_reference_value (existing logic) ---
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const { data: refData } = await supabase
      .from('value_history')
      .select('portfolio_id, day_reference_value, recorded_at')
      .in('portfolio_id', portfolioIds)
      .not('day_reference_value', 'is', null)
      .gte('recorded_at', threeDaysAgo.toISOString())
      .order('portfolio_id')
      .order('recorded_at', { ascending: false })
      .limit(portfolioIds.length * 10);

    const refMap = new Map<string, number>();
    if (refData) {
      const seen = new Set<string>();
      for (const row of refData) {
        if (!seen.has(row.portfolio_id)) {
          seen.add(row.portfolio_id);
          refMap.set(row.portfolio_id, Number(row.day_reference_value));
        }
      }
    }
    setBaselines(refMap);

    // --- Query 2: earliest snapshot value from today (ET) ---
    // Use America/New_York midnight as "today" boundary
    const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const todayMidnightET = new Date(nowET.getFullYear(), nowET.getMonth(), nowET.getDate());
    // Convert back to UTC ISO string
    const offsetMs = todayMidnightET.getTime() - new Date(todayMidnightET.toISOString()).getTime();
    const todayMidnightUTC = new Date(todayMidnightET.getTime() - offsetMs);

    const { data: snapData } = await supabase
      .from('value_history')
      .select('portfolio_id, value, recorded_at')
      .in('portfolio_id', portfolioIds)
      .gte('recorded_at', todayMidnightET.toISOString())
      .order('portfolio_id')
      .order('recorded_at', { ascending: true })
      .limit(portfolioIds.length * 5);

    const snapMap = new Map<string, number>();
    if (snapData) {
      const seen = new Set<string>();
      for (const row of snapData) {
        if (!seen.has(row.portfolio_id)) {
          seen.add(row.portfolio_id);
          snapMap.set(row.portfolio_id, Number(row.value));
        }
      }
    }
    setEarliestToday(snapMap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolioIds.join(',')]);

  useEffect(() => {
    fetchBaselines();
  }, [fetchBaselines]);

  const getTodayBaseline = useCallback(
    (portfolioId: string): number | null => baselines.get(portfolioId) ?? null,
    [baselines]
  );

  const getEarliestTodaySnapshot = useCallback(
    (portfolioId: string): number | null => earliestToday.get(portfolioId) ?? null,
    [earliestToday]
  );

  return { getTodayBaseline, getEarliestTodaySnapshot, refetchBaselines: fetchBaselines };
};
