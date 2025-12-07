import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { ValueSnapshot } from '@/lib/types';
import { formatCurrency } from '@/lib/portfolio';

interface PortfolioChartProps {
  valueHistory: ValueSnapshot[];
  className?: string;
}

const PortfolioChart = ({ valueHistory, className = '' }: PortfolioChartProps) => {
  const data = useMemo(() => {
    return valueHistory.map((snapshot, index) => ({
      index,
      value: snapshot.value,
      date: new Date(snapshot.timestamp).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
    }));
  }, [valueHistory]);

  const isPositive = data.length >= 2 && data[data.length - 1].value >= data[0].value;
  const minValue = Math.min(...data.map(d => d.value));
  const maxValue = Math.max(...data.map(d => d.value));
  const padding = (maxValue - minValue) * 0.1;

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="glass-card px-3 py-2 text-sm">
          <p className="font-semibold">{formatCurrency(payload[0].value)}</p>
          <p className="text-xs text-muted-foreground">{payload[0].payload.date}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className={`w-full h-[200px] ${className}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
          <defs>
            <linearGradient id="colorPositive" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorNegative" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.4} />
              <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis 
            dataKey="date" 
            axisLine={false} 
            tickLine={false}
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            interval="preserveStartEnd"
          />
          <YAxis 
            domain={[minValue - padding, maxValue + padding]}
            hide 
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="value"
            stroke={isPositive ? 'hsl(var(--primary))' : 'hsl(var(--destructive))'}
            strokeWidth={2}
            fill={isPositive ? 'url(#colorPositive)' : 'url(#colorNegative)'}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default PortfolioChart;
