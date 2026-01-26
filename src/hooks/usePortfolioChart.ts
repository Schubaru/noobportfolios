import { useState, useMemo } from 'react';
import { ValueSnapshot } from '@/lib/types';

export type TimeRange = '1D' | '1W' | '1M' | '3M' | 'YTD' | '1Y' | 'ALL';

interface UsePortfolioChartProps {
  valueHistory: ValueSnapshot[];
  currentValue: number;
}

interface ChartDataPoint {
  timestamp: number;
  value: number;
  date: string;
  index: number;
}

interface UsePortfolioChartReturn {
  chartData: ChartDataPoint[];
  startValue: number;
  currentValue: number;
  absoluteChange: number;
  percentChange: number;
  isPositive: boolean;
  isNeutral: boolean;
  hoverIndex: number | null;
  setHoverIndex: (index: number | null) => void;
  timeRange: TimeRange;
  setTimeRange: (range: TimeRange) => void;
  displayValue: number;
  displayChange: number;
  displayChangePercent: number;
  hasLimitedData: boolean;
}

const getTimeRangeStart = (range: TimeRange): number => {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  
  switch (range) {
    case '1D':
      return now - day;
    case '1W':
      return now - 7 * day;
    case '1M':
      return now - 30 * day;
    case '3M':
      return now - 90 * day;
    case 'YTD':
      return new Date(new Date().getFullYear(), 0, 1).getTime();
    case '1Y':
      return now - 365 * day;
    case 'ALL':
    default:
      return 0;
  }
};

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

export const usePortfolioChart = ({
  valueHistory,
  currentValue,
}: UsePortfolioChartProps): UsePortfolioChartReturn => {
  const [timeRange, setTimeRange] = useState<TimeRange>('1W');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const chartData = useMemo(() => {
    const rangeStart = getTimeRangeStart(timeRange);
    
    // Filter valueHistory based on time range
    let filtered = valueHistory.filter(v => v.timestamp >= rangeStart);
    
    // If no data in range, use all data
    if (filtered.length === 0 && valueHistory.length > 0) {
      filtered = [...valueHistory];
    }
    
    // Sort by timestamp
    filtered.sort((a, b) => a.timestamp - b.timestamp);
    
    // Convert to chart data points
    const points: ChartDataPoint[] = filtered.map((v, idx) => ({
      timestamp: v.timestamp,
      value: v.value,
      date: formatDateForRange(v.timestamp, timeRange),
      index: idx,
    }));
    
    // Add current value as the latest point if it's different from the last recorded value
    const lastRecorded = points[points.length - 1];
    if (!lastRecorded || Math.abs(lastRecorded.value - currentValue) > 0.01) {
      points.push({
        timestamp: Date.now(),
        value: currentValue,
        date: formatDateForRange(Date.now(), timeRange),
        index: points.length,
      });
    }
    
    return points;
  }, [valueHistory, currentValue, timeRange]);

  const startValue = chartData.length > 0 ? chartData[0].value : currentValue;
  const absoluteChange = currentValue - startValue;
  const percentChange = startValue > 0 ? (absoluteChange / startValue) * 100 : 0;
  const isPositive = absoluteChange > 0;
  const isNeutral = Math.abs(absoluteChange) < 0.01;

  // Compute display values based on hover state
  const displayValue = useMemo(() => {
    if (hoverIndex !== null && chartData[hoverIndex]) {
      return chartData[hoverIndex].value;
    }
    return currentValue;
  }, [hoverIndex, chartData, currentValue]);

  const displayChange = useMemo(() => {
    if (hoverIndex !== null && chartData[hoverIndex]) {
      return chartData[hoverIndex].value - startValue;
    }
    return absoluteChange;
  }, [hoverIndex, chartData, startValue, absoluteChange]);

  const displayChangePercent = useMemo(() => {
    if (startValue === 0) return 0;
    return (displayChange / startValue) * 100;
  }, [displayChange, startValue]);

  const hasLimitedData = chartData.length <= 2;

  return {
    chartData,
    startValue,
    currentValue,
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
  };
};
