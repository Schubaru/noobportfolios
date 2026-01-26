import { TrendingUp, TrendingDown, Wallet, Coins } from 'lucide-react';
import { PortfolioMetrics } from '@/lib/types';
import { formatCurrency, formatPercent, formatPL } from '@/lib/portfolio';

interface MetricsGridProps {
  metrics: PortfolioMetrics;
  cash: number;
  onDividendClick?: () => void;
}

const MetricsGrid = ({ metrics, cash, onDividendClick }: MetricsGridProps) => {
  const hasDividends = metrics.totalDividends > 0;
  
  const stats = [
    {
      label: 'Daily P/L',
      value: formatPL(metrics.dailyPL),
      subValue: formatPercent(metrics.dailyPLPercent),
      icon: metrics.dailyPL >= 0 ? TrendingUp : TrendingDown,
      positive: metrics.dailyPL >= 0,
    },
    {
      label: 'Total Return',
      value: formatPL(metrics.totalReturnWithDividends),
      subValue: `${formatPercent(metrics.totalReturnWithDividendsPercent)} incl. dividends`,
      icon: metrics.totalReturnWithDividends >= 0 ? TrendingUp : TrendingDown,
      positive: metrics.totalReturnWithDividends >= 0,
      clickable: hasDividends,
      onClick: onDividendClick,
    },
    {
      label: 'Dividend Income',
      value: formatCurrency(metrics.totalDividends),
      subValue: hasDividends ? 'Click for breakdown' : 'No dividends yet',
      icon: Coins,
      positive: true,
      clickable: hasDividends,
      onClick: onDividendClick,
      special: 'dividend',
    },
    {
      label: 'Available Cash',
      value: formatCurrency(cash),
      icon: Wallet,
      positive: true,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {stats.map((stat) => (
        <div 
          key={stat.label}
          onClick={stat.clickable ? stat.onClick : undefined}
          className={`glass-card p-4 ${
            stat.clickable ? 'cursor-pointer hover:border-primary/50 transition-colors' : ''
          } ${stat.special === 'dividend' && hasDividends ? 'border-success/30' : ''}`}
        >
          <div className="flex items-center gap-2 mb-2">
            <stat.icon className={`w-4 h-4 ${
              stat.special === 'dividend' && hasDividends 
                ? 'text-success' 
                : stat.positive ? 'text-muted-foreground' : 'text-destructive'
            }`} />
            <span className="text-xs text-muted-foreground">{stat.label}</span>
          </div>
          <p className={`text-lg font-bold ${
            stat.special === 'dividend' && hasDividends
              ? 'text-success'
              : stat.positive ? 'text-foreground' : 'text-destructive'
          }`}>
            {stat.value}
          </p>
          {stat.subValue && (
            <p className={`text-xs ${
              stat.special === 'dividend' 
                ? 'text-muted-foreground'
                : stat.positive ? 'text-success' : 'text-destructive'
            }`}>
              {stat.subValue}
            </p>
          )}
        </div>
      ))}
    </div>
  );
};

export default MetricsGrid;
