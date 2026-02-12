import { useState, useEffect, useMemo, useCallback } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceDot } from 'recharts';
import { fetchSnapshots, SnapshotRow } from '@/lib/snapshots';
import { formatCurrency } from '@/lib/portfolio';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface PortfolioGrowthChartProps {
  portfolioId: string;
  portfolioCreatedAt: number;
  snapshotKey: number; // increment to trigger re-fetch
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

const formatYTick = (val: number): string => {
  const abs = Math.abs(val);
  if (abs >= 10000) {
    return `${val < 0 ? '-' : ''}$${(abs / 1000).toFixed(1)}k`;
  }
  if (abs >= 1000) {
    return `${val < 0 ? '-' : ''}$${Math.round(abs).toLocaleString()}`;
  }
  return `${val < 0 ? '-' : ''}$${abs.toFixed(2)}`;
};

const formatPLValue = (val: number): string => {
  const sign = val >= 0 ? '+' : '';
  return `${sign}${formatCurrency(val)}`;
};

function makeXTickFormatter(data: ChartPoint[]) {
  // Check if there are duplicate dates
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

  const delta = point._prevValue !== undefined ? point.investedPL - point._prevValue : null;

  return (
    <div className="rounded-lg border border-border/50 bg-card px-3 py-2 text-xs shadow-xl">
      <p className="text-muted-foreground">{dateStr} · {timeStr}</p>
      <p className={`text-sm font-semibold mt-1 ${point.investedPL >= 0 ? 'text-success' : 'text-destructive'}`}>
        {formatPLValue(point.investedPL)}
      </p>
      {delta !== null && (
        <p className="text-muted-foreground mt-0.5">
          {delta >= 0 ? '+' : ''}{formatCurrency(delta)} since last update
        </p>
      )}
      {point.source === 'trade' && (
        <Badge variant="outline" className="mt-1 text-[10px] px-1.5 py-0">Trade executed</Badge>
      )}
    </div>
  );
}

const PortfolioGrowthChart = ({ portfolioId, portfolioCreatedAt, snapshotKey, currentUnrealizedPL }: PortfolioGrowthChartProps) => {
  const [allSnapshots, setAllSnapshots] = useState<SnapshotRow[]>([]);
  const [selectedRange, setSelectedRange] = useState<TimeRange>('ALL');
  const [isLoading, setIsLoading] = useState(true);

  const loadSnapshots = useCallback(async () => {
    setIsLoading(true);
    const rows = await fetchSnapshots(portfolioId);
    setAllSnapshots(rows);
    setIsLoading(false);
  }, [portfolioId]);

  useEffect(() => {
    loadSnapshots();
  }, [loadSnapshots, snapshotKey]);

  // Filter to rows that have invested_value and cost_basis
  const validSnapshots = useMemo(() =>
    allSnapshots.filter(s => s.investedValue !== null && s.costBasis !== null),
    [allSnapshots]
  );

  // Determine available time ranges based on portfolio age
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

  // Filter snapshots by selected range
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

  // Y-axis domain with padding
  const yDomain = useMemo((): [number, number] => {
    if (filteredData.length === 0) return [-10, 10];
    const values = filteredData.map(d => d.investedPL);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    const padding = range < 1 ? Math.max(Math.abs(min) * 0.05, 5) : range * 0.08;
    
    let lo = min - padding;
    let hi = max + padding;
    
    // Include 0 if data crosses zero or is near it
    if (min >= 0 && lo > 0) lo = Math.min(lo, -padding * 0.5);
    if (max <= 0 && hi < 0) hi = Math.max(hi, padding * 0.5);
    
    return [lo, hi];
  }, [filteredData]);

  // Line color based on latest P/L
  const latestPL = filteredData.length > 0 ? filteredData[filteredData.length - 1].investedPL : 0;
  const lineColor = latestPL >= 0 ? 'hsl(var(--chart-positive))' : 'hsl(var(--chart-negative))';
  const gradientId = `pl-gradient-${portfolioId}`;

  // Trade dots
  const tradeDots = filteredData.filter(d => d.source === 'trade');

  // QA check
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

  if (isLoading) {
    return (
      <div className="glass-card p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-5 bg-muted rounded w-1/3" />
          <div className="h-[200px] bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-1">
        <div>
          <h2 className="text-lg font-semibold">Portfolio Growth</h2>
          <p className="text-xs text-muted-foreground">
            Tracks your portfolio value over time. Updates after trades and periodically.
          </p>
        </div>
        <div className="flex gap-1">
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
        <div className="h-[220px] mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={filteredData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
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
              <YAxis
                domain={yDomain}
                tickFormatter={formatYTick}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                width={60}
                tickCount={5}
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
