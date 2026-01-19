import { X, Coins, Calendar, TrendingUp } from 'lucide-react';
import { Portfolio, DividendPaymentRecord } from '@/lib/types';
import { formatCurrency } from '@/lib/portfolio';
import { calculateDividendsBySymbol, getRecentDividends } from '@/lib/dividends';

interface DividendBreakdownProps {
  isOpen: boolean;
  onClose: () => void;
  portfolio: Portfolio;
}

const DividendBreakdown = ({ isOpen, onClose, portfolio }: DividendBreakdownProps) => {
  if (!isOpen) return null;

  const totalDividends = portfolio.totalDividendsEarned || 
    (portfolio.dividendHistory || []).reduce((sum, d) => sum + d.totalAmount, 0);
  
  const dividendsBySymbol = calculateDividendsBySymbol(portfolio);
  const recentDividends = getRecentDividends(portfolio, 180); // Last 6 months

  // Sort by total dividends earned
  const sortedBySymbol = Array.from(dividendsBySymbol.entries())
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-lg glass-card slide-up overflow-hidden max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card z-10">
          <div className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-success" />
            <h2 className="text-lg font-bold">Dividend Income</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* Total Summary */}
          <div className="p-4 rounded-xl bg-success/10 border border-success/20">
            <p className="text-sm text-muted-foreground mb-1">Total Dividend Income</p>
            <p className="text-3xl font-bold text-success">{formatCurrency(totalDividends)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Credited to your available cash
            </p>
          </div>

          {/* No Dividends State */}
          {sortedBySymbol.length === 0 && (
            <div className="text-center py-8">
              <Coins className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No dividends received yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Dividends will appear here once they are paid
              </p>
            </div>
          )}

          {/* By Asset Breakdown */}
          {sortedBySymbol.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
                <h3 className="font-semibold">Earnings by Asset</h3>
              </div>
              <div className="space-y-2">
                {sortedBySymbol.map(([symbol, amount]) => {
                  const holding = portfolio.holdings.find(h => h.symbol === symbol);
                  const percentage = totalDividends > 0 ? (amount / totalDividends) * 100 : 0;
                  
                  return (
                    <div 
                      key={symbol}
                      className="p-3 rounded-lg bg-secondary/50 flex items-center justify-between"
                    >
                      <div>
                        <p className="font-medium text-primary">{symbol}</p>
                        <p className="text-xs text-muted-foreground">
                          {holding?.name || 'Unknown'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-success">{formatCurrency(amount)}</p>
                        <p className="text-xs text-muted-foreground">
                          {percentage.toFixed(1)}% of total
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recent Payments */}
          {recentDividends.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <h3 className="font-semibold">Recent Payments</h3>
              </div>
              <div className="space-y-2">
                {recentDividends.slice(0, 10).map((payment: DividendPaymentRecord) => (
                  <div 
                    key={payment.id}
                    className="p-3 rounded-lg bg-secondary/50 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <span className="px-2 py-1 rounded-md bg-success/10 text-success text-xs font-medium">
                        DIV
                      </span>
                      <div>
                        <p className="font-medium">{payment.symbol}</p>
                        <p className="text-xs text-muted-foreground">
                          {payment.shares.toFixed(2)} shares × {formatCurrency(payment.dividendPerShare)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-success">+{formatCurrency(payment.totalAmount)}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(payment.paidAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Info Note */}
          <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
            <p>
              💡 Dividends are credited when the payment date passes. You must own shares 
              before the ex-dividend date to receive the dividend.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DividendBreakdown;