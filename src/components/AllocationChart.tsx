import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Holding } from '@/lib/types';
import { calculateAllocation, getAssetClassLabel } from '@/lib/allocation';
import { formatCurrency } from '@/lib/portfolio';

interface AllocationChartProps {
  holdings: Holding[];
}

const AllocationChart = ({ holdings }: AllocationChartProps) => {
  const allocation = useMemo(() => calculateAllocation(holdings), [holdings]);

  if (allocation.length === 0) {
    return (
      <div className="glass-card p-6 text-center">
        <p className="text-muted-foreground">Add holdings to see asset allocation</p>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="glass-card px-3 py-2 text-sm">
          <p className="font-semibold">{getAssetClassLabel(data.assetClass)}</p>
          <p className="text-muted-foreground">{formatCurrency(data.value)}</p>
          <p className="text-primary font-medium">{data.percentage.toFixed(1)}%</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="glass-card p-6">
      <h3 className="text-sm font-semibold mb-4">Asset Allocation</h3>
      
      <div className="flex flex-col md:flex-row items-center gap-6">
        <div className="w-[180px] h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={allocation}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                paddingAngle={3}
                dataKey="percentage"
              >
                {allocation.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="flex-1 space-y-2 w-full">
          {allocation.map((item) => (
            <div key={item.assetClass} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-sm">{getAssetClassLabel(item.assetClass)}</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-medium">{item.percentage.toFixed(1)}%</span>
                <span className="text-xs text-muted-foreground ml-2">
                  {formatCurrency(item.value)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AllocationChart;
