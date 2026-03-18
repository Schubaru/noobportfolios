import { useState, useEffect, useCallback, useRef } from 'react';
import { Portfolio, Holding, PortfolioMetrics } from '@/lib/types';
import { calculatePortfolioMetrics } from '@/lib/portfolio';
import { fetchMultipleQuotes } from '@/lib/finnhub';
import { isUSMarketOpen, getQuoteRefreshInterval } from '@/lib/marketHours';

interface PortfolioWithQuotes {
  portfolio: Portfolio;
  metrics: PortfolioMetrics;
}

/**
 * Hook to fetch live quotes for multiple portfolios and calculate metrics.
 * Market-aware: 15s during open hours, 2min when closed, 5min when tab hidden.
 */
export const usePortfolioQuotes = (portfolios: Portfolio[]) => {
  const [portfoliosWithQuotes, setPortfoliosWithQuotes] = useState<Map<string, PortfolioWithQuotes>>(new Map());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isStale, setIsStale] = useState(false);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const staleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isPageVisibleRef = useRef(!document.hidden);
  const currentIntervalMsRef = useRef(15_000);

  const fetchQuotesForPortfolios = useCallback(async () => {
    if (portfolios.length === 0) return;

    setIsRefreshing(true);
    setIsStale(false);

    try {
      const allSymbols = new Set<string>();
      portfolios.forEach(p => {
        p.holdings.forEach(h => allSymbols.add(h.symbol.toUpperCase()));
      });

      if (allSymbols.size === 0) {
        const newMap = new Map<string, PortfolioWithQuotes>();
        portfolios.forEach(p => {
          newMap.set(p.id, {
            portfolio: p,
            metrics: calculatePortfolioMetrics(p),
          });
        });
        setPortfoliosWithQuotes(newMap);
        setLastUpdated(new Date());
        return;
      }

      const quotes = await fetchMultipleQuotes(Array.from(allSymbols));

      const newMap = new Map<string, PortfolioWithQuotes>();
      portfolios.forEach(p => {
        const updatedHoldings: Holding[] = p.holdings.map(h => {
          const quote = quotes.get(h.symbol.toUpperCase());
          if (quote) {
            return {
              ...h,
              currentPrice: quote.price,
              previousClose: quote.prevClose,
            };
          }
          return { ...h, currentPrice: undefined, previousClose: undefined };
        });

        const updatedPortfolio: Portfolio = { ...p, holdings: updatedHoldings };
        newMap.set(p.id, {
          portfolio: updatedPortfolio,
          metrics: calculatePortfolioMetrics(updatedPortfolio),
        });
      });

      setPortfoliosWithQuotes(newMap);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error fetching quotes for portfolios:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [portfolios]);

  // Schedule refresh with market-aware cadence
  const scheduleRefresh = useCallback(() => {
    // Clear existing timers
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }
    if (staleTimerRef.current) {
      clearTimeout(staleTimerRef.current);
      staleTimerRef.current = null;
    }

    if (portfolios.length === 0) return;

    const marketOpen = isUSMarketOpen();
    const ms = getQuoteRefreshInterval(marketOpen, isPageVisibleRef.current);
    currentIntervalMsRef.current = ms;

    refreshIntervalRef.current = setInterval(() => {
      fetchQuotesForPortfolios();
    }, ms);

    // Set stale detection at 2x interval
    staleTimerRef.current = setTimeout(() => {
      setIsStale(true);
    }, ms * 2);
  }, [portfolios.length, fetchQuotesForPortfolios]);

  // Initial fetch
  useEffect(() => {
    if (portfolios.length > 0) {
      fetchQuotesForPortfolios();
    }
  }, [portfolios, fetchQuotesForPortfolios]);

  // Market-aware auto-refresh + visibility handling
  useEffect(() => {
    const handleVisibilityChange = () => {
      isPageVisibleRef.current = !document.hidden;
      scheduleRefresh();
      // Immediately refresh when becoming visible
      if (!document.hidden && portfolios.length > 0) {
        fetchQuotesForPortfolios();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    scheduleRefresh();

    // Re-check market status every 5 minutes to adjust cadence
    const marketCheckInterval = setInterval(() => {
      scheduleRefresh();
    }, 5 * 60_000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(marketCheckInterval);
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
      if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
    };
  }, [scheduleRefresh, portfolios.length, fetchQuotesForPortfolios]);

  // Reset stale flag on successful fetch
  useEffect(() => {
    if (lastUpdated) {
      setIsStale(false);
      // Re-arm stale timer
      if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
      staleTimerRef.current = setTimeout(() => {
        setIsStale(true);
      }, currentIntervalMsRef.current * 2);
    }
    return () => {
      if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
    };
  }, [lastUpdated]);

  const getPortfolioWithQuotes = useCallback((portfolioId: string): PortfolioWithQuotes | undefined => {
    return portfoliosWithQuotes.get(portfolioId);
  }, [portfoliosWithQuotes]);

  const getMetrics = useCallback((portfolioId: string): PortfolioMetrics | undefined => {
    return portfoliosWithQuotes.get(portfolioId)?.metrics;
  }, [portfoliosWithQuotes]);

  return {
    portfoliosWithQuotes,
    getPortfolioWithQuotes,
    getMetrics,
    isRefreshing,
    isStale,
    lastUpdated,
    refresh: fetchQuotesForPortfolios,
  };
};
