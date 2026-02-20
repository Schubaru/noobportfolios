import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/portfolio';

export type TimeRange = '1D' | '1W' | '1M' | 'ALL';

interface PerformancePoint {
  t: string;
  v: number;
  hv: number;
  cb: number;
}

interface PerformanceResponse {
  points: PerformancePoint[];
  range: string;
  available: boolean;
  message?: string;
  holdingsCount?: number;
}

interface ChartPoint {
  timestamp: number;
  equity: number;
}

export interface ChartHoverState {
  equity: number;
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

function getRefreshMs(range: TimeRange, holdingsCount: number): number {
  const base = (() => {
    switch (range) {
      case '1D': return 15_000;
      case '1W': return 60_000;
      case '1M': return 60_000;
      case 'ALL': return 5 * 60_000;
    }
  })();
  return holdingsCount > 25 ? base * 2 : base;
}

const MIN_FETCH_INTERVAL_MS = 15_000;

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

function CustomTooltip({ active, payload, startEquity }: any) {
  if (!active || !payload?.length) return null;
  const point: ChartPoint = payload[0].payload;
  const d = new Date(point.timestamp);
  const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const delta = point.equity - (startEquity ?? point.equity);
  const sign = delta >= 0 ? '+' : '';

  return (
    <div className="rounded-lg border border-border/50 bg-card px-3 py-2 text-xs shadow-xl">
      <p className="text-muted-foreground">{dateStr} · {timeStr}</p>
      <p className="text-sm font-semibold mt-1">{formatCurrency(point.equity)}</p>
      <p className={`text-xs mt-0.5 ${delta >= 0 ? 'text-success' : 'text-destructive'}`}>
        {sign}{formatCurrency(delta)}
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
  const lastFetchTimeRef = useRef(0);
  const holdingsCountRef = useRef(0);

  const loadData = useCallback(async () => {
    const now = Date.now();
    if (now - lastFetchTimeRef.current < MIN_FETCH_INTERVAL_MS) return;
    lastFetchTimeRef.current = now;

    const data = await fetchPerformance(portfolioId, selectedRange);
    if (data) {
      setPerfData(data);
      if (data.holdingsCount !== undefined) {
        holdingsCountRef.current = data.holdingsCount;
      }
    }
    setIsLoading(false);
  }, [portfolioId, selectedRange]);

  // Initial load + range change
  useEffect(() => {
    setIsLoading(true);
    lastFetchTimeRef.current = 0;
    loadData();
  }, [loadData]);

  // Reload on refreshKey change
  useEffect(() => {
    if (refreshKey > 0) {
      lastFetchTimeRef.current = 0;
      loadData();
    }
  }, [refreshKey, loadData]);

  // Auto-refresh
  useEffect(() => {
    const ms = getRefreshMs(selectedRange, holdingsCountRef.current);
    refreshTimerRef.current = setInterval(() => {
      if (!isHoveringRef.current) loadData();
    }, ms);
    return () => { if (refreshTimerRef.current) clearInterval(refreshTimerRef.current); };
  }, [loadData, selectedRange]);

  // Map backend points to { timestamp, equity }
  const chartData = useMemo((): ChartPoint[] => {
    if (!perfData?.available || !perfData.points.length) return [];
    return perfData.points.map(p => ({
      timestamp: new Date(p.t).getTime(),
      equity: p.v,
    }));
  }, [perfData]);

  // Earliest equity in the range (baseline for gain calc)
  const startEquity = useMemo(() => {
    if (chartData.length === 0) return 0;
    return chartData[0].equity;
  }, [chartData]);

  // Emit range stats whenever chart data changes
  useEffect(() => {
    if (!onRangeStats || chartData.length === 0) return;
    const lastEquity = chartData[chartData.length - 1].equity;
    const gain = lastEquity - startEquity;
    const pct = startEquity > 0 ? (gain / startEquity) * 100 : 0;
    onRangeStats({ gain, pct });
  }, [chartData, startEquity, onRangeStats]);

  const yDomain = useMemo((): [number, number] => {
    if (chartData.length === 0) return [0, 10000];
    const values = chartData.map(d => d.equity);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    const padding = range < 1 ? Math.max(min * 0.01, 50) : range * 0.08;
    return [min - padding, max + padding];
  }, [chartData]);

  const lastEquity = chartData.length > 0 ? chartData[chartData.length - 1].equity : 0;
  const lineColor = lastEquity >= startEquity ? 'hsl(var(--chart-positive))' : 'hsl(var(--chart-negative))';
  const gradientId = `eq-gradient-${portfolioId}`;

  const handleMouseMove = useCallback((state: any) => {
    if (!state?.activePayload?.length || !onHoverChange) return;
    isHoveringRef.current = true;
    const point: ChartPoint = state.activePayload[0].payload;
    if (hoverDebounceRef.current) cancelAnimationFrame(hoverDebounceRef.current);
    hoverDebounceRef.current = requestAnimationFrame(() => {
      const gain = point.equity - startEquity;
      const pct = startEquity > 0 ? (gain / startEquity) * 100 : 0;
      onHoverChange({ equity: point.equity, gain, gainPercent: pct, isHovering: true });
    });
  }, [onHoverChange, startEquity]);

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
            <Tooltip content={<CustomTooltip startEquity={startEquity} />} />
            <Area
              type="monotone"
              dataKey="equity"
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
