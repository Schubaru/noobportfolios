import { useCallback, useRef } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { usePortfolioChart, TimeRange } from '@/hooks/usePortfolioChart';
import { ValueSnapshot } from '@/lib/types';
import { formatCurrency } from '@/lib/portfolio';
import ChartHeader from './ChartHeader';
import TimeRangeSelector from './TimeRangeSelector';

interface InteractivePortfolioChartProps {
  valueHistory: ValueSnapshot[];
  currentValue: number; // Current holdings value (excluding cash)
  cash: number; // Current cash balance (for adjusting historical values)
  className?: string;
}

const InteractivePortfolioChart = ({
  valueHistory,
  currentValue,
  cash,
  className = '',
}: InteractivePortfolioChartProps) => {
  const chartRef = useRef<HTMLDivElement>(null);
  
  const {
    chartData,
    startValue,
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
  } = usePortfolioChart({ valueHistory, currentValue, cash });

  // Calculate Y-axis domain with padding
  const values = chartData.map((d) => d.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const padding = (maxValue - minValue) * 0.15 || maxValue * 0.05;

  // Determine chart colors based on performance
  const lineColor = isNeutral
    ? 'hsl(var(--muted-foreground))'
    : isPositive
    ? 'hsl(var(--chart-positive))'
    : 'hsl(var(--chart-negative))';

  const gradientId = isNeutral
    ? 'colorNeutral'
    : isPositive
    ? 'colorPositive'
    : 'colorNegative';

  // Handle mouse/touch interaction
  const handleMouseMove = useCallback(
    (state: any) => {
      if (state?.activeTooltipIndex !== undefined) {
        setHoverIndex(state.activeTooltipIndex);
      }
    },
    [setHoverIndex]
  );

  const handleMouseLeave = useCallback(() => {
    setHoverIndex(null);
  }, [setHoverIndex]);

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload;
      const changeFromStart = dataPoint.value - startValue;
      const changePercent = startValue > 0 ? (changeFromStart / startValue) * 100 : 0;
      const isUp = changeFromStart >= 0;

      return (
        <div className="glass-card px-3 py-2 text-sm border border-border/50">
          <p className="font-semibold">{formatCurrency(dataPoint.value)}</p>
          <p className={`text-xs ${isUp ? 'text-success' : 'text-destructive'}`}>
            {isUp ? '+' : ''}{formatCurrency(changeFromStart)} ({isUp ? '+' : ''}{changePercent.toFixed(2)}%)
          </p>
          <p className="text-xs text-muted-foreground mt-1">{dataPoint.date}</p>
        </div>
      );
    }
    return null;
  };

  // Custom active dot
  const CustomActiveDot = (props: any) => {
    const { cx, cy } = props;
    if (cx === undefined || cy === undefined) return null;
    
    return (
      <g>
        {/* Outer glow */}
        <circle
          cx={cx}
          cy={cy}
          r={8}
          fill={lineColor}
          opacity={0.3}
        />
        {/* Inner dot */}
        <circle
          cx={cx}
          cy={cy}
          r={4}
          fill={lineColor}
          stroke="hsl(var(--background))"
          strokeWidth={2}
        />
      </g>
    );
  };

  return (
    <div className={`${className}`}>
      {/* Dynamic Header */}
      <ChartHeader
        value={displayValue}
        change={displayChange}
        changePercent={displayChangePercent}
        isHovering={hoverIndex !== null}
        hoverDate={hoverIndex !== null ? chartData[hoverIndex]?.date : undefined}
      />

      {/* Chart Container */}
      <div ref={chartRef} className="w-full h-[220px] -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            <defs>
              <linearGradient id="colorPositive" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--chart-positive))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--chart-positive))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorNegative" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--chart-negative))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--chart-negative))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorNeutral" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.2} />
                <stop offset="95%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0} />
              </linearGradient>
            </defs>

            {/* Baseline reference line at start value */}
            <ReferenceLine
              y={startValue}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="4 4"
              strokeOpacity={0.4}
            />

            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              interval="preserveStartEnd"
              minTickGap={50}
            />

            <YAxis
              domain={[minValue - padding, maxValue + padding]}
              hide
            />

            <Tooltip
              content={<CustomTooltip />}
              cursor={{
                stroke: 'hsl(var(--muted-foreground))',
                strokeWidth: 1,
                strokeDasharray: '4 4',
              }}
            />

            <Area
              type="monotone"
              dataKey="value"
              stroke={lineColor}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              activeDot={<CustomActiveDot />}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Time Range Selector */}
      <div className="mt-4 flex items-center justify-between gap-4">
        <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
      </div>

      {/* Helper text */}
      <p className="text-xs text-muted-foreground mt-4">
        {hasLimitedData
          ? 'Limited historical data available. More data points will appear as the portfolio updates.'
          : "Chart shows the value of your invested assets over time (excluding available cash)."}
      </p>
    </div>
  );
};

export default InteractivePortfolioChart;
