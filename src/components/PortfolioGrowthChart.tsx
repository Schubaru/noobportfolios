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
}

interface ChartPoint {
  timestamp: number;
  unrealizedPLDelta: number;
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

interface PerformanceResponse {
  points: PerformancePoint[];
  range: string;
  available: boolean;
  message?: string;
  holdingsCount?: number;
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
  // Degrade for large portfolios
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

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const point: ChartPoint = payload[0].payload;
  const d = new Date(point.timestamp);
  const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const sign = point.unrealizedPLDelta >= 0 ? '+' : '';

  return (
    <div className="rounded-lg border border-border/50 bg-card px-3 py-2 text-xs shadow-xl">
      <p className="text-muted-foreground">{dateStr} · {timeStr}</p>
      <p className={`text-sm font-semibold mt-1 ${point.unrealizedPLDelta >= 0 ? 'text-success' : 'text-destructive'}`}>
        {sign}{formatCurrency(point.unrealizedPLDelta)}
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
    // Safety throttle: skip if less than 15s since last fetch
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
    lastFetchTimeRef.current = 0; // Reset throttle on range change
    loadData();
  }, [loadData]);

  // Reload on refreshKey change (trade, etc.)
  useEffect(() => {
    if (refreshKey > 0) {
      lastFetchTimeRef.current = 0; // Allow immediate fetch after trade
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

  const chartData = useMemo((): ChartPoint[] => {
    if (!perfData?.available || !perfData.points.length) return [];
    const firstWithHoldings = perfData.points.find(p => (p.hv ?? 0) > 0);
    if (!firstWithHoldings) return [];
    const baselineUPL = (firstWithHoldings.hv ?? 0) - (firstWithHoldings.cb ?? 0);

    return perfData.points.map(p => {
      const upl = (p.hv ?? 0) - (p.cb ?? 0);
      return {
        timestamp: new Date(p.t).getTime(),
        unrealizedPLDelta: upl - baselineUPL,
        portfolioValue: p.hv ?? 0,
      };
    });
  }, [perfData]);

  // Emit range stats whenever chart data changes
  useEffect(() => {
    if (!perfData?.available || !perfData.points?.length || !onRangeStats) return;
    const points = perfData.points;
    const firstHoldingsPoint = points.find(p => (p.hv ?? 0) > 0);
    if (!firstHoldingsPoint) {
      onRangeStats({ gain: 0, pct: 0 });
      return;
    }
    const baselineUPL = (firstHoldingsPoint.hv ?? 0) - (firstHoldingsPoint.cb ?? 0);
    // Use LAST point with hv > 0
    let lastHoldingsPoint = firstHoldingsPoint;
    for (let i = points.length - 1; i >= 0; i--) {
      if ((points[i].hv ?? 0) > 0) { lastHoldingsPoint = points[i]; break; }
    }
    const currentUPL = (lastHoldingsPoint.hv ?? 0) - (lastHoldingsPoint.cb ?? 0);
    const gain = currentUPL - baselineUPL;
    const baselineCB = firstHoldingsPoint.cb ?? 0;
    const pct = baselineCB > 0 ? gain / baselineCB : 0;
    onRangeStats({ gain, pct });
  }, [perfData, onRangeStats]);

  const yDomain = useMemo((): [number, number] => {
    if (chartData.length === 0) return [-10, 10];
    const values = chartData.map(d => d.unrealizedPLDelta);
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

  const latestPL = chartData.length > 0 ? chartData[chartData.length - 1].unrealizedPLDelta : 0;
  const lineColor = latestPL >= 0 ? 'hsl(var(--chart-positive))' : 'hsl(var(--chart-negative))';
  const gradientId = `pl-gradient-${portfolioId}`;

  const baselineUPL = useMemo(() => {
    if (!perfData?.available || !perfData.points.length) return 0;
    const first = perfData.points.find(p => (p.hv ?? 0) > 0);
    if (!first) return 0;
    return (first.hv ?? 0) - (first.cb ?? 0);
  }, [perfData]);

  // Index of first point with holdings (for hover clamping)
  const firstHoldingsIndex = useMemo(() => {
    if (!perfData?.available || !perfData.points.length) return -1;
    return perfData.points.findIndex(p => (p.hv ?? 0) > 0);
  }, [perfData]);

  const handleMouseMove = useCallback((state: any) => {
    if (!state?.activePayload?.length || !onHoverChange) return;
    isHoveringRef.current = true;
    const point: ChartPoint = state.activePayload[0].payload;
    if (hoverDebounceRef.current) cancelAnimationFrame(hoverDebounceRef.current);
    hoverDebounceRef.current = requestAnimationFrame(() => {
      // If hovering on a pre-investment point (hv=0), show gain=0
      if (point.portfolioValue <= 0) {
        onHoverChange({ portfolioValue: point.portfolioValue, gain: 0, gainPercent: 0, isHovering: true });
        return;
      }
      const gain = point.unrealizedPLDelta;
      const baselineCB = perfData?.points?.find(p => (p.hv ?? 0) > 0)?.cb ?? 0;
      const pct = baselineCB > 0 ? gain / baselineCB : 0;
      onHoverChange({ portfolioValue: point.portfolioValue, gain, gainPercent: pct, isHovering: true });
    });
  }, [onHoverChange, perfData]);

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
              dataKey="unrealizedPLDelta"
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
