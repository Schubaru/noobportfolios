import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Trash2, ArrowRightLeft, Clock } from 'lucide-react';
import Header from '@/components/Header';
import Disclaimer from '@/components/Disclaimer';
import { PerformanceHeader, PerformanceDetails } from '@/components/PerformanceSummary';
import HoldingsTable from '@/components/HoldingsTable';
import AllocationChart from '@/components/AllocationChart';
import TradeModal from '@/components/TradeModal';
import AssetDetailModal from '@/components/AssetDetailModal';
import DividendBreakdown from '@/components/DividendBreakdown';
import PortfolioGrowthChart, { TimeRange, RANGE_MS } from '@/components/PortfolioGrowthChart';
import { usePortfolios } from '@/hooks/usePortfolios';
import { calculatePortfolioMetrics } from '@/lib/portfolio';
import { fetchMultipleQuotes } from '@/lib/finnhub';
import { capturePortfolioSnapshot, hasSnapshotToday, SnapshotRow } from '@/lib/snapshots';
import { Portfolio, PortfolioMetrics, Transaction, Holding } from '@/lib/types';
import { formatCurrency, formatShares } from '@/lib/portfolio';

const REFRESH_INTERVAL_MS = 8000;

function computeRangeGain(
  snapshots: SnapshotRow[],
  range: TimeRange,
  currentInvestedValue: number,
  costBasis: number
): { gain: number; percent: number } {
  if (snapshots.length === 0) return { gain: 0, percent: 0 };

  if (range === 'ALL') {
    // Use first snapshot as baseline for consistency with chart
    const sorted = [...snapshots]
      .filter(s => s.investedValue != null)
      .sort((a, b) => a.timestamp - b.timestamp);
    const first = sorted[0];
    if (!first) {
      const gain = currentInvestedValue - costBasis;
      return { gain, percent: costBasis > 0 ? gain / costBasis : 0 };
    }
    const gain = currentInvestedValue - (first.investedValue ?? 0);
    const baseVal = first.investedValue ?? 1;
    return { gain, percent: baseVal > 0 ? gain / baseVal : 0 };
  }

  const cutoff = Date.now() - RANGE_MS[range];
  const baseline = snapshots
    .filter(s => s.timestamp <= cutoff && s.investedValue != null)
    .sort((a, b) => b.timestamp - a.timestamp)[0];

  if (!baseline) {
    // Portfolio younger than range -- use first snapshot
    const sorted = [...snapshots]
      .filter(s => s.investedValue != null)
      .sort((a, b) => a.timestamp - b.timestamp);
    const first = sorted[0];
    if (!first) return { gain: 0, percent: 0 };
    const gain = currentInvestedValue - (first.investedValue ?? 0);
    const baseVal = first.investedValue ?? 1;
    return { gain, percent: baseVal > 0 ? gain / baseVal : 0 };
  }

  const gain = currentInvestedValue - (baseline.investedValue ?? 0);
  const baseVal = baseline.investedValue ?? 1;
  return { gain, percent: baseVal > 0 ? gain / baseVal : 0 };
}

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
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [snapshotKey, setSnapshotKey] = useState(0);
  const dailySnapshotDoneRef = useRef(false);
  
  // Range state lifted from chart
  const [selectedRange, setSelectedRange] = useState<TimeRange>('1D');
  const [chartSnapshots, setChartSnapshots] = useState<SnapshotRow[]>([]);

  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isPageVisibleRef = useRef(true);

  const availableRanges = useMemo((): TimeRange[] => {
    if (!portfolio) return ['1D', 'ALL'];
    const ageDays = (Date.now() - portfolio.createdAt) / (24 * 60 * 60 * 1000);
    const ranges: TimeRange[] = ['1D'];
    if (ageDays >= 2) ranges.push('1W');
    if (ageDays >= 7) ranges.push('1M');
    ranges.push('ALL');
    return ranges;
  }, [portfolio?.createdAt]);

  const { rangeGain, rangeGainPercent } = useMemo(() => {
    if (!metrics) return { rangeGain: 0, rangeGainPercent: 0 };
    const result = computeRangeGain(chartSnapshots, selectedRange, metrics.holdingsValue, metrics.costBasis);
    return { rangeGain: result.gain, rangeGainPercent: result.percent };
  }, [chartSnapshots, selectedRange, metrics]);

  const handleDataReady = useCallback((snapshots: SnapshotRow[]) => {
    setChartSnapshots(snapshots);
  }, []);

  const loadPortfolioData = useCallback(async (forceRefresh = false, freshPortfolio?: Portfolio) => {
    if (!id) return;
    
    const data = freshPortfolio || getPortfolio(id);
    if (!data) {
      if (!portfoliosLoading) {
        navigate('/');
      }
      return;
    }

    if (hasFetchedPrices && !forceRefresh) {
      setIsLoading(false);
      return;
    }

    let portfolioWithPrices = { ...data, holdings: [...data.holdings] };
    let hasApiErrors = false;

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
          return {
            ...h,
            currentPrice: h.currentPrice,
            previousClose: undefined,
          };
        });
      } catch (error) {
        console.error('Error fetching quotes, using last known prices:', error);
        hasApiErrors = true;
        portfolioWithPrices.holdings = data.holdings.map(h => ({
          ...h,
          currentPrice: h.currentPrice ?? h.avgCost,
          previousClose: undefined,
        }));
      }
    }

    setPortfolio(portfolioWithPrices);
    const newMetrics = calculatePortfolioMetrics(portfolioWithPrices);
    setMetrics(newMetrics);
    setLastUpdated(new Date());
    setIsLoading(false);
    setHasFetchedPrices(true);

    if (forceRefresh && id) {
      capturePortfolioSnapshot(id, portfolioWithPrices, newMetrics, 'auto');
    }
    
    if (hasApiErrors && forceRefresh) {
      console.warn('Using last known prices due to market data API issues');
    }
  }, [id, getPortfolio, portfoliosLoading, navigate, hasFetchedPrices]);

  useEffect(() => {
    if (!portfoliosLoading && id && !hasFetchedPrices) {
      loadPortfolioData();
    }
  }, [portfoliosLoading, id, hasFetchedPrices, loadPortfolioData]);

  useEffect(() => {
    if (id && hasFetchedPrices && portfolio && metrics && !dailySnapshotDoneRef.current) {
      dailySnapshotDoneRef.current = true;
      hasSnapshotToday(id).then(exists => {
        if (!exists && portfolio.holdings.length > 0) {
          capturePortfolioSnapshot(id, portfolio, metrics, 'daily');
        }
      });
    }
  }, [id, hasFetchedPrices, portfolio, metrics]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      isPageVisibleRef.current = !document.hidden;
      
      if (document.hidden) {
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
          refreshIntervalRef.current = null;
        }
      } else {
        startAutoRefresh();
      }
    };

    const startAutoRefresh = () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
      
      refreshIntervalRef.current = setInterval(() => {
        if (isPageVisibleRef.current && !isRefreshing && portfolio) {
          handleRefresh();
        }
      }, REFRESH_INTERVAL_MS);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    if (portfolio && !document.hidden) {
      startAutoRefresh();
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [portfolio, isRefreshing]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchPortfolios();
    await loadPortfolioData(true);
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
    const freshPortfolios = await fetchPortfolios();
    const freshPortfolio = freshPortfolios.find(p => p.id === id);
    await loadPortfolioData(true, freshPortfolio);
    setSnapshotKey(k => k + 1);
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
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span>Created {new Date(portfolio.createdAt).toLocaleDateString()}</span>
                {lastUpdated && (
                  <span className="flex items-center gap-1">
                    <span className="text-muted-foreground/60">•</span>
                    <span>Updated {lastUpdated.toLocaleTimeString()}</span>
                  </span>
                )}
              </div>
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

        {/* Hero: Investing value + Chart */}
        <div className="glass-card p-6 mb-6">
          <PerformanceHeader
            metrics={metrics}
            cash={portfolio.cash}
            startingCash={portfolio.startingCash}
            selectedRange={selectedRange}
            onRangeChange={setSelectedRange}
            availableRanges={availableRanges}
            rangeGain={rangeGain}
            rangeGainPercent={rangeGainPercent}
          />
          <PortfolioGrowthChart
            portfolioId={portfolio.id}
            portfolioCreatedAt={portfolio.createdAt}
            snapshotKey={snapshotKey}
            currentUnrealizedPL={metrics.unrealizedPL}
            selectedRange={selectedRange}
            onDataReady={handleDataReady}
          />
        </div>

        {/* Portfolio position */}
        <div className="mb-6">
          <PerformanceDetails
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
                        {formatShares(tx.shares)} shares @ {formatCurrency(tx.price)}
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

      <AssetDetailModal
        isOpen={!!selectedHolding}
        onClose={() => setSelectedHolding(null)}
        holding={selectedHolding}
        onTrade={(symbol) => {
          setSelectedHolding(null);
          handleTrade(symbol);
        }}
      />

      <DividendBreakdown
        isOpen={showDividendBreakdown}
        onClose={() => setShowDividendBreakdown(false)}
        portfolio={portfolio}
      />

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
