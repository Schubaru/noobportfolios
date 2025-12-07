import { Portfolio, PortfolioMetrics, Holding } from './types';

export const calculateHoldingsValue = (holdings: Holding[]): number => {
  return holdings.reduce((sum, h) => sum + (h.currentPrice || h.avgCost) * h.shares, 0);
};

export const calculatePortfolioValue = (portfolio: Portfolio): number => {
  const holdingsValue = calculateHoldingsValue(portfolio.holdings);
  return portfolio.cash + holdingsValue;
};

export const calculateDailyPL = (holdings: Holding[]): number => {
  return holdings.reduce((sum, h) => {
    const current = h.currentPrice || h.avgCost;
    const previous = h.previousClose || h.avgCost;
    return sum + (current - previous) * h.shares;
  }, 0);
};

export const calculatePortfolioMetrics = (portfolio: Portfolio): PortfolioMetrics => {
  const totalValue = calculatePortfolioValue(portfolio);
  const dailyPL = calculateDailyPL(portfolio.holdings);
  
  const previousValue = totalValue - dailyPL;
  const dailyPLPercent = previousValue > 0 ? (dailyPL / previousValue) * 100 : 0;
  
  const allTimePL = totalValue - portfolio.startingCash;
  const allTimePLPercent = (allTimePL / portfolio.startingCash) * 100;
  const cumulativeReturn = allTimePLPercent;
  
  return {
    totalValue,
    dailyPL,
    dailyPLPercent,
    allTimePL,
    allTimePLPercent,
    cumulativeReturn,
  };
};

export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

export const formatPercent = (value: number): string => {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
};

export const formatPL = (value: number): string => {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${formatCurrency(value)}`;
};

export const formatNumber = (value: number): string => {
  return new Intl.NumberFormat('en-US').format(value);
};

export const formatCompactNumber = (value: number): string => {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(2)}K`;
  }
  return value.toFixed(2);
};
