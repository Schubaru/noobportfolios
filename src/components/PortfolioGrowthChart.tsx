import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer, ReferenceDot } from 'recharts';
import { fetchSnapshots, SnapshotRow } from '@/lib/snapshots';
import { formatCurrency } from '@/lib/portfolio';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface PortfolioGrowthChartProps {
  portfolioId: string;
  portfolioCreatedAt: number;
  snapshotKey: number;
  currentUnrealizedPL?: number;
}

interface ChartPoint {
  timestamp: number;
  investedPL: number;
  source: string | null;
  _prevValue?: number;
}

type TimeRange = '1D' | '1W' | '1M' | '3M' | '1Y' | 'ALL';

const RANGE_MS: Record<TimeRange, number> = {
  '1D': 24 * 60 * 60 * 1000,
  '1W': 7 * 24 * 60 * 60 * 1000,
  '1M': 30 * 24 * 60 * 60 * 1000,
  '3M': 90 * 24 * 60 * 60 * 1000,
  '1Y': 365 * 24 * 60 * 60 * 1000,
  'ALL': Infinity,
};

const PASSIVE_REFRESH_MS = 60_000;

const hasNewData = (current: SnapshotRow[], incoming: SnapshotRow[]): boolean => {
  if (current.length !== incoming.length) return true;
  if (current.length === 0) return false;
  return current[current.length - 1].id !== incoming[incoming.length - 1].id;
};

const formatPLValue = (val: number): string => {
  const sign = val >= 0 ? '+' : '';
  return `${sign}${formatCurrency(val)}`;
};

