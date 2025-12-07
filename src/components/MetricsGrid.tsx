import { TrendingUp, TrendingDown, DollarSign, Percent, Wallet } from 'lucide-react';
import { PortfolioMetrics } from '@/lib/types';
import { formatCurrency, formatPercent, formatPL } from '@/lib/portfolio';

interface MetricsGridProps {
  metrics: PortfolioMetrics;
  cash: number;
}

const MetricsGrid = ({ metrics, cash }: MetricsGridProps) => {
  const stats = [
    {
      label: 'Total Value',
      value: formatCurrency(metrics.totalValue),
      icon: DollarSign,
      positive: true,
      highlight: true,
    },
    {
      label: 'Daily P/L',
      value: formatPL(metrics.dailyPL),
      subValue: formatPercent(metrics.dailyPLPercent),
      icon: metrics.dailyPL >= 0 ? TrendingUp : TrendingDown,
      positive: metrics.dailyPL >= 0,
    },
    {
      label: 'All-Time P/L',
      value: formatPL(metrics.allTimePL),
      subValue: formatPercent(metrics.allTimePLPercent),
      icon: metrics.allTimePL >= 0 ? TrendingUp : TrendingDown,
      positive: metrics.allTimePL >= 0,
    },
    {
      label: 'Cumulative Return',
      value: formatPercent(metrics.cumulativeReturn),
      icon: Percent,
      positive: metrics.cumulativeReturn >= 0,
    },
    {
      label: 'Available Cash',
      value: formatCurrency(cash),
      icon: Wallet,
      positive: true,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {stats.map((stat, index) => (
        <div 
          key={stat.label}
          className={`glass-card p-4 ${stat.highlight ? 'col-span-2 lg:col-span-1' : ''}`}
        >
          <div className="flex items-center gap-2 mb-2">
            <stat.icon className={`w-4 h-4 ${stat.positive ? 'text-muted-foreground' : 'text-destructive'}`} />
            <span className="text-xs text-muted-foreground">{stat.label}</span>
          </div>
          <p className={`text-lg font-bold ${
            stat.positive ? 'text-foreground' : 'text-destructive'
          }`}>
            {stat.value}
          </p>
          {stat.subValue && (
            <p className={`text-xs ${stat.positive ? 'text-success' : 'text-destructive'}`}>
              {stat.subValue}
            </p>
          )}
        </div>
      ))}
    </div>
  );
};

export default MetricsGrid;
