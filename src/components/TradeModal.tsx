import { useState, useEffect, useCallback } from 'react';
import { X, Search, TrendingUp, TrendingDown, AlertCircle, Loader2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Portfolio, QuoteData, SearchResult, Holding } from '@/lib/types';
import { searchSymbols, getQuote } from '@/lib/market';
import { formatCurrency, formatPercent } from '@/lib/portfolio';
import { updatePortfolio } from '@/lib/storage';

interface TradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  portfolio: Portfolio;
  onTradeComplete: () => void;
  initialSymbol?: string;
}

type TradeType = 'buy' | 'sell';
type TradeStep = 'search' | 'details' | 'confirm';

const TradeModal = ({ isOpen, onClose, portfolio, onTradeComplete, initialSymbol }: TradeModalProps) => {
  const [step, setStep] = useState<TradeStep>('search');
  const [tradeType, setTradeType] = useState<TradeType>('buy');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<QuoteData | null>(null);
  const [shares, setShares] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const existingHolding = selectedQuote 
    ? portfolio.holdings.find(h => h.symbol === selectedQuote.symbol)
    : null;

  const maxBuyShares = selectedQuote 
    ? Math.floor(portfolio.cash / selectedQuote.currentPrice)
    : 0;

  const maxSellShares = existingHolding?.shares || 0;

  const totalCost = selectedQuote && shares 
    ? Number(shares) * selectedQuote.currentPrice 
    : 0;

  const resetState = useCallback(() => {
    setStep('search');
    setTradeType('buy');
    setSearchQuery('');
    setSearchResults([]);
    setSelectedQuote(null);
    setShares('');
    setError('');
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      resetState();
    } else if (initialSymbol) {
      handleSelectSymbol(initialSymbol);
    }
  }, [isOpen, initialSymbol, resetState]);

  useEffect(() => {
    const searchTickers = async () => {
      if (searchQuery.length < 1) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const results = await searchSymbols(searchQuery);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
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
      const quote = await getQuote(symbol);
      if (quote) {
        setSelectedQuote(quote);
        setStep('details');
        
        // Check if we own this stock
        const owned = portfolio.holdings.find(h => h.symbol === symbol);
        if (owned && owned.shares > 0) {
          setTradeType('buy'); // Default to buy, but sell is available
        }
      } else {
        setError('Unable to fetch quote. Please try again.');
      }
    } catch {
      setError('Unable to fetch quote. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmTrade = async () => {
    if (!selectedQuote || !shares) return;
    
    setIsLoading(true);
    setError('');

    const shareCount = Number(shares);
    const price = selectedQuote.currentPrice;
    const total = shareCount * price;

    // Validation
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
      h => h.symbol === selectedQuote.symbol
    );

    if (tradeType === 'buy') {
      if (holdingIndex >= 0) {
        // Update existing holding with new average cost
        const holding = updatedPortfolio.holdings[holdingIndex];
        const totalShares = holding.shares + shareCount;
        const totalCost = (holding.avgCost * holding.shares) + (price * shareCount);
        updatedPortfolio.holdings[holdingIndex] = {
          ...holding,
          shares: totalShares,
          avgCost: totalCost / totalShares,
          currentPrice: price,
        };
      } else {
        // Add new holding
        const newHolding: Holding = {
          symbol: selectedQuote.symbol,
          name: selectedQuote.name,
          shares: shareCount,
          avgCost: price,
          assetClass: selectedQuote.assetClass,
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
      symbol: selectedQuote.symbol,
      name: selectedQuote.name,
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-md glass-card slide-up overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
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

              {searchQuery && !isSearching && searchResults.length === 0 && (
                <p className="text-center text-muted-foreground py-4">
                  No results found for "{searchQuery}"
                </p>
              )}
            </div>
          )}

          {/* Details Step */}
          {step === 'details' && selectedQuote && (
            <div className="space-y-4">
              {/* Stock Info */}
              <div className="p-4 rounded-xl bg-secondary">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-bold text-lg">{selectedQuote.symbol}</p>
                    <p className="text-sm text-muted-foreground">{selectedQuote.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-lg">{formatCurrency(selectedQuote.currentPrice)}</p>
                    <div className={`flex items-center justify-end gap-1 text-sm ${
                      selectedQuote.dayChange >= 0 ? 'text-success' : 'text-destructive'
                    }`}>
                      {selectedQuote.dayChange >= 0 ? (
                        <TrendingUp className="w-3.5 h-3.5" />
                      ) : (
                        <TrendingDown className="w-3.5 h-3.5" />
                      )}
                      <span>{formatPercent(selectedQuote.dayChangePercent)}</span>
                    </div>
                  </div>
                </div>
                {existingHolding && (
                  <p className="text-xs text-primary">
                    You own {existingHolding.shares} shares
                  </p>
                )}
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

              {/* Shares Input */}
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm font-medium">Shares</label>
                  <button
                    onClick={() => setShares(String(tradeType === 'buy' ? maxBuyShares : maxSellShares))}
                    className="text-xs text-primary hover:underline"
                  >
                    Max: {tradeType === 'buy' ? maxBuyShares : maxSellShares}
                  </button>
                </div>
                <input
                  type="number"
                  min="1"
                  max={tradeType === 'buy' ? maxBuyShares : maxSellShares}
                  value={shares}
                  onChange={(e) => setShares(e.target.value)}
                  placeholder="Enter number of shares"
                  className="w-full px-4 py-3 rounded-xl bg-secondary border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                />
              </div>

              {/* Order Summary */}
              {shares && Number(shares) > 0 && (
                <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Order Type</span>
                    <span className={tradeType === 'buy' ? 'text-success' : 'text-destructive'}>
                      Market {tradeType === 'buy' ? 'Buy' : 'Sell'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {shares} shares × {formatCurrency(selectedQuote.currentPrice)}
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
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setSelectedQuote(null);
                    setStep('search');
                    setShares('');
                    setError('');
                  }}
                  className="flex-1 py-3 rounded-xl border border-border font-medium hover:bg-secondary transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleConfirmTrade}
                  disabled={!shares || Number(shares) <= 0 || isLoading}
                  className={`flex-1 py-3 rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                    tradeType === 'buy' 
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90' 
                      : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  }`}
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  ) : (
                    `${tradeType === 'buy' ? 'Buy' : 'Sell'} ${selectedQuote.symbol}`
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

export default TradeModal;
