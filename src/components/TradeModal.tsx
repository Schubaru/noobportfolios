import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Search, TrendingUp, TrendingDown, AlertCircle, Loader2, DollarSign, Hash, Building2, Globe } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Portfolio, QuoteData, Holding, AssetClass } from '@/lib/types';
import { searchSymbols as mockSearchSymbols, getQuote as mockGetQuote } from '@/lib/market';
import { formatCurrency, formatPercent } from '@/lib/portfolio';
import { updatePortfolio } from '@/lib/storage';
import { 
  fetchQuote, 
  fetchFundamentals, 
  fetchProfile, 
  searchSymbolsApi,
  formatLargeNumber,
  formatVolume,
  formatMetricPercent,
  formatRatio,
  formatMetricCurrency,
  FinnhubQuote,
  FinnhubFundamentals,
  FinnhubProfile,
  FinnhubSearchResult
} from '@/lib/finnhub';
import { Skeleton } from '@/components/ui/skeleton';

interface TradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  portfolio: Portfolio;
  onTradeComplete: () => void;
  initialSymbol?: string;
}

type TradeType = 'buy' | 'sell';
type TradeStep = 'search' | 'details' | 'confirm';
type InputMode = 'shares' | 'dollars';

// Known ETF symbols that may be misclassified by Finnhub
const KNOWN_ETF_SYMBOLS = new Set([
  'JEPI', 'JEPQ', 'SCHD', 'VYM', 'SPHD', 'DVY', 'HDV', 'DIVO', 'QYLD', 'XYLD',
  'VOO', 'VTI', 'QQQ', 'SPY', 'IVV', 'VIG', 'VUG', 'VTV', 'VXUS', 'VEA',
  'VWO', 'BND', 'AGG', 'TLT', 'IEF', 'LQD', 'HYG', 'VCIT', 'VCSH', 'BSV',
  'VNQ', 'VNQI', 'SCHH', 'IYR', 'XLRE', 'RWR', 'VHT', 'XLV', 'XLF', 'XLE',
  'XLK', 'XLI', 'XLP', 'XLY', 'XLB', 'XLU', 'ARKK', 'ARKW', 'ARKG', 'ARKF',
]);

// Known Bond ETF symbols
const KNOWN_BOND_SYMBOLS = new Set([
  'BND', 'AGG', 'TLT', 'IEF', 'LQD', 'HYG', 'VCIT', 'VCSH', 'BSV', 'BIV',
  'GOVT', 'MUB', 'TIP', 'SHY', 'SCHZ', 'BNDX', 'EMB', 'JNK', 'VGIT', 'VGLT',
]);

// Known REIT symbols
const KNOWN_REIT_SYMBOLS = new Set([
  'VNQ', 'O', 'SPG', 'AMT', 'PLD', 'CCI', 'EQIX', 'DLR', 'PSA', 'EXR',
  'WELL', 'AVB', 'EQR', 'SCHH', 'IYR', 'RWR', 'XLRE', 'STAG', 'NNN', 'WPC',
]);

// Detect asset class from type string and symbol
function detectAssetClass(type: string, symbol?: string): AssetClass {
  const upperSymbol = symbol?.toUpperCase() || '';
  
  // Check known symbol lists first (most reliable)
  if (KNOWN_BOND_SYMBOLS.has(upperSymbol)) return 'bond';
  if (KNOWN_REIT_SYMBOLS.has(upperSymbol)) return 'reit';
  if (KNOWN_ETF_SYMBOLS.has(upperSymbol)) return 'etf';
  
  // Then check type string
  const lower = type.toLowerCase();
  if (lower.includes('bond')) return 'bond';
  if (lower.includes('reit')) return 'reit';
  if (lower.includes('etf') || lower.includes('etp')) return 'etf';
  
  return 'stock';
}

