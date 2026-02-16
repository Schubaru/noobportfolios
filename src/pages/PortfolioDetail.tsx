import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Trash2, ArrowRightLeft, Clock } from 'lucide-react';
import Header from '@/components/Header';
import Disclaimer from '@/components/Disclaimer';
import { PerformanceHeader, PerformanceDetails } from '@/components/PerformanceSummary';
import HoldingsTable from '@/components/HoldingsTable';
import AllocationChart from '@/components/AllocationChart';
import TradeModal from '@/components/TradeModal';
import AssetDetailModal from '@/components/AssetDetailModal';
import DividendBreakdown from '@/components/DividendBreakdown';
import PortfolioGrowthChart, { TimeRange, ChartHoverState } from '@/components/PortfolioGrowthChart';
import { usePortfolios } from '@/hooks/usePortfolios';
import { calculatePortfolioMetrics } from '@/lib/portfolio';
import { fetchMultipleQuotes } from '@/lib/finnhub';
import { callSnapshotPortfolio } from '@/lib/snapshots';
import { Portfolio, PortfolioMetrics, Transaction, Holding } from '@/lib/types';
import { formatCurrency, formatShares } from '@/lib/portfolio';

const AUTO_SNAPSHOT_MS = 60_000;

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
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [snapshotKey, setSnapshotKey] = useState(0);
  
  // Range state
  const [selectedRange, setSelectedRange] = useState<TimeRange>('1D');
  
  // Hover scrubbing state
  const [hoverState, setHoverState] = useState<ChartHoverState | null>(null);

  const autoSnapshotRef = useRef<NodeJS.Timeout | null>(null);
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

  // Displayed values (hover overrides live)
  const displayHoldingsValue = hoverState?.isHovering ? hoverState.holdingsValue : metrics?.holdingsValue ?? 0;
  const displayGain = hoverState?.isHovering ? hoverState.gain : metrics?.unrealizedPL ?? 0;
  const displayGainPercent = hoverState?.isHovering ? hoverState.gainPercent : (metrics?.costBasis && metrics.costBasis > 0 ? (metrics.unrealizedPL / metrics.costBasis) : 0);

  const handleHoverChange = useCallback((state: ChartHoverState | null) => {
    setHoverState(state);
  }, []);

  const triggerSnapshot = useCallback(async (reason: 'trade' | 'view_load' | 'auto', tradeId?: string) => {
    if (!id) return;
    const result = await callSnapshotPortfolio(id, reason, tradeId);
    if (result) {
      setLastUpdated(result.last_snapshot_at);
      setStale(result.stale);
      if (result.snapshot_written) {
        setSnapshotKey(k => k + 1);
      }
    }
  }, [id]);

  const loadPortfolioData = useCallback(async (forceRefresh = false, freshPortfolio?: Portfolio) => {
    if (!id) return;
    
    const data = freshPortfolio || getPortfolio(id);
    if (!data) {
      if (!portfoliosLoading) navigate('/');
      return;
    }

    if (hasFetchedPrices && !forceRefresh) {
      setIsLoading(false);
      return;
    }

    let portfolioWithPrices = { ...data, holdings: [...data.holdings] };

    if (data.holdings.length > 0) {
      const symbols = data.holdings.map(h => h.symbol);
      try {
        const quotes = await fetchMultipleQuotes(symbols);
        portfolioWithPrices.holdings = data.holdings.map(h => {
          const quote = quotes.get(h.symbol.toUpperCase());
          return quote
            ? { ...h, currentPrice: quote.price, previousClose: quote.prevClose }
            : { ...h, currentPrice: h.currentPrice, previousClose: undefined };
        });
      } catch {
        portfolioWithPrices.holdings = data.holdings.map(h => ({
          ...h, currentPrice: h.currentPrice ?? h.avgCost, previousClose: undefined,
        }));
      }
    }

    setPortfolio(portfolioWithPrices);
    const newMetrics = calculatePortfolioMetrics(portfolioWithPrices);
    setMetrics(newMetrics);
    setIsLoading(false);
    setHasFetchedPrices(true);
  }, [id, getPortfolio, portfoliosLoading, navigate, hasFetchedPrices]);

  useEffect(() => {
    if (!portfoliosLoading && id && !hasFetchedPrices) {
      loadPortfolioData();
    }
  }, [portfoliosLoading, id, hasFetchedPrices, loadPortfolioData]);

  // On first load, trigger a view_load snapshot
  useEffect(() => {
    if (id && hasFetchedPrices) {
      triggerSnapshot('view_load');
    }
  }, [id, hasFetchedPrices, triggerSnapshot]);

  // Auto snapshot every 60s
  useEffect(() => {
    autoSnapshotRef.current = setInterval(() => {
      if (isPageVisibleRef.current && hasFetchedPrices) {
        triggerSnapshot('auto');
      }
    }, AUTO_SNAPSHOT_MS);
    return () => { if (autoSnapshotRef.current) clearInterval(autoSnapshotRef.current); };
  }, [triggerSnapshot, hasFetchedPrices]);

  // Visibility handling
  useEffect(() => {
    const handler = () => { isPageVisibleRef.current = !document.hidden; };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchPortfolios();
    await loadPortfolioData(true);
    await triggerSnapshot('auto');
    setIsRefreshing(false);
  };

  const handleDelete = async () => {
    if (!id) return;
    const success = await deletePortfolio(id);
    if (success) navigate('/');
  };

  const handleViewAsset = (symbol: string) => {
    const holding = portfolio?.holdings.find(h => h.symbol === symbol);
    if (holding) setSelectedHolding(holding);
  };

  const handleTrade = (symbol?: string) => {
    setTradeSymbol(symbol);
    setIsTradeModalOpen(true);
  };

  const handleTradeComplete = async (tradeId?: string) => {
    const freshPortfolios = await fetchPortfolios();
    const freshPortfolio = freshPortfolios.find(p => p.id === id);
    await loadPortfolioData(true, freshPortfolio);
    await triggerSnapshot('trade', tradeId);
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
              {[1, 2, 3, 4, 5].map(i => (<div key={i} className="h-24 bg-muted rounded-xl" />))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!portfolio || !metrics) return null;

  const recentTransactions = portfolio.transactions.slice(0, 5);

  return (
    <div className="min-h-screen bg-background">
      <Header showCreate={false} />
      
      <main className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <Link to="/" className="p-2 rounded-lg hover:bg-secondary transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">{portfolio.name}</h1>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span>Created {new Date(portfolio.createdAt).toLocaleDateString()}</span>
                {lastUpdated && (
                  <span className="flex items-center gap-1">
                    <span className="text-muted-foreground/60">•</span>
                    <span>Updated {new Date(lastUpdated).toLocaleTimeString()}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {!portfolio.isExample && (
              <button onClick={() => setShowDeleteConfirm(true)} className="p-2 rounded-lg hover:bg-destructive/10 text-destructive transition-colors" title="Delete portfolio">
                <Trash2 className="w-5 h-5" />
              </button>
            )}
            <button onClick={() => handleTrade()} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-all">
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
            rangeGain={displayGain}
            rangeGainPercent={displayGainPercent}
            displayHoldingsValue={hoverState?.isHovering ? displayHoldingsValue : undefined}
          />
          <PortfolioGrowthChart
            portfolioId={portfolio.id}
            snapshotKey={snapshotKey}
            selectedRange={selectedRange}
            stale={stale}
            lastUpdated={lastUpdated}
            onHoverChange={handleHoverChange}
          />
        </div>

        {/* Portfolio position */}
        <div className="mb-6">
          <PerformanceDetails metrics={metrics} cash={portfolio.cash} startingCash={portfolio.startingCash} />
        </div>

        {/* Holdings & Allocation */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2">
            <h2 className="text-lg font-semibold mb-4">Holdings</h2>
            <HoldingsTable holdings={portfolio.holdings} onTrade={handleViewAsset} />
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
                <div key={tx.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-1 rounded-md text-xs font-medium ${tx.type === 'buy' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                      {tx.type.toUpperCase()}
                    </span>
                    <div>
                      <p className="font-medium">{tx.symbol}</p>
                      <p className="text-xs text-muted-foreground">{formatShares(tx.shares)} shares @ {formatCurrency(tx.price)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-medium ${tx.type === 'buy' ? 'text-destructive' : 'text-success'}`}>
                      {tx.type === 'buy' ? '-' : '+'}{formatCurrency(tx.total)}
                    </p>
                    <p className="text-xs text-muted-foreground">{new Date(tx.timestamp).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <AssetDetailModal isOpen={!!selectedHolding} onClose={() => setSelectedHolding(null)} holding={selectedHolding} onTrade={(symbol) => { setSelectedHolding(null); handleTrade(symbol); }} />
      <DividendBreakdown isOpen={showDividendBreakdown} onClose={() => setShowDividendBreakdown(false)} portfolio={portfolio} />
      <TradeModal isOpen={isTradeModalOpen} onClose={() => { setIsTradeModalOpen(false); setTradeSymbol(undefined); }} portfolio={portfolio} onTradeComplete={handleTradeComplete} initialSymbol={tradeSymbol} />

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)} />
          <div className="relative w-full max-w-sm glass-card p-6 slide-up">
            <h3 className="text-lg font-bold mb-2">Delete Portfolio?</h3>
            <p className="text-sm text-muted-foreground mb-6">This will permanently delete "{portfolio.name}" and all its data. This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-2 rounded-xl border border-border font-medium hover:bg-secondary transition-colors">Cancel</button>
              <button onClick={handleDelete} className="flex-1 py-2 rounded-xl bg-destructive text-destructive-foreground font-medium hover:bg-destructive/90 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}

      <Disclaimer />
    </div>
  );
};

export default PortfolioDetail;
