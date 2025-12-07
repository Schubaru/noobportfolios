import { TrendingUp, TrendingDown } from 'lucide-react';
import { Holding } from '@/lib/types';
import { formatCurrency, formatPercent } from '@/lib/portfolio';
import { getAssetClassLabel } from '@/lib/allocation';

interface HoldingsTableProps {
  holdings: Holding[];
  onTrade?: (symbol: string) => void;
}

const HoldingsTable = ({ holdings, onTrade }: HoldingsTableProps) => {
  if (holdings.length === 0) {
    return (
      <div className="glass-card p-8 text-center">
        <p className="text-muted-foreground">No holdings yet. Start trading to build your portfolio!</p>
      </div>
    );
  }

  return (
    <div className="glass-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Symbol</th>
              <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Type</th>
              <th className="text-right p-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Shares</th>
              <th className="text-right p-4 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">Avg Cost</th>
              <th className="text-right p-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Price</th>
              <th className="text-right p-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Value</th>
              <th className="text-right p-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">P/L</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((holding) => {
              const currentPrice = holding.currentPrice || holding.avgCost;
              const positionValue = currentPrice * holding.shares;
              const costBasis = holding.avgCost * holding.shares;
              const unrealizedPL = positionValue - costBasis;
              const unrealizedPLPercent = (unrealizedPL / costBasis) * 100;
              const isPositive = unrealizedPL >= 0;

              return (
                <tr 
                  key={holding.symbol}
                  className="border-b border-border/50 last:border-0 hover:bg-secondary/30 transition-colors cursor-pointer"
                  onClick={() => onTrade?.(holding.symbol)}
                >
                  <td className="p-4">
                    <div>
                      <p className="font-semibold text-foreground">{holding.symbol}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[120px]">{holding.name}</p>
                    </div>
                  </td>
                  <td className="p-4 hidden sm:table-cell">
                    <span className="px-2 py-1 rounded-md bg-secondary text-xs font-medium">
                      {getAssetClassLabel(holding.assetClass)}
                    </span>
                  </td>
                  <td className="p-4 text-right font-medium">{holding.shares}</td>
                  <td className="p-4 text-right text-muted-foreground hidden md:table-cell">
                    {formatCurrency(holding.avgCost)}
                  </td>
                  <td className="p-4 text-right font-medium">{formatCurrency(currentPrice)}</td>
                  <td className="p-4 text-right font-medium">{formatCurrency(positionValue)}</td>
                  <td className="p-4 text-right">
                    <div className={`flex items-center justify-end gap-1 ${isPositive ? 'text-success' : 'text-destructive'}`}>
                      {isPositive ? (
                        <TrendingUp className="w-3.5 h-3.5" />
                      ) : (
                        <TrendingDown className="w-3.5 h-3.5" />
                      )}
                      <span className="font-medium">{formatPercent(unrealizedPLPercent)}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default HoldingsTable;