function makeXTickFormatter(data: ChartPoint[]) {
  const dateStrings = data.map(d => new Date(d.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  const hasDuplicates = new Set(dateStrings).size < dateStrings.length;

  const seen = new Set<string>();
  return (ts: number) => {
    const d = new Date(ts);
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (hasDuplicates) {
      const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      const label = `${dateStr} · ${timeStr}`;
      if (seen.has(label)) return '';
      seen.add(label);
      return label;
    }
    if (seen.has(dateStr)) return '';
    seen.add(dateStr);
    return dateStr;
  };
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const point: ChartPoint = payload[0].payload;
  const d = new Date(point.timestamp);
  const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  return (
    <div className="rounded-lg border border-border/50 bg-card px-3 py-2 text-xs shadow-xl">
      <p className="text-muted-foreground">{dateStr} · {timeStr}</p>
      <p className={`text-sm font-semibold mt-1 ${point.investedPL >= 0 ? 'text-success' : 'text-destructive'}`}>
        {formatPLValue(point.investedPL)}
      </p>
      {point.source === 'trade' && (
        <Badge variant="outline" className="mt-1 text-[10px] px-1.5 py-0">Trade executed</Badge>
      )}
    </div>
  );
}

const PortfolioGrowthChart = ({ portfolioId, portfolioCreatedAt, snapshotKey, currentUnrealizedPL }: PortfolioGrowthChartProps) => {
  const [allSnapshots, setAllSnapshots] = useState<SnapshotRow[]>([]);
  const [selectedRange, setSelectedRange] = useState<TimeRange>('ALL');
  const [isFirstLoad, setIsFirstLoad] = useState(true);

  const isHoveringRef = useRef(false);
  const pendingDataRef = useRef<SnapshotRow[] | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const passiveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const prevSnapshotKeyRef = useRef(snapshotKey);

  const applyData = useCallback((incoming: SnapshotRow[], highPriority: boolean) => {
    if (!hasNewData(allSnapshots, incoming)) return;
    if (!highPriority && isHoveringRef.current) {
      pendingDataRef.current = incoming;
      return;
    }
    setAllSnapshots(incoming);
  }, [allSnapshots]);

  const fetchInBackground = useCallback(async (highPriority = false) => {
    const rows = await fetchSnapshots(portfolioId);
    applyData(rows, highPriority);
  }, [portfolioId, applyData]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await fetchSnapshots(portfolioId);
      if (!cancelled) {
        setAllSnapshots(rows);
        setIsFirstLoad(false);
      }
    })();
    return () => { cancelled = true; };
  }, [portfolioId]);

  useEffect(() => {
    passiveTimerRef.current = setInterval(() => {
      fetchInBackground(false);
    }, PASSIVE_REFRESH_MS);
    return () => {
      if (passiveTimerRef.current) clearInterval(passiveTimerRef.current);
    };
  }, [fetchInBackground]);

  useEffect(() => {
    if (snapshotKey !== prevSnapshotKeyRef.current) {
      prevSnapshotKeyRef.current = snapshotKey;
      fetchInBackground(true);
    }
  }, [snapshotKey, fetchInBackground]);

  const handleMouseEnter = useCallback(() => {
    isHoveringRef.current = true;
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    isHoveringRef.current = false;
    if (pendingDataRef.current) {
      hoverTimeoutRef.current = setTimeout(() => {
        if (pendingDataRef.current) {
          setAllSnapshots(pendingDataRef.current);
          pendingDataRef.current = null;
        }
      }, 2000);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  const validSnapshots = useMemo(() =>
    allSnapshots.filter(s => s.investedValue !== null && s.costBasis !== null),
    [allSnapshots]
  );

  const availableRanges = useMemo((): TimeRange[] => {
    const ageMs = Date.now() - portfolioCreatedAt;
    const ageDays = ageMs / (24 * 60 * 60 * 1000);
    const ranges: TimeRange[] = ['1D'];
    if (ageDays >= 2) ranges.push('1W');
    if (ageDays >= 7) ranges.push('1M');
    if (ageDays >= 30) ranges.push('3M');
    if (ageDays >= 90) ranges.push('1Y');
    ranges.push('ALL');
    return ranges;
  }, [portfolioCreatedAt]);

  const filteredData = useMemo((): ChartPoint[] => {
    const now = Date.now();
    const cutoff = selectedRange === 'ALL' ? 0 : now - RANGE_MS[selectedRange];
    const filtered = validSnapshots
      .filter(s => s.timestamp >= cutoff)
      .sort((a, b) => a.timestamp - b.timestamp);
    return filtered.map((s, i): ChartPoint => ({
      timestamp: s.timestamp,
      investedPL: (s.investedValue ?? 0) - (s.costBasis ?? 0),
      source: s.source,
      _prevValue: i > 0 ? (filtered[i - 1].investedValue ?? 0) - (filtered[i - 1].costBasis ?? 0) : undefined,
    }));
  }, [validSnapshots, selectedRange]);

  const yDomain = useMemo((): [number, number] => {
    if (filteredData.length === 0) return [-10, 10];
    const values = filteredData.map(d => d.investedPL);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    const padding = range < 1 ? Math.max(Math.abs(min) * 0.05, 5) : range * 0.08;
    let lo = min - padding;
    let hi = max + padding;
    if (min >= 0 && lo > 0) lo = Math.min(lo, -padding * 0.5);
    if (max <= 0 && hi < 0) hi = Math.max(hi, padding * 0.5);
    return [lo, hi];
  }, [filteredData]);

  const latestPL = filteredData.length > 0 ? filteredData[filteredData.length - 1].investedPL : 0;
  const lineColor = latestPL >= 0 ? 'hsl(var(--chart-positive))' : 'hsl(var(--chart-negative))';
  const gradientId = `pl-gradient-${portfolioId}`;
  const tradeDots = filteredData.filter(d => d.source === 'trade');

  useEffect(() => {
    if (currentUnrealizedPL !== undefined && filteredData.length > 0) {
      const lastPL = filteredData[filteredData.length - 1].investedPL;
      const diff = Math.abs(lastPL - currentUnrealizedPL);
      if (diff > 0.01) {
        console.debug(`[PortfolioGrowthChart QA] Chart last P/L: ${lastPL.toFixed(2)}, live unrealizedPL: ${currentUnrealizedPL.toFixed(2)}, diff: ${diff.toFixed(2)}`);
      }
    }
  }, [filteredData, currentUnrealizedPL]);

  const xTickFormatter = useMemo(() => makeXTickFormatter(filteredData), [filteredData]);

  if (isFirstLoad && allSnapshots.length === 0) {
    return (
      <div className="mt-4">
        <div className="animate-pulse space-y-4">
          <div className="h-[200px] bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Time range controls */}
      <div className="flex justify-end mb-2">
        <div className="flex gap-1 flex-wrap">
          {availableRanges.map(range => (
            <Button
              key={range}
              variant={selectedRange === range ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setSelectedRange(range)}
            >
              {range}
            </Button>
          ))}
        </div>
      </div>

      {filteredData.length === 0 ? (
        <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
          Your chart will fill in as you trade and check in.
        </div>
      ) : filteredData.length === 1 ? (
        <div className="flex flex-col items-center justify-center h-[200px]">
          <p className={`text-2xl font-bold ${filteredData[0].investedPL >= 0 ? 'text-success' : 'text-destructive'}`}>
            {formatPLValue(filteredData[0].investedPL)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {new Date(filteredData[0].timestamp).toLocaleString()}
          </p>
        </div>
      ) : (
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={filteredData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={lineColor} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="timestamp"
                type="number"
                domain={['dataMin', 'dataMax']}
                tickFormatter={xTickFormatter}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                minTickGap={40}
              />
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
              {tradeDots.map((td, i) => (
                <ReferenceDot
                  key={`trade-${i}`}
                  x={td.timestamp}
                  y={td.investedPL}
                  r={4}
                  fill="hsl(var(--primary))"
                  stroke="hsl(var(--background))"
                  strokeWidth={2}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default PortfolioGrowthChart;
