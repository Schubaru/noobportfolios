import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer, ReferenceDot } from 'recharts';
import { fetchSnapshots, SnapshotRow } from '@/lib/snapshots';
import { formatCurrency } from '@/lib/portfolio';
import { Badge } from '@/components/ui/badge';

export type TimeRange = '1D' | '1W' | '1M' | 'ALL';

export function getWindowStart(range: TimeRange): number {
  const now = Date.now();
  switch (range) {
    case '1D': {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }
    case '1W': return now - 7 * 24 * 60 * 60 * 1000;
    case '1M': return now - 30 * 24 * 60 * 60 * 1000;
    case 'ALL': return 0;
  }
}

export function findBaseline(
  snapshots: SnapshotRow[],
  windowStart: number,
  range?: TimeRange
): SnapshotRow | null {
  const valid = snapshots.filter(s => s.investedValue != null);
  if (valid.length === 0) return null;

  // For 1D: always use the last snapshot BEFORE midnight (yesterday's close)
  if (range === '1D') {
    const before = valid
      .filter(s => s.timestamp < windowStart)
      .sort((a, b) => b.timestamp - a.timestamp);
    return before[0] ?? valid.sort((a, b) => a.timestamp - b.timestamp)[0] ?? null;
  }

  // For 1W/1M/ALL: prefer first snapshot at/after windowStart, fallback to nearest before
  const atOrAfter = valid
    .filter(s => s.timestamp >= windowStart)
    .sort((a, b) => a.timestamp - b.timestamp);
  if (atOrAfter.length > 0) return atOrAfter[0];

  const before = valid
    .filter(s => s.timestamp < windowStart)
    .sort((a, b) => b.timestamp - a.timestamp);
  return before[0] ?? null;
}

interface PortfolioGrowthChartProps {
  portfolioId: string;
  portfolioCreatedAt: number;
  snapshotKey: number;
  currentUnrealizedPL?: number;
  currentInvestedValue?: number;
  selectedRange: TimeRange;
  onDataReady?: (snapshots: SnapshotRow[]) => void;
}

interface ChartPoint {
  timestamp: number;
  investedPL: number;
  source: string | null;
}

const PASSIVE_REFRESH_MS = 60_000;

function downsample(points: ChartPoint[], maxPoints = 200): ChartPoint[] {
  if (points.length <= maxPoints) return points;
  const result: ChartPoint[] = [];
  const step = (points.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    result.push(points[Math.round(i * step)]);
  }
  const resultSet = new Set(result);
  for (const p of points) {
    if (p.source === 'trade' && !resultSet.has(p)) result.push(p);
  }
  return result.sort((a, b) => a.timestamp - b.timestamp);
}

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

const PortfolioGrowthChart = ({ portfolioId, portfolioCreatedAt, snapshotKey, currentUnrealizedPL, currentInvestedValue, selectedRange, onDataReady }: PortfolioGrowthChartProps) => {
  const [allSnapshots, setAllSnapshots] = useState<SnapshotRow[]>([]);
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

  // Expose raw snapshots to parent for gain/loss calculation
  useEffect(() => {
    onDataReady?.(validSnapshots);
  }, [validSnapshots, onDataReady]);

  const { windowStart, windowEnd } = useMemo(() => ({
    windowStart: getWindowStart(selectedRange),
    windowEnd: Date.now(),
  }), [selectedRange]);

  const filteredData = useMemo((): ChartPoint[] => {
    const baseline = findBaseline(validSnapshots, windowStart, selectedRange);
    if (!baseline) return [];
    const baselineValue = baseline.investedValue ?? 0;

    const filtered = validSnapshots
      .filter(s => s.timestamp >= windowStart)
      .sort((a, b) => a.timestamp - b.timestamp);

    // Start with baseline anchor at the left edge (P/L = 0 at baseline)
    const points: ChartPoint[] = [{
      timestamp: windowStart,
      investedPL: 0,
      source: null,
    }];

    // Add all in-window snapshots
    for (const s of filtered) {
      points.push({
        timestamp: s.timestamp,
        investedPL: (s.investedValue ?? 0) - baselineValue,
        source: s.source,
      });
    }

    // Append a "now" point at the right edge using live invested value
    const lastSnapshotValue = filtered.length > 0
      ? (filtered[filtered.length - 1].investedValue ?? 0)
      : baselineValue;
    const nowValue = currentInvestedValue ?? lastSnapshotValue;
    points.push({
      timestamp: windowEnd,
      investedPL: nowValue - baselineValue,
      source: null,
    });

    return downsample(points);
  }, [validSnapshots, windowStart, windowEnd, currentInvestedValue]);

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
      {filteredData.length < 2 ? (
        <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
          Your chart will fill in as you trade and check in.
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
                scale="time"
                domain={[windowStart, windowEnd]}
                allowDataOverflow={true}
                hide
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
