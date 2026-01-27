import { TrendingUp, TrendingDown, DollarSign, Wallet, PiggyBank, Activity } from 'lucide-react';
import { formatCurrency, formatPercent } from '@/lib/portfolio';
import { PortfolioMetrics } from '@/lib/types';
import { cn } from '@/lib/utils';

interface PerformanceSummaryProps {
  metrics: PortfolioMetrics;
  cash: number;
  startingCash: number;
}

const PerformanceSummary = ({ metrics, cash, startingCash }: PerformanceSummaryProps) => {
  const isPositiveTotal = metrics.totalReturnWithDividends >= 0;
  const isPositiveDaily = metrics.dailyPL >= 0;
  const isPositiveUnrealized = metrics.unrealizedPL >= 0;
  
  // Calculate invested amount (money currently in holdings)
  const investedAmount = metrics.totalValue - cash;
  
  return (
    <div className="glass-card p-6">
      {/* Main value display */}
      <div className="mb-6">
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
          Total Portfolio Value
        </p>
        <p className="text-4xl md:text-5xl font-bold tracking-tight">
          {formatCurrency(metrics.totalValue)}
        </p>
        <div className="flex items-center gap-3 mt-2">
          <div className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-md text-sm font-medium",
            isPositiveTotal 
              ? "bg-success/10 text-success" 
              : "bg-destructive/10 text-destructive"
          )}>
            {isPositiveTotal ? (
              <TrendingUp className="w-4 h-4" />
            ) : (
              <TrendingDown className="w-4 h-4" />
            )}
            <span>{isPositiveTotal ? '+' : ''}{formatCurrency(metrics.totalReturnWithDividends)}</span>
            <span className="text-xs opacity-80">
              ({formatPercent(metrics.totalReturnWithDividendsPercent)})
            </span>
          </div>
          <span className="text-xs text-muted-foreground">all-time</span>
        </div>
      </div>

      {/* Breakdown grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Invested */}
        <div className="p-3 rounded-lg bg-secondary/50">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Invested</p>
          </div>
          <p className="text-lg font-semibold">{formatCurrency(investedAmount)}</p>
        </div>

        {/* Available Cash */}
        <div className="p-3 rounded-lg bg-secondary/50">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="w-4 h-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Cash</p>
          </div>
          <p className="text-lg font-semibold">{formatCurrency(cash)}</p>
        </div>

        {/* Unrealized P/L */}
        <div className="p-3 rounded-lg bg-secondary/50">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Unrealized</p>
          </div>
          <p className={cn(
            "text-lg font-semibold",
            isPositiveUnrealized ? "text-success" : "text-destructive"
          )}>
            {isPositiveUnrealized ? '+' : ''}{formatCurrency(metrics.unrealizedPL)}
          </p>
        </div>

        {/* Today's Change */}
        <div className="p-3 rounded-lg bg-secondary/50">
          <div className="flex items-center gap-2 mb-2">
            {isPositiveDaily ? (
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <TrendingDown className="w-4 h-4 text-muted-foreground" />
            )}
            <p className="text-xs text-muted-foreground">Today</p>
          </div>
          <p className={cn(
            "text-lg font-semibold",
            isPositiveDaily ? "text-success" : "text-destructive"
          )}>
            {isPositiveDaily ? '+' : ''}{formatCurrency(metrics.dailyPL)}
          </p>
        </div>
      </div>

      {/* Additional details */}
      <div className="mt-4 pt-4 border-t border-border/50">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Starting:</span>
            <span className="font-medium">{formatCurrency(startingCash)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Realized P/L:</span>
            <span className={cn(
              "font-medium",
              metrics.realizedPL >= 0 ? "text-success" : "text-destructive"
            )}>
              {metrics.realizedPL >= 0 ? '+' : ''}{formatCurrency(metrics.realizedPL)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Dividends:</span>
            <span className={cn(
              "font-medium",
              metrics.totalDividends > 0 ? "text-success" : "text-muted-foreground"
            )}>
              {metrics.totalDividends > 0 ? '+' : ''}{formatCurrency(metrics.totalDividends)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PerformanceSummary;
