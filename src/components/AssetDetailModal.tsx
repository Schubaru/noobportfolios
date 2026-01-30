import { useState, useEffect } from 'react';
import { X, TrendingUp, TrendingDown, ArrowRightLeft } from 'lucide-react';
import { Holding } from '@/lib/types';
import { fetchQuote, FinnhubQuote } from '@/lib/finnhub';
import { formatCurrency, formatPercent, formatShares } from '@/lib/portfolio';
import { getAssetClassLabel, getAssetClassColor } from '@/lib/allocation';

interface AssetDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  holding: Holding | null;
  onTrade: (symbol: string) => void;
}

const AssetDetailModal = ({ isOpen, onClose, holding, onTrade }: AssetDetailModalProps) => {
  const [quote, setQuote] = useState<FinnhubQuote | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && holding) {
      setIsLoading(true);
      fetchQuote(holding.symbol).then((result) => {
        setQuote(result.data);
        setIsLoading(false);
      });
    } else {
      setQuote(null);
    }
  }, [isOpen, holding]);

  if (!isOpen || !holding) return null;

  const currentPrice = quote?.price || holding.currentPrice || holding.avgCost;
  const previousClose = quote?.prevClose || holding.previousClose || holding.avgCost;
  const dayChange = quote?.change ?? (currentPrice - previousClose);
  const dayChangePercent = quote?.changePct ?? ((dayChange / previousClose) * 100);
  const isPositiveDay = dayChange >= 0;

  const positionValue = currentPrice * holding.shares;
  const costBasis = holding.avgCost * holding.shares;
  const unrealizedPL = positionValue - costBasis;
  const unrealizedPLPercent = (unrealizedPL / costBasis) * 100;
  const isPositivePosition = unrealizedPL >= 0;

  const handleTrade = () => {
    onClose();
    onTrade(holding.symbol);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-lg glass-card p-6 slide-up max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg hover:bg-secondary transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-2xl font-bold">{holding.symbol}</h2>
            <span 
              className="px-2 py-0.5 rounded-md text-xs font-medium"
              style={{ backgroundColor: `${getAssetClassColor(holding.assetClass)}20`, color: getAssetClassColor(holding.assetClass) }}
            >
              {getAssetClassLabel(holding.assetClass)}
            </span>
          </div>
          <p className="text-muted-foreground">{holding.name}</p>
        </div>

        {isLoading ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-16 bg-muted rounded-lg" />
            <div className="h-32 bg-muted rounded-lg" />
          </div>
        ) : (
          <>
            {/* Current Price */}
            <div className="mb-6">
              <p className="text-3xl font-bold">{formatCurrency(currentPrice)}</p>
              <div className={`flex items-center gap-2 ${isPositiveDay ? 'text-success' : 'text-destructive'}`}>
                {isPositiveDay ? (
                  <TrendingUp className="w-4 h-4" />
                ) : (
                  <TrendingDown className="w-4 h-4" />
                )}
                <span className="font-medium">
                  {isPositiveDay ? '+' : ''}{formatCurrency(dayChange)} ({formatPercent(dayChangePercent)})
                </span>
                <span className="text-muted-foreground text-sm">Today</span>
              </div>
            </div>

            {/* Market Stats */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="p-3 rounded-lg bg-secondary/50">
                <p className="text-xs text-muted-foreground mb-1">Open</p>
                <p className="font-medium">{quote?.dayOpen ? formatCurrency(quote.dayOpen) : '—'}</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/50">
                <p className="text-xs text-muted-foreground mb-1">Previous Close</p>
                <p className="font-medium">{formatCurrency(previousClose)}</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/50">
                <p className="text-xs text-muted-foreground mb-1">Day High</p>
                <p className="font-medium">{quote?.dayHigh ? formatCurrency(quote.dayHigh) : '—'}</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/50">
                <p className="text-xs text-muted-foreground mb-1">Day Low</p>
                <p className="font-medium">{quote?.dayLow ? formatCurrency(quote.dayLow) : '—'}</p>
              </div>
            </div>

            {/* Your Position */}
            <div className="border-t border-border pt-6 mb-6">
              <h3 className="text-sm font-semibold text-muted-foreground mb-4">YOUR POSITION</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-secondary/50">
                  <p className="text-xs text-muted-foreground mb-1">Shares</p>
                  <p className="font-medium">{formatShares(holding.shares)}</p>
                </div>
                <div className="p-3 rounded-lg bg-secondary/50">
                  <p className="text-xs text-muted-foreground mb-1">Avg Cost</p>
                  <p className="font-medium">{formatCurrency(holding.avgCost)}</p>
                </div>
                <div className="p-3 rounded-lg bg-secondary/50">
                  <p className="text-xs text-muted-foreground mb-1">Position Value</p>
                  <p className="font-medium">{formatCurrency(positionValue)}</p>
                </div>
                <div className="p-3 rounded-lg bg-secondary/50">
                  <p className="text-xs text-muted-foreground mb-1">Cost Basis</p>
                  <p className="font-medium">{formatCurrency(costBasis)}</p>
                </div>
                <div className="col-span-2 p-3 rounded-lg bg-secondary/50">
                  <p className="text-xs text-muted-foreground mb-1">Unrealized P/L</p>
                  <p className={`font-medium ${isPositivePosition ? 'text-success' : 'text-destructive'}`}>
                    {isPositivePosition ? '+' : ''}{formatCurrency(unrealizedPL)} ({formatPercent(unrealizedPLPercent)})
                  </p>
                </div>
              </div>
            </div>

            {/* Trade Button */}
            <button
              onClick={handleTrade}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all"
            >
              <ArrowRightLeft className="w-4 h-4" />
              Trade {holding.symbol}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default AssetDetailModal;
