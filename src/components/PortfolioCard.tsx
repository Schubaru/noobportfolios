import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, ChevronRight, Sparkles } from 'lucide-react';
import { Portfolio, PortfolioMetrics } from '@/lib/types';
import { formatCurrency, formatPercent, formatPL } from '@/lib/portfolio';
import { Badge } from '@/components/ui/badge';

interface PortfolioCardProps {
  portfolio: Portfolio;
  metrics: PortfolioMetrics;
}

const PortfolioCard = ({ portfolio, metrics }: PortfolioCardProps) => {
  const hasDailyData = metrics.hasDailyBaseline && metrics.dailyPL !== null;
  const isPositiveDaily = hasDailyData && metrics.dailyPL! >= 0;
  const isPositiveReturn = metrics.unrealizedPL >= 0;
  const hasHoldings = metrics.holdingsValue > 0;

  return (
    <Link
      to={`/portfolio/${portfolio.id}`}
      className="glass-card p-5 hover-lift block group"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="text-lg font-semibold truncate">{portfolio.name}</h3>
            {portfolio.isExample && (
              <Badge variant="secondary" className="flex items-center gap-1 text-xs">
                <Sparkles className="w-3 h-3" />
                Example
              </Badge>
            )}
          </div>
          <p className="text-2xl font-bold text-foreground">
            {formatCurrency(metrics.holdingsValue)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Daily P/L</p>
          <div className={`flex items-center gap-1 ${hasDailyData && hasHoldings ? (isPositiveDaily ? 'text-success' : 'text-destructive') : 'text-muted-foreground'}`}>
            {hasDailyData && hasHoldings ? (
              isPositiveDaily ? (
                <TrendingUp className="w-3.5 h-3.5" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5" />
              )
            ) : null}
            <span className="text-sm font-medium">
              {hasDailyData && hasHoldings ? formatPL(metrics.dailyPL!) : '—'}
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Total Return</p>
          <div className={`flex items-center gap-1 ${hasHoldings ? (isPositiveReturn ? 'text-success' : 'text-destructive') : 'text-muted-foreground'}`}>
            {hasHoldings ? (
              isPositiveReturn ? (
                <TrendingUp className="w-3.5 h-3.5" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5" />
              )
            ) : null}
            <span className="text-sm font-medium">
              {hasHoldings ? `${formatPL(metrics.unrealizedPL)} (${formatPercent(metrics.allTimePLPercent)})` : '—'}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
};

export default PortfolioCard;
