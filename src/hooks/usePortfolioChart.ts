import { useEffect, useMemo, useState } from 'react';
import { buildInvestedValueSeries } from '@/lib/investedSeries';
import { TimeRange } from '@/lib/timeRange';

interface ChartDataPoint {
  timestamp: number;
  value: number;
  date: string;
  index: number;
}

interface UsePortfolioChartReturn {
  chartData: ChartDataPoint[];
  startValue: number;
  absoluteChange: number;
  percentChange: number | null;
  isPositive: boolean;
  isNeutral: boolean;
  hoverIndex: number | null;
  setHoverIndex: (index: number | null) => void;
  timeRange: TimeRange;
  setTimeRange: (range: TimeRange) => void;
  displayValue: number;
  displayChange: number;
  displayChangePercent: number | null;
  hasLimitedData: boolean;
  isLoading: boolean;
  hasHistory: boolean;
}

const formatDateForRange = (timestamp: number, range: TimeRange): string => {
  const date = new Date(timestamp);
  
  if (range === '1D') {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  
  if (range === '1W') {
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

interface UsePortfolioChartProps {
  portfolioId: string;
  /** Any string that changes when holdings change (e.g., symbols+shares) */
  holdingsKey?: string;
}

export const usePortfolioChart = ({ portfolioId, holdingsKey }: UsePortfolioChartProps): UsePortfolioChartReturn => {
  const [timeRange, setTimeRange] = useState<TimeRange>('1W');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasHistory, setHasHistory] = useState(true);
  const [series, setSeries] = useState<Array<{ timestamp: number; investedValue: number }>>([]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setIsLoading(true);
      setHoverIndex(null);
      try {
        const { series, hasHistory } = await buildInvestedValueSeries(portfolioId, timeRange);
        if (cancelled) return;
        setSeries(series);
        setHasHistory(hasHistory);
      } catch (e) {
        // buildInvestedValueSeries already returns a safe fallback; this is just extra guard.
        console.error('[usePortfolioChart] failed to build series:', e);
        if (cancelled) return;
        setSeries([{ timestamp: Date.now(), investedValue: 0 }]);
        setHasHistory(false);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [portfolioId, timeRange, holdingsKey]);

  const chartData = useMemo((): ChartDataPoint[] => {
    return (series || []).map((p, idx) => ({
      timestamp: p.timestamp,
      value: p.investedValue,
      date: formatDateForRange(p.timestamp, timeRange),
      index: idx,
    }));
  }, [series, timeRange]);

  // Calculate changes ONLY from the series (single source of truth)
  const startValue = chartData.length > 0 ? chartData[0].value : 0;
  const endValue = chartData.length > 0 ? chartData[chartData.length - 1].value : 0;
  const absoluteChange = endValue - startValue;
  const percentChange = hasHistory && startValue > 0 ? (absoluteChange / startValue) * 100 : null;
  const isPositive = absoluteChange > 0;
  const isNeutral = Math.abs(absoluteChange) < 0.01;

  // Debug logging (dev only)
  // eslint-disable-next-line no-undef
  if (process.env.NODE_ENV === 'development') {
    console.log('[usePortfolioChart] Debug:', {
      startValue,
      endValue,
      absoluteChange,
      percentChange: percentChange === null ? '—' : percentChange.toFixed(2) + '%',
      chartDataPoints: chartData.length,
      mode: 'holdings_only',
      hasHistory,
    });
  }

  // Compute display values based on hover state
  // All values are HOLDINGS-ONLY (invested assets, excluding cash)
  const displayValue = useMemo(() => {
    if (hoverIndex !== null && chartData[hoverIndex]) {
      // Show holdings value at that point in time
      return chartData[hoverIndex].value;
    }
    return endValue; // End-of-range value
  }, [hoverIndex, chartData, endValue]);

  const displayChange = useMemo(() => {
    if (hoverIndex !== null && chartData[hoverIndex]) {
      return chartData[hoverIndex].value - startValue;
    }
    return absoluteChange;
  }, [hoverIndex, chartData, startValue, absoluteChange]);

  const displayChangePercent = useMemo(() => {
    // Avoid divide-by-zero AND avoid fake percent when history is unavailable.
    if (!hasHistory || startValue <= 0) return null;
    return (displayChange / startValue) * 100;
  }, [displayChange, startValue, hasHistory]);

  const hasLimitedData = chartData.length <= 2;

  return {
    chartData,
    startValue,
    absoluteChange,
    percentChange,
    isPositive,
    isNeutral,
    hoverIndex,
    setHoverIndex,
    timeRange,
    setTimeRange,
    displayValue,
    displayChange,
    displayChangePercent,
    hasLimitedData,
    isLoading,
    hasHistory,
  };
};

