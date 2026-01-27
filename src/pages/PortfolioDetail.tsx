import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Trash2, ArrowRightLeft, Clock } from 'lucide-react';
import Header from '@/components/Header';
import Disclaimer from '@/components/Disclaimer';
import PerformanceSummary from '@/components/PerformanceSummary';
import HoldingsTable from '@/components/HoldingsTable';
import AllocationChart from '@/components/AllocationChart';
import TradeModal from '@/components/TradeModal';
import AssetDetailModal from '@/components/AssetDetailModal';
import DividendBreakdown from '@/components/DividendBreakdown';
import { usePortfolios } from '@/hooks/usePortfolios';
import { calculatePortfolioMetrics } from '@/lib/portfolio';
import { fetchMultipleQuotes } from '@/lib/finnhub';
import { Portfolio, PortfolioMetrics, Transaction, Holding } from '@/lib/types';
import { formatCurrency } from '@/lib/portfolio';

const PortfolioDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getPortfolio, deletePortfolio, fetchPortfolios, isLoading: portfoliosLoading } = usePortfolios();
  
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [metrics, setMetrics] = useState<PortfolioMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);
  const [tradeSymbol, setTradeSymbol] = useState<string | undefined>();
  const [selectedHolding, setSelectedHolding] = useState<Holding | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDividendBreakdown, setShowDividendBreakdown] = useState(false);
  const [hasFetchedPrices, setHasFetchedPrices] = useState(false);

  const loadPortfolioData = useCallback(async (forceRefresh = false) => {
    if (!id) return;
    
    // Get portfolio from the hook's state
    const data = getPortfolio(id);
    if (!data) {
      // Portfolio not found - might still be loading
      if (!portfoliosLoading) {
        navigate('/');
      }
      return;
    }

    // Skip fetching prices if we already have them and this isn't a refresh
    if (hasFetchedPrices && !forceRefresh) {
      setIsLoading(false);
      return;
    }

    // Create a copy for local state with updated prices
    let portfolioWithPrices = { ...data, holdings: [...data.holdings] };
    let hasApiErrors = false;

    // Update prices for holdings using real Finnhub API
    if (data.holdings.length > 0) {
      const symbols = data.holdings.map(h => h.symbol);
      
      try {
        const quotes = await fetchMultipleQuotes(symbols);
        
        portfolioWithPrices.holdings = data.holdings.map(h => {
          const quote = quotes.get(h.symbol.toUpperCase());
          if (quote) {
            return {
              ...h,
              currentPrice: quote.price,
              previousClose: quote.prevClose,
            };
          }
          // If no quote available, keep existing prices (graceful degradation)
          return h;
        });
      } catch (error) {
        console.error('Error fetching quotes, using last known prices:', error);
        hasApiErrors = true;
        // Fallback: use avg_cost as current price if no price data exists
        portfolioWithPrices.holdings = data.holdings.map(h => ({
          ...h,
          currentPrice: h.currentPrice ?? h.avgCost,
          previousClose: h.previousClose ?? h.avgCost,
        }));
      }
    }

    setPortfolio(portfolioWithPrices);
    setMetrics(calculatePortfolioMetrics(portfolioWithPrices));
    setIsLoading(false);
    setHasFetchedPrices(true);
    
    // Show toast if API had errors
    if (hasApiErrors && forceRefresh) {
      // Only show on manual refresh, not on initial load
      console.warn('Using last known prices due to market data API issues');
    }
  }, [id, getPortfolio, portfoliosLoading, navigate, hasFetchedPrices]);

  // Load when portfolios are ready - only once
  useEffect(() => {
    if (!portfoliosLoading && id && !hasFetchedPrices) {
      loadPortfolioData();
    }
  }, [portfoliosLoading, id, hasFetchedPrices, loadPortfolioData]);

  // Refresh prices periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isRefreshing && portfolio) {
        handleRefresh();
      }
    }, 60000); // Every 60 seconds

    return () => clearInterval(interval);
  }, [portfolio, isRefreshing]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchPortfolios(); // Refresh from database
    await loadPortfolioData(true); // Force refresh with fresh quotes
    setIsRefreshing(false);
  };

  const handleDelete = async () => {
    if (!id) return;
    const success = await deletePortfolio(id);
    if (success) {
      navigate('/');
    }
  };

  const handleViewAsset = (symbol: string) => {
    const holding = portfolio?.holdings.find(h => h.symbol === symbol);
    if (holding) {
      setSelectedHolding(holding);
    }
  };

  const handleTrade = (symbol?: string) => {
    setTradeSymbol(symbol);
    setIsTradeModalOpen(true);
  };

  const handleTradeComplete = async () => {
    // Refresh portfolios from database after trade
    await fetchPortfolios();
    // Then reload this portfolio with fresh prices
    await loadPortfolioData();
  };

  if (isLoading || portfoliosLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header showCreate={false} />
        <main className="container mx-auto px-4 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-muted rounded w-1/4" />
            <div className="h-[200px] bg-muted rounded-xl" />
            <div className="grid grid-cols-5 gap-3">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-24 bg-muted rounded-xl" />
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!portfolio || !metrics) {
    return null;
  }

  const recentTransactions = portfolio.transactions.slice(0, 5);

  return (
    <div className="min-h-screen bg-background">
      <Header showCreate={false} />
      
      <main className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="p-2 rounded-lg hover:bg-secondary transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">{portfolio.name}</h1>
              <p className="text-sm text-muted-foreground">
                Created {new Date(portfolio.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2 rounded-lg hover:bg-secondary transition-colors disabled:opacity-50"
              title="Refresh prices"
            >
              <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            
            {!portfolio.isExample && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="p-2 rounded-lg hover:bg-destructive/10 text-destructive transition-colors"
                title="Delete portfolio"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
            
            <button
              onClick={() => handleTrade()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-all"
            >
              <ArrowRightLeft className="w-4 h-4" />
              Trade
            </button>
          </div>
        </div>

        {/* Performance Summary */}
        <div className="mb-6">
          <PerformanceSummary
            metrics={metrics}
            cash={portfolio.cash}
            startingCash={portfolio.startingCash}
          />
        </div>

        {/* Holdings & Allocation */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2">
            <h2 className="text-lg font-semibold mb-4">Holdings</h2>
            <HoldingsTable 
              holdings={portfolio.holdings} 
              onTrade={handleViewAsset}
            />
          </div>
          
          <div>
            <AllocationChart holdings={portfolio.holdings} />
          </div>
        </div>

        {/* Recent Transactions */}
        {recentTransactions.length > 0 && (
          <div className="glass-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Recent Transactions</h2>
            </div>
            <div className="space-y-2">
              {recentTransactions.map((tx: Transaction) => (
                <div 
                  key={tx.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
                >
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-1 rounded-md text-xs font-medium ${
                      tx.type === 'buy' 
                        ? 'bg-success/10 text-success' 
                        : 'bg-destructive/10 text-destructive'
                    }`}>
                      {tx.type.toUpperCase()}
                    </span>
                    <div>
                      <p className="font-medium">{tx.symbol}</p>
                      <p className="text-xs text-muted-foreground">
                        {tx.shares} shares @ {formatCurrency(tx.price)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-medium ${tx.type === 'buy' ? 'text-destructive' : 'text-success'}`}>
                      {tx.type === 'buy' ? '-' : '+'}{formatCurrency(tx.total)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(tx.timestamp).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Asset Detail Modal */}
      <AssetDetailModal
        isOpen={!!selectedHolding}
        onClose={() => setSelectedHolding(null)}
        holding={selectedHolding}
        onTrade={(symbol) => {
          setSelectedHolding(null);
          handleTrade(symbol);
        }}
      />

      {/* Dividend Breakdown Modal */}
      <DividendBreakdown
        isOpen={showDividendBreakdown}
        onClose={() => setShowDividendBreakdown(false)}
        portfolio={portfolio}
      />

      {/* Trade Modal */}
      <TradeModal
        isOpen={isTradeModalOpen}
        onClose={() => {
          setIsTradeModalOpen(false);
          setTradeSymbol(undefined);
        }}
        portfolio={portfolio}
        onTradeComplete={handleTradeComplete}
        initialSymbol={tradeSymbol}
      />

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setShowDeleteConfirm(false)}
          />
          <div className="relative w-full max-w-sm glass-card p-6 slide-up">
            <h3 className="text-lg font-bold mb-2">Delete Portfolio?</h3>
            <p className="text-sm text-muted-foreground mb-6">
              This will permanently delete "{portfolio.name}" and all its data. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2 rounded-xl border border-border font-medium hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-2 rounded-xl bg-destructive text-destructive-foreground font-medium hover:bg-destructive/90 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <Disclaimer />
    </div>
  );
};

export default PortfolioDetail;
