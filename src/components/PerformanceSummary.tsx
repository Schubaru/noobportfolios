import { TrendingUp, TrendingDown, DollarSign, Wallet, Activity } from 'lucide-react';
import { formatCurrency, formatPercent } from '@/lib/portfolio';
import { PortfolioMetrics } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { TimeRange } from '@/components/PortfolioGrowthChart';

interface PerformanceSummaryProps {
  metrics: PortfolioMetrics;
  cash: number;
  startingCash: number;
}

interface PerformanceHeaderProps extends PerformanceSummaryProps {
  selectedRange: TimeRange;
  onRangeChange: (range: TimeRange) => void;
  availableRanges: TimeRange[];
  rangeGain: number;
  rangeGainPercent: number;
}

const RANGE_LABELS: Record<TimeRange, string> = {
  '1D': 'today',
  '1W': 'past week',
  '1M': 'past month',
  'ALL': 'all-time',
};

export const PerformanceHeader = ({
  metrics,
  selectedRange,
  onRangeChange,
  availableRanges,
  rangeGain,
  rangeGainPercent,
}: PerformanceHeaderProps) => {
  const isPositive = rangeGain >= 0;
  const hasHoldings = metrics.holdingsValue > 0;

  return (
    <div className="mb-4">
      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
        Investing
      </p>
      <p className="text-4xl md:text-5xl font-bold tracking-tight">
        {formatCurrency(metrics.holdingsValue)}
      </p>
      {hasHoldings && (
        <div className="flex items-center justify-between gap-3 mt-2 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={cn(
              "flex items-center gap-1.5 px-2 py-1 rounded-md text-sm font-medium",
              isPositive ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
            )}>
              {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span>{isPositive ? '+' : ''}{formatCurrency(rangeGain)}</span>
              <span className="text-xs opacity-80">
                ({formatPercent(rangeGainPercent)})
              </span>
            </div>
            <span className="text-xs text-muted-foreground">{RANGE_LABELS[selectedRange]}</span>
          </div>
          <div className="flex gap-1">
            {availableRanges.map(range => (
              <Button
                key={range}
                variant={selectedRange === range ? 'default' : 'ghost'}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onRangeChange(range)}
              >
                {range}
              </Button>
            ))}
          </div>
        </div>
      )}
      {!hasHoldings && (
        <p className="text-sm text-muted-foreground mt-2">
          No investments yet. Start trading to see your portfolio value.
        </p>
      )}
    </div>
  );
};

export const PerformanceDetails = ({
  metrics,
  cash,
  startingCash
}: PerformanceSummaryProps) => {
  const isPositiveUnrealized = metrics.unrealizedPL >= 0;
  const isPositiveDaily = metrics.dailyPL !== null && metrics.dailyPL >= 0;
  const hasDailyData = metrics.hasDailyBaseline && metrics.dailyPL !== null;

  return (
    <div className="glass-card p-6">
      <h2 className="text-lg font-semibold mb-4">Portfolio position</h2>

      {/* Breakdown grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-3 rounded-lg bg-secondary/50">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Total invested</p>
          </div>
          <p className="text-lg font-semibold">{formatCurrency(metrics.costBasis)}</p>
        </div>

        <div className="p-3 rounded-lg bg-secondary/50">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="w-4 h-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Cash</p>
          </div>
          <p className="text-lg font-semibold">{formatCurrency(cash)}</p>
        </div>

        <div className="p-3 rounded-lg bg-secondary/50">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Gain/Loss</p>
          </div>
          <p className={cn("text-lg font-semibold", isPositiveUnrealized ? "text-success" : "text-destructive")}>
            {isPositiveUnrealized ? '+' : ''}{formatCurrency(metrics.unrealizedPL)}
          </p>
        </div>

        <div className="p-3 rounded-lg bg-secondary/50">
          <div className="flex items-center gap-2 mb-2">
            {hasDailyData && isPositiveDaily ? <TrendingUp className="w-4 h-4 text-muted-foreground" /> : hasDailyData ? <TrendingDown className="w-4 h-4 text-muted-foreground" /> : <Activity className="w-4 h-4 text-muted-foreground" />}
            <p className="text-xs text-muted-foreground">Today</p>
          </div>
          {hasDailyData ? (
            <p className={cn("text-lg font-semibold", isPositiveDaily ? "text-success" : "text-destructive")}>
              {isPositiveDaily ? '+' : ''}{formatCurrency(metrics.dailyPL!)}
              {metrics.dailyPLPercent !== null && (
                <span className="text-sm ml-1 opacity-80">
                  ({formatPercent(metrics.dailyPLPercent)})
                </span>
              )}
            </p>
          ) : (
            <p className="text-lg font-semibold text-muted-foreground">—</p>
          )}
        </div>
      </div>

      {/* Additional details */}
      <div className="mt-4 pt-4 border-t border-border/50">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Buying Power:</span>
            <span className="font-medium">{formatCurrency(cash)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Realized P/L:</span>
            <span className={cn("font-medium", metrics.realizedPL >= 0 ? "text-success" : "text-destructive")}>
              {metrics.realizedPL >= 0 ? '+' : ''}{formatCurrency(metrics.realizedPL)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Dividends:</span>
            <span className={cn("font-medium", metrics.totalDividends > 0 ? "text-success" : "text-muted-foreground")}>
              {metrics.totalDividends > 0 ? '+' : ''}{formatCurrency(metrics.totalDividends)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

const PerformanceSummary = ({
  metrics,
  cash,
  startingCash
}: PerformanceSummaryProps) => {
  return (
    <div>
      <div className="glass-card p-6">
        <PerformanceHeader
          metrics={metrics}
          cash={cash}
          startingCash={startingCash}
          selectedRange="ALL"
          onRangeChange={() => {}}
          availableRanges={['ALL']}
          rangeGain={metrics.unrealizedPL}
          rangeGainPercent={metrics.allTimePLPercent}
        />
      </div>
      <div className="mt-6">
        <PerformanceDetails metrics={metrics} cash={cash} startingCash={startingCash} />
      </div>
    </div>
  );
};

export default PerformanceSummary;
