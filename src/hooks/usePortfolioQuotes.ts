import { useState, useEffect, useCallback, useRef } from 'react';
import { Portfolio, Holding, PortfolioMetrics } from '@/lib/types';
import { calculatePortfolioMetrics } from '@/lib/portfolio';
import { fetchMultipleQuotes } from '@/lib/finnhub';

const REFRESH_INTERVAL_MS = 30000; // 30 seconds for Index page

interface PortfolioWithQuotes {
  portfolio: Portfolio;
  metrics: PortfolioMetrics;
}

/**
 * Hook to fetch live quotes for multiple portfolios and calculate metrics
 * Used on the Index page to show accurate Daily P/L and Total Return
 */
export const usePortfolioQuotes = (portfolios: Portfolio[]) => {
  const [portfoliosWithQuotes, setPortfoliosWithQuotes] = useState<Map<string, PortfolioWithQuotes>>(new Map());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isPageVisibleRef = useRef(true);

  const fetchQuotesForPortfolios = useCallback(async () => {
    if (portfolios.length === 0) return;

    setIsRefreshing(true);

    try {
      // Collect all unique symbols across all portfolios
      const allSymbols = new Set<string>();
      portfolios.forEach(p => {
        p.holdings.forEach(h => allSymbols.add(h.symbol.toUpperCase()));
      });

      if (allSymbols.size === 0) {
        // No holdings, just calculate metrics with empty holdings
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

      // Fetch all quotes
      const quotes = await fetchMultipleQuotes(Array.from(allSymbols));

      // Update each portfolio with live prices
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
          return {
            ...h,
            currentPrice: undefined,
            previousClose: undefined,
          };
        });

        const updatedPortfolio: Portfolio = {
          ...p,
          holdings: updatedHoldings,
        };

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

  // Initial fetch when portfolios change
  useEffect(() => {
    if (portfolios.length > 0) {
      fetchQuotesForPortfolios();
    }
  }, [portfolios, fetchQuotesForPortfolios]);

  // Auto-refresh with visibility API
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
        if (isPageVisibleRef.current && !isRefreshing && portfolios.length > 0) {
          fetchQuotesForPortfolios();
        }
      }, REFRESH_INTERVAL_MS);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    if (portfolios.length > 0 && !document.hidden) {
      startAutoRefresh();
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [portfolios, isRefreshing, fetchQuotesForPortfolios]);

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
    lastUpdated,
    refresh: fetchQuotesForPortfolios,
  };
};