// Curated list of high-quality suggested assets
const SUGGESTED_ASSETS = [
  // Blue-chip stocks with strong fundamentals
  { symbol: 'AAPL', name: 'Apple Inc.', type: 'Stock', category: 'Tech Blue-Chip' },
  { symbol: 'MSFT', name: 'Microsoft Corp.', type: 'Stock', category: 'Tech Blue-Chip' },
  { symbol: 'JNJ', name: 'Johnson & Johnson', type: 'Stock', category: 'Healthcare' },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', type: 'Stock', category: 'Financials' },
  
  // Core ETFs for diversification
  { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', type: 'ETF', category: 'Index Fund' },
  { symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', type: 'ETF', category: 'Index Fund' },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', type: 'ETF', category: 'Tech Index' },
  
  // Dividend-focused assets
  { symbol: 'VYM', name: 'Vanguard High Dividend Yield ETF', type: 'ETF', category: 'Dividend' },
  { symbol: 'SCHD', name: 'Schwab U.S. Dividend Equity ETF', type: 'ETF', category: 'Dividend' },
  { symbol: 'O', name: 'Realty Income Corp.', type: 'REIT', category: 'Monthly Dividend' },
  
  // Bonds for stability
  { symbol: 'BND', name: 'Vanguard Total Bond ETF', type: 'Bond ETF', category: 'Bonds' },
  { symbol: 'AGG', name: 'iShares Core US Aggregate Bond', type: 'Bond ETF', category: 'Bonds' },
  
  // Growth stocks
  { symbol: 'NVDA', name: 'NVIDIA Corp.', type: 'Stock', category: 'AI/Growth' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', type: 'Stock', category: 'Tech Blue-Chip' },
];

const TradeModal = ({ isOpen, onClose, portfolio, onTradeComplete, initialSymbol }: TradeModalProps) => {
  const [step, setStep] = useState<TradeStep>('search');
  const [tradeType, setTradeType] = useState<TradeType>('buy');
  const [inputMode, setInputMode] = useState<InputMode>('shares');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FinnhubSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // Market data state
  const [quote, setQuote] = useState<FinnhubQuote | null>(null);
  const [fundamentals, setFundamentals] = useState<FinnhubFundamentals | null>(null);
  const [profile, setProfile] = useState<FinnhubProfile | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [loadingFundamentals, setLoadingFundamentals] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  
  // Legacy quote for trade calculations (fallback)
  const [selectedQuote, setSelectedQuote] = useState<QuoteData | null>(null);
  
  const [shares, setShares] = useState('');
  const [dollarAmount, setDollarAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Quote refresh interval
  const quoteRefreshRef = useRef<NodeJS.Timeout | null>(null);
  const lastFetchedSymbol = useRef<string | null>(null);

  const existingHolding = selectedQuote 
    ? portfolio.holdings.find(h => h.symbol === selectedQuote.symbol)
    : null;

  const currentPrice = quote?.price ?? selectedQuote?.currentPrice ?? 0;

  const maxBuyShares = currentPrice > 0
    ? Math.floor(portfolio.cash / currentPrice)
    : 0;

  const maxSellShares = existingHolding?.shares || 0;

  // Calculate effective shares based on input mode
  const effectiveShares = currentPrice > 0
    ? inputMode === 'dollars' && dollarAmount
      ? Number(dollarAmount) / currentPrice
      : Number(shares) || 0
    : 0;

  const totalCost = effectiveShares * currentPrice;

  const hasValidInput = inputMode === 'shares' 
    ? shares && Number(shares) > 0 
    : dollarAmount && Number(dollarAmount) > 0;

  const resetState = useCallback(() => {
    setStep('search');
    setTradeType('buy');
    setInputMode('shares');
    setSearchQuery('');
    setSearchResults([]);
    setQuote(null);
    setFundamentals(null);
    setProfile(null);
    setSelectedQuote(null);
    setShares('');
    setDollarAmount('');
    setError('');
    setIsLoading(false);
    setLoadingQuote(false);
    setLoadingFundamentals(false);
    setLoadingProfile(false);
    lastFetchedSymbol.current = null;
    
    if (quoteRefreshRef.current) {
      clearInterval(quoteRefreshRef.current);
      quoteRefreshRef.current = null;
    }
  }, []);

  // Fetch all market data for a symbol
  const fetchMarketData = useCallback(async (symbol: string) => {
    lastFetchedSymbol.current = symbol;
    
    // Start all fetches in parallel
    setLoadingQuote(true);
    setLoadingFundamentals(true);
    setLoadingProfile(true);
    
    const [quoteResult, fundamentalsResult, profileResult] = await Promise.all([
      fetchQuote(symbol),
      fetchFundamentals(symbol),
      fetchProfile(symbol),
    ]);
    
    if (quoteResult.data) {
      setQuote(quoteResult.data);
    } else if (quoteResult.error) {
      console.error('Quote error:', quoteResult.error);
    }
    setLoadingQuote(false);
    
    if (fundamentalsResult.data) {
      setFundamentals(fundamentalsResult.data);
    }
    setLoadingFundamentals(false);
    
    if (profileResult.data) {
      setProfile(profileResult.data);
    }
    setLoadingProfile(false);
  }, []);

  // Refresh quote only (every 10 seconds while modal is open)
  const refreshQuote = useCallback(async () => {
    if (!lastFetchedSymbol.current) return;
    
    const result = await fetchQuote(lastFetchedSymbol.current);
    if (result.data) {
      setQuote(result.data);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      resetState();
    } else if (initialSymbol) {
      handleSelectSymbol(initialSymbol);
    }
  }, [isOpen, initialSymbol, resetState]);

  // Set up quote refresh interval when on details step
  useEffect(() => {
    if (step === 'details' && lastFetchedSymbol.current) {
      quoteRefreshRef.current = setInterval(refreshQuote, 10000);
    }
    
    return () => {
      if (quoteRefreshRef.current) {
        clearInterval(quoteRefreshRef.current);
        quoteRefreshRef.current = null;
      }
    };
  }, [step, refreshQuote]);

  // Search with debounce - try Finnhub first, fall back to mock
  useEffect(() => {
    const searchTickers = async () => {
      if (searchQuery.length < 1) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        // Try Finnhub API first
        const apiResult = await searchSymbolsApi(searchQuery);
        if (apiResult.data && apiResult.data.length > 0) {
          // Ensure assetClass is properly set from API response
          setSearchResults(apiResult.data.map(r => ({
            ...r,
            assetClass: r.assetClass || detectAssetClass(r.type, r.symbol),
          })));
        } else {
          // Fall back to mock data
          const mockResults = await mockSearchSymbols(searchQuery);
          setSearchResults(mockResults.map(r => ({
            symbol: r.symbol,
            name: r.name,
            type: r.type,
            assetClass: detectAssetClass(r.type, r.symbol),
          })));
        }
      } catch {
        // Fall back to mock on error
        const mockResults = await mockSearchSymbols(searchQuery);
        setSearchResults(mockResults.map(r => ({
          symbol: r.symbol,
          name: r.name,
          type: r.type,
          assetClass: detectAssetClass(r.type, r.symbol),
        })));
      } finally {
        setIsSearching(false);
      }
    };

    const debounce = setTimeout(searchTickers, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery]);

  const handleSelectSymbol = async (symbol: string) => {
    setIsLoading(true);
    setError('');
    
    try {
      // Start fetching real market data
      fetchMarketData(symbol);
      
      // Also get mock quote for fallback/trade calculations
      const mockQuote = await mockGetQuote(symbol);
      if (mockQuote) {
        setSelectedQuote(mockQuote);
      } else {
        // Create a minimal quote from the symbol for trading
        setSelectedQuote({
          symbol,
          name: profile?.name || symbol,
          currentPrice: 0,
          previousClose: 0,
          dayChange: 0,
          dayChangePercent: 0,
          assetClass: 'stock',
        });
      }
      
      setStep('details');
      
      // Check if we own this stock
      const owned = portfolio.holdings.find(h => h.symbol === symbol);
      if (owned && owned.shares > 0) {
        setTradeType('buy');
      }
    } catch {
      setError('Unable to fetch quote. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmTrade = async () => {
    if (!hasValidInput || currentPrice <= 0) return;
    
    setIsLoading(true);
    setError('');

    const shareCount = effectiveShares;
    const price = currentPrice;
    const total = shareCount * price;
    const symbolToUse = quote?.symbol || selectedQuote?.symbol || '';
    const nameToUse = profile?.name || selectedQuote?.name || symbolToUse;

    // Validation
    if (shareCount <= 0) {
      setError('Please enter a valid amount.');
      setIsLoading(false);
      return;
    }

    if (tradeType === 'buy') {
      if (total > portfolio.cash) {
        setError('Insufficient funds for this trade.');
        setIsLoading(false);
        return;
      }
    } else {
      if (!existingHolding || shareCount > existingHolding.shares) {
        setError('You don\'t own enough shares to sell.');
        setIsLoading(false);
        return;
      }
    }

    // Create updated portfolio
    const updatedPortfolio = { ...portfolio };
    
    // Update cash
    if (tradeType === 'buy') {
      updatedPortfolio.cash -= total;
    } else {
      updatedPortfolio.cash += total;
    }

    // Update holdings
    const holdingIndex = updatedPortfolio.holdings.findIndex(
      h => h.symbol === symbolToUse
    );

    if (tradeType === 'buy') {
      if (holdingIndex >= 0) {
        // Update existing holding with new average cost
        const holding = updatedPortfolio.holdings[holdingIndex];
        const totalShares = holding.shares + shareCount;
        const totalCostCalc = (holding.avgCost * holding.shares) + (price * shareCount);
        updatedPortfolio.holdings[holdingIndex] = {
          ...holding,
          shares: totalShares,
          avgCost: totalCostCalc / totalShares,
          currentPrice: price,
        };
      } else {
        // Add new holding - prioritize search result's assetClass from API
        const searchResult = searchResults.find(r => r.symbol === symbolToUse);
        const assetClass = searchResult?.assetClass as AssetClass 
          || detectAssetClass(searchResult?.type || 'stock', symbolToUse);
        const newHolding: Holding = {
          symbol: symbolToUse,
          name: nameToUse,
          shares: shareCount,
          avgCost: price,
          assetClass,
          currentPrice: price,
        };
        updatedPortfolio.holdings.push(newHolding);
      }
    } else {
      // Sell - reduce or remove holding
      if (holdingIndex >= 0) {
        const holding = updatedPortfolio.holdings[holdingIndex];
        const remainingShares = holding.shares - shareCount;
        
        if (remainingShares <= 0) {
          updatedPortfolio.holdings.splice(holdingIndex, 1);
        } else {
          updatedPortfolio.holdings[holdingIndex] = {
            ...holding,
            shares: remainingShares,
          };
        }
      }
    }

    // Add transaction
    updatedPortfolio.transactions.unshift({
      id: uuidv4(),
      symbol: symbolToUse,
      name: nameToUse,
      type: tradeType,
      shares: shareCount,
      price,
      total,
      timestamp: Date.now(),
    });

    // Update value history
    const holdingsValue = updatedPortfolio.holdings.reduce(
      (sum, h) => sum + (h.currentPrice || h.avgCost) * h.shares,
      0
    );
    updatedPortfolio.valueHistory.push({
      timestamp: Date.now(),
      value: updatedPortfolio.cash + holdingsValue,
    });

    // Save and notify
    await new Promise(resolve => setTimeout(resolve, 500));
    updatePortfolio(updatedPortfolio);
    setIsLoading(false);
    onTradeComplete();
    onClose();
  };

  const handleSetMaxShares = () => {
    if (inputMode === 'shares') {
      setShares(String(tradeType === 'buy' ? maxBuyShares : maxSellShares));
    } else {
      const maxDollars = tradeType === 'buy' 
        ? portfolio.cash 
        : maxSellShares * currentPrice;
      setDollarAmount(String(Math.floor(maxDollars * 100) / 100));
    }
  };

  if (!isOpen) return null;

  const displaySymbol = quote?.symbol || selectedQuote?.symbol || '';
  const displayName = profile?.name || selectedQuote?.name || displaySymbol;
  const displayPrice = quote?.price ?? selectedQuote?.currentPrice ?? 0;
  const displayChange = quote?.change ?? selectedQuote?.dayChange ?? 0;
  const displayChangePct = quote?.changePct ?? selectedQuote?.dayChangePercent ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-lg glass-card slide-up overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card z-10">
          <h2 className="text-lg font-bold">
            {step === 'search' && 'Search Ticker'}
            {step === 'details' && 'Trade'}
            {step === 'confirm' && 'Confirm Order'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Search Step */}
          {step === 'search' && (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by symbol or name..."
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-secondary border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                  autoFocus
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground animate-spin" />
                )}
              </div>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="space-y-1 max-h-[300px] overflow-y-auto">
                  {searchResults.map((result) => (
                    <button
                      key={result.symbol}
                      onClick={() => handleSelectSymbol(result.symbol)}
                      className="w-full p-3 rounded-lg hover:bg-secondary flex items-center justify-between transition-colors text-left"
                    >
                      <div>
                        <p className="font-semibold text-primary">{result.symbol}</p>
                        <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                          {result.name}
                        </p>
                      </div>
                      <span className="px-2 py-1 rounded-md bg-muted text-xs">
                        {result.type}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* No Results Message */}
              {searchQuery && !isSearching && searchResults.length === 0 && (
                <p className="text-center text-muted-foreground py-4">
                  No results found for "{searchQuery}"
                </p>
              )}

              {/* Suggested Assets - shown when no search query */}
              {!searchQuery && searchResults.length === 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground">Suggested Assets</span>
                    <span className="text-xs text-muted-foreground/60">• Quality picks for long-term portfolios</span>
                  </div>
                  
                  {/* Group by category */}
                  <div className="space-y-4 max-h-[350px] overflow-y-auto">
                    {/* Index Funds */}
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">Index Funds</p>
                      {SUGGESTED_ASSETS.filter(a => a.category === 'Index Fund' || a.category === 'Tech Index').map((asset) => (
                        <button
                          key={asset.symbol}
                          onClick={() => handleSelectSymbol(asset.symbol)}
                          className="w-full p-3 rounded-lg hover:bg-secondary flex items-center justify-between transition-colors text-left border border-transparent hover:border-border"
                        >
                          <div>
                            <p className="font-semibold text-primary">{asset.symbol}</p>
                            <p className="text-sm text-muted-foreground truncate max-w-[200px]">{asset.name}</p>
                          </div>
                          <span className="px-2 py-1 rounded-md bg-primary/10 text-primary text-xs">{asset.type}</span>
                        </button>
                      ))}
                    </div>

                    {/* Blue-Chip Stocks */}
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">Blue-Chip Stocks</p>
                      {SUGGESTED_ASSETS.filter(a => a.category === 'Tech Blue-Chip' || a.category === 'Healthcare' || a.category === 'Financials').map((asset) => (
                        <button
                          key={asset.symbol}
                          onClick={() => handleSelectSymbol(asset.symbol)}
                          className="w-full p-3 rounded-lg hover:bg-secondary flex items-center justify-between transition-colors text-left border border-transparent hover:border-border"
                        >
                          <div>
                            <p className="font-semibold text-primary">{asset.symbol}</p>
                            <p className="text-sm text-muted-foreground truncate max-w-[200px]">{asset.name}</p>
                          </div>
                          <span className="px-2 py-1 rounded-md bg-muted text-xs">{asset.type}</span>
                        </button>
                      ))}
                    </div>

                    {/* Dividend Focused */}
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">Dividend Income</p>
                      {SUGGESTED_ASSETS.filter(a => a.category === 'Dividend' || a.category === 'Monthly Dividend').map((asset) => (
                        <button
                          key={asset.symbol}
                          onClick={() => handleSelectSymbol(asset.symbol)}
                          className="w-full p-3 rounded-lg hover:bg-secondary flex items-center justify-between transition-colors text-left border border-transparent hover:border-border"
                        >
                          <div>
                            <p className="font-semibold text-primary">{asset.symbol}</p>
                            <p className="text-sm text-muted-foreground truncate max-w-[200px]">{asset.name}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-1 rounded-md bg-success/10 text-success text-xs">Dividend</span>
                            <span className="px-2 py-1 rounded-md bg-muted text-xs">{asset.type}</span>
                          </div>
                        </button>
                      ))}
                    </div>

                    {/* Bonds */}
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">Bonds & Stability</p>
                      {SUGGESTED_ASSETS.filter(a => a.category === 'Bonds').map((asset) => (
                        <button
                          key={asset.symbol}
                          onClick={() => handleSelectSymbol(asset.symbol)}
                          className="w-full p-3 rounded-lg hover:bg-secondary flex items-center justify-between transition-colors text-left border border-transparent hover:border-border"
                        >
                          <div>
                            <p className="font-semibold text-primary">{asset.symbol}</p>
                            <p className="text-sm text-muted-foreground truncate max-w-[200px]">{asset.name}</p>
                          </div>
                          <span className="px-2 py-1 rounded-md bg-muted text-xs">{asset.type}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Details Step */}
          {step === 'details' && (
            <div className="space-y-4">
              {/* Stock Header with Live Price */}
              <div className="p-4 rounded-xl bg-secondary">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {profile?.logoUrl ? (
                      <img 
                        src={profile.logoUrl} 
                        alt={displayName} 
                        className="w-12 h-12 rounded-lg object-contain bg-white p-1"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : loadingProfile ? (
                      <Skeleton className="w-12 h-12 rounded-lg" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                        <Building2 className="w-6 h-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-bold text-lg">{displaySymbol}</p>
                      {loadingProfile ? (
                        <Skeleton className="h-4 w-32 mt-1" />
                      ) : (
                        <p className="text-sm text-muted-foreground truncate">{displayName}</p>
                      )}
                      {profile?.industry && (
                        <div className="flex items-center gap-1 mt-1">
                          <Globe className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">{profile.industry}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    {loadingQuote ? (
                      <>
                        <Skeleton className="h-6 w-20 mb-1" />
                        <Skeleton className="h-4 w-16" />
                      </>
                    ) : (
                      <>
                        <p className="font-bold text-xl">{formatCurrency(displayPrice)}</p>
                        <div className={`flex items-center justify-end gap-1 text-sm ${
                          displayChange >= 0 ? 'text-success' : 'text-destructive'
                        }`}>
                          {displayChange >= 0 ? (
                            <TrendingUp className="w-3.5 h-3.5" />
                          ) : (
                            <TrendingDown className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {displayChange >= 0 ? '+' : ''}{formatCurrency(displayChange)} ({formatPercent(displayChangePct)})
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                {existingHolding && (
                  <p className="text-xs text-primary mt-3 pt-3 border-t border-border/50">
                    You own {existingHolding.shares.toFixed(4)} shares
                  </p>
                )}
              </div>

              {/* Key Fundamentals Grid */}
              <div className="p-4 rounded-xl bg-muted/50 border border-border">
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">Key Fundamentals</h3>
                <div className="grid grid-cols-2 gap-3">
                  <FundamentalItem 
                    label="Market Cap" 
                    value={loadingFundamentals ? null : formatLargeNumber(fundamentals?.marketCap ?? null)}
                    loading={loadingFundamentals}
                  />
                  <FundamentalItem 
                    label="P/E (TTM)" 
                    value={loadingFundamentals ? null : formatRatio(fundamentals?.peTTM ?? null)}
                    loading={loadingFundamentals}
                  />
                  <FundamentalItem 
                    label="EPS (TTM)" 
                    value={loadingFundamentals ? null : formatMetricCurrency(fundamentals?.epsTTM ?? null)}
                    loading={loadingFundamentals}
                  />
                  <FundamentalItem 
                    label="Dividend Yield" 
                    value={loadingFundamentals ? null : formatMetricPercent(fundamentals?.dividendYieldTTM ?? null)}
                    loading={loadingFundamentals}
                  />
                  <FundamentalItem 
                    label="52W High" 
                    value={loadingFundamentals ? null : formatMetricCurrency(fundamentals?.week52High ?? null)}
                    loading={loadingFundamentals}
                  />
                  <FundamentalItem 
                    label="52W Low" 
                    value={loadingFundamentals ? null : formatMetricCurrency(fundamentals?.week52Low ?? null)}
                    loading={loadingFundamentals}
                  />
                  <FundamentalItem 
                    label="Beta" 
                    value={loadingFundamentals ? null : formatRatio(fundamentals?.beta ?? null)}
                    loading={loadingFundamentals}
                  />
                  <FundamentalItem 
                    label="Avg Vol (10D)" 
                    value={loadingFundamentals ? null : formatVolume(fundamentals?.avgVolume10d ?? null)}
                    loading={loadingFundamentals}
                  />
                </div>
              </div>

              {/* Trade Type Toggle */}
              <div className="flex rounded-xl bg-secondary p-1">
                <button
                  onClick={() => setTradeType('buy')}
                  className={`flex-1 py-2 rounded-lg font-medium transition-all ${
                    tradeType === 'buy' 
                      ? 'bg-primary text-primary-foreground' 
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Buy
                </button>
                <button
                  onClick={() => setTradeType('sell')}
                  disabled={!existingHolding}
                  className={`flex-1 py-2 rounded-lg font-medium transition-all ${
                    tradeType === 'sell' 
                      ? 'bg-destructive text-destructive-foreground' 
                      : 'text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed'
                  }`}
                >
                  Sell
                </button>
              </div>

              {/* Input Mode Toggle */}
              <div className="flex rounded-xl bg-muted p-1">
                <button
                  onClick={() => {
                    setInputMode('shares');
                    setDollarAmount('');
                  }}
                  className={`flex-1 py-2 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
                    inputMode === 'shares' 
                      ? 'bg-secondary text-foreground shadow-sm' 
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Hash className="w-4 h-4" />
                  Shares
                </button>
                <button
                  onClick={() => {
                    setInputMode('dollars');
                    setShares('');
                  }}
                  className={`flex-1 py-2 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
                    inputMode === 'dollars' 
                      ? 'bg-secondary text-foreground shadow-sm' 
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <DollarSign className="w-4 h-4" />
                  Dollars
                </button>
              </div>

              {/* Input Field */}
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm font-medium">
                    {inputMode === 'shares' ? 'Number of Shares' : 'Dollar Amount'}
                  </label>
                  <button
                    onClick={handleSetMaxShares}
                    className="text-xs text-primary hover:underline"
                  >
                    {inputMode === 'shares' 
                      ? `Max: ${tradeType === 'buy' ? maxBuyShares : maxSellShares} shares`
                      : `Max: ${formatCurrency(tradeType === 'buy' ? portfolio.cash : maxSellShares * currentPrice)}`
                    }
                  </button>
                </div>
                {inputMode === 'shares' ? (
                  <input
                    type="number"
                    min="0.0001"
                    step="any"
                    max={tradeType === 'buy' ? maxBuyShares : maxSellShares}
                    value={shares}
                    onChange={(e) => setShares(e.target.value)}
                    placeholder="Enter number of shares"
                    className="w-full px-4 py-3 rounded-xl bg-secondary border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                  />
                ) : (
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      max={tradeType === 'buy' ? portfolio.cash : maxSellShares * currentPrice}
                      value={dollarAmount}
                      onChange={(e) => setDollarAmount(e.target.value)}
                      placeholder="Enter dollar amount"
                      className="w-full pl-8 pr-4 py-3 rounded-xl bg-secondary border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                    />
                  </div>
                )}

                {/* Shares preview for dollar input */}
                {inputMode === 'dollars' && dollarAmount && Number(dollarAmount) > 0 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    ≈ {effectiveShares.toFixed(4)} shares
                  </p>
                )}
              </div>

              {/* Order Summary */}
              {hasValidInput && (
                <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Order Type</span>
                    <span className={tradeType === 'buy' ? 'text-success' : 'text-destructive'}>
                      Market {tradeType === 'buy' ? 'Buy' : 'Sell'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {effectiveShares.toFixed(4)} shares × {formatCurrency(currentPrice)}
                    </span>
                    <span className="font-bold">{formatCurrency(totalCost)}</span>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t border-border/50">
                    <span className="text-muted-foreground">
                      {tradeType === 'buy' ? 'Cash after trade' : 'Cash after sale'}
                    </span>
                    <span className="font-medium">
                      {formatCurrency(tradeType === 'buy' 
                        ? portfolio.cash - totalCost 
                        : portfolio.cash + totalCost
                      )}
                    </span>
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setQuote(null);
                    setFundamentals(null);
                    setProfile(null);
                    setSelectedQuote(null);
                    setStep('search');
                    setShares('');
                    setDollarAmount('');
                    setError('');
                    lastFetchedSymbol.current = null;
                  }}
                  className="flex-1 py-3 rounded-xl border border-border font-medium hover:bg-secondary transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleConfirmTrade}
                  disabled={!hasValidInput || isLoading || displayPrice <= 0}
                  className={`flex-1 py-3 rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                    tradeType === 'buy' 
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90' 
                      : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  }`}
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  ) : (
                    `${tradeType === 'buy' ? 'Buy' : 'Sell'} ${displaySymbol}`
                  )}
                </button>
              </div>
            </div>
          )}

          {isLoading && step === 'search' && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Helper component for fundamentals grid items
function FundamentalItem({ label, value, loading }: { label: string; value: string | null; loading: boolean }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="h-5 w-16" />
      ) : (
        <p className="text-sm font-medium">{value ?? 'N/A'}</p>
      )}
    </div>
  );
}

export default TradeModal;
