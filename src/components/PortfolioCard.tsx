import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, ChevronRight, Sparkles, Coins } from 'lucide-react';
import { Portfolio, PortfolioMetrics } from '@/lib/types';
import { formatCurrency, formatPercent, formatPL } from '@/lib/portfolio';
import { calculateDiversityScore, getDiversityColor } from '@/lib/diversity';

interface PortfolioCardProps {
  portfolio: Portfolio;
  metrics: PortfolioMetrics;
}

const PortfolioCard = ({ portfolio, metrics }: PortfolioCardProps) => {
  const diversity = calculateDiversityScore(portfolio.holdings);
  const isPositiveDaily = metrics.dailyPL >= 0;
  const isPositiveTotalReturn = metrics.totalReturnWithDividends >= 0;
  const hasDividends = metrics.totalDividends > 0;

  return (
    <Link
      to={`/portfolio/${portfolio.id}`}
      className="glass-card p-5 hover-lift block group"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-lg font-semibold truncate">{portfolio.name}</h3>
            {portfolio.isExample && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs font-medium">
                <Sparkles className="w-3 h-3" />
                Example
              </span>
            )}
          </div>
          <p className="text-2xl font-bold text-foreground">
            {formatCurrency(metrics.totalValue)}
          </p>
        </div>
        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all" />
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Daily P/L</p>
          <div className={`flex items-center gap-1 ${isPositiveDaily ? 'text-success' : 'text-destructive'}`}>
            {isPositiveDaily ? (
              <TrendingUp className="w-3.5 h-3.5" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5" />
            )}
            <span className="text-sm font-medium">{formatPL(metrics.dailyPL)}</span>
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Total Return</p>
          <div className={`flex items-center gap-1 ${isPositiveTotalReturn ? 'text-success' : 'text-destructive'}`}>
            {isPositiveTotalReturn ? (
              <TrendingUp className="w-3.5 h-3.5" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5" />
            )}
            <span className="text-sm font-medium">{formatPercent(metrics.totalReturnWithDividendsPercent)}</span>
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Dividends</p>
          <div className={`flex items-center gap-1 ${hasDividends ? 'text-success' : 'text-muted-foreground'}`}>
            <Coins className="w-3.5 h-3.5" />
            <span className="text-sm font-medium">
              {hasDividends ? formatCurrency(metrics.totalDividends) : '$0.00'}
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Diversity</p>
          <div className="flex items-center gap-2">
            <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
              <div 
                className="h-full rounded-full transition-all duration-500"
                style={{ 
                  width: `${diversity.score}%`,
                  backgroundColor: getDiversityColor(diversity.score),
                }}
              />
            </div>
            <span className="text-sm font-medium">{diversity.score}</span>
          </div>
        </div>
      </div>
    </Link>
  );
};

export default PortfolioCard;
