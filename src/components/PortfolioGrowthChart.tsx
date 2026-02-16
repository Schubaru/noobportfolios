import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/portfolio';

export type TimeRange = '1D' | '1W' | '1M' | 'ALL';

interface PerformancePoint {
  t: string;
  v: number;
  hv: number;
}

interface PerformanceResponse {
  points: PerformancePoint[];
  range: string;
  available: boolean;
  message?: string;
}

interface ChartPoint {
  timestamp: number;
  investedPL: number;
  portfolioValue: number;
}

export interface ChartHoverState {
  portfolioValue: number;
  gain: number;
  gainPercent: number;
  isHovering: boolean;
}

export interface RangeStats {
  gain: number;
  pct: number;
}

interface PortfolioGrowthChartProps {
  portfolioId: string;
  selectedRange: TimeRange;
  refreshKey: number;
  onHoverChange?: (state: ChartHoverState | null) => void;
  onRangeStats?: (stats: RangeStats) => void;
}

const REFRESH_MS = 60_000;

async function fetchPerformance(portfolioId: string, range: TimeRange): Promise<PerformanceResponse | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/portfolio-performance?portfolio_id=${portfolioId}&range=${range}`;
    const res = await fetch(url, {
      headers: {
        'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const point: ChartPoint = payload[0].payload;
  const d = new Date(point.timestamp);
  const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const sign = point.investedPL >= 0 ? '+' : '';

  return (
    <div className="rounded-lg border border-border/50 bg-card px-3 py-2 text-xs shadow-xl">
      <p className="text-muted-foreground">{dateStr} · {timeStr}</p>
      <p className={`text-sm font-semibold mt-1 ${point.investedPL >= 0 ? 'text-success' : 'text-destructive'}`}>
        {sign}{formatCurrency(point.investedPL)}
      </p>
    </div>
  );
}

const PortfolioGrowthChart = ({ portfolioId, selectedRange, refreshKey, onHoverChange, onRangeStats }: PortfolioGrowthChartProps) => {
  const [perfData, setPerfData] = useState<PerformanceResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isHoveringRef = useRef(false);
  const hoverDebounceRef = useRef<number | null>(null);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  const loadData = useCallback(async () => {
    const data = await fetchPerformance(portfolioId, selectedRange);
    if (data) setPerfData(data);
    setIsLoading(false);
  }, [portfolioId, selectedRange]);

  // Initial load + range change
  useEffect(() => {
    setIsLoading(true);
    loadData();
  }, [loadData]);

  // Reload on refreshKey change (trade, etc.)
  useEffect(() => {
    if (refreshKey > 0) loadData();
  }, [refreshKey, loadData]);

  // Auto-refresh
  useEffect(() => {
    refreshTimerRef.current = setInterval(() => {
      if (!isHoveringRef.current) loadData();
    }, REFRESH_MS);
    return () => { if (refreshTimerRef.current) clearInterval(refreshTimerRef.current); };
  }, [loadData]);

  const chartData = useMemo((): ChartPoint[] => {
    if (!perfData?.available || !perfData.points.length) return [];
    const baselineV = perfData.points[0].v;

    return perfData.points.map(p => ({
      timestamp: new Date(p.t).getTime(),
      investedPL: p.v - baselineV,
      portfolioValue: p.v,
    }));
  }, [perfData]);

  // Emit range stats whenever chart data changes
  useEffect(() => {
    if (!perfData?.available || !perfData.points.length || !onRangeStats) return;
    const first = perfData.points[0].v;
    const last = perfData.points[perfData.points.length - 1].v;
    const gain = last - first;
    const pct = first > 0 ? gain / first : 0;
    onRangeStats({ gain, pct });
  }, [perfData, onRangeStats]);

  const yDomain = useMemo((): [number, number] => {
    if (chartData.length === 0) return [-10, 10];
    const values = chartData.map(d => d.investedPL);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    const padding = range < 1 ? Math.max(Math.abs(min) * 0.05, 5) : range * 0.08;
    let lo = min - padding;
    let hi = max + padding;
    if (min >= 0 && lo > 0) lo = Math.min(lo, -padding * 0.5);
    if (max <= 0 && hi < 0) hi = Math.max(hi, padding * 0.5);
    return [lo, hi];
  }, [chartData]);

  const latestPL = chartData.length > 0 ? chartData[chartData.length - 1].investedPL : 0;
  const lineColor = latestPL >= 0 ? 'hsl(var(--chart-positive))' : 'hsl(var(--chart-negative))';
  const gradientId = `pl-gradient-${portfolioId}`;

  const baselineV = chartData.length > 0 ? chartData[0].portfolioValue : 0;

  const handleMouseMove = useCallback((state: any) => {
    if (!state?.activePayload?.length || !onHoverChange) return;
    isHoveringRef.current = true;
    const point: ChartPoint = state.activePayload[0].payload;
    if (hoverDebounceRef.current) cancelAnimationFrame(hoverDebounceRef.current);
    hoverDebounceRef.current = requestAnimationFrame(() => {
      const gain = point.portfolioValue - baselineV;
      const pct = baselineV > 0 ? gain / baselineV : 0;
      onHoverChange({ portfolioValue: point.portfolioValue, gain, gainPercent: pct, isHovering: true });
    });
  }, [onHoverChange, baselineV]);

  const handleMouseLeave = useCallback(() => {
    isHoveringRef.current = false;
    if (hoverDebounceRef.current) cancelAnimationFrame(hoverDebounceRef.current);
    onHoverChange?.(null);
  }, [onHoverChange]);

  if (isLoading) {
    return (
      <div className="mt-4">
        <div className="animate-pulse"><div className="h-[200px] bg-muted rounded" /></div>
      </div>
    );
  }

  if (!perfData?.available || chartData.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center h-[200px] text-sm text-muted-foreground gap-2">
        <p>{perfData?.message || 'Your chart will fill in as you trade and check in.'}</p>
      </div>
    );
  }

  return (
    <div onMouseLeave={handleMouseLeave}>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lineColor} stopOpacity={0.3} />
                <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="timestamp" type="number" scale="time" domain={['dataMin', 'dataMax']} hide />
            <YAxis domain={yDomain} type="number" hide />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="investedPL"
              stroke={lineColor}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: lineColor }}
              isAnimationActive={true}
              animationDuration={300}
              animationEasing="ease-in-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default PortfolioGrowthChart;
