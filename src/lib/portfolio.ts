import { Portfolio, PortfolioMetrics, Holding, Transaction } from './types';

export const calculateHoldingsValue = (holdings: Holding[]): number => {
  return holdings.reduce((sum, h) => sum + (h.currentPrice || h.avgCost) * h.shares, 0);
};

export const calculateCostBasis = (holdings: Holding[]): number => {
  return holdings.reduce((sum, h) => sum + h.avgCost * h.shares, 0);
};

export const calculatePortfolioValue = (portfolio: Portfolio): number => {
  const holdingsValue = calculateHoldingsValue(portfolio.holdings);
  return portfolio.cash + holdingsValue;
};

/**
 * Calculate Daily P/L using Finnhub quote data
 * Formula: Σ((currentPrice - previousClose) × shares)
 * Returns null if any holding is missing valid previousClose data
 */
export interface DailyPLResult {
  dailyPL: number | null;
  dailyBaseValue: number | null;
  hasDailyBaseline: boolean;
}

export const calculateDailyPL = (holdings: Holding[]): DailyPLResult => {
  if (holdings.length === 0) {
    return { dailyPL: 0, dailyBaseValue: 0, hasDailyBaseline: true };
  }

  let dailyPL = 0;
  let dailyBaseValue = 0;
  let hasValidBaseline = true;

  for (const h of holdings) {
    const currentPrice = h.currentPrice;
    const previousClose = h.previousClose;

    // Check if we have valid previous close data (not missing, not 0, not equal to avgCost fallback)
    const hasValidPrevClose = 
      previousClose !== undefined && 
      previousClose !== null && 
      previousClose > 0 &&
      currentPrice !== undefined &&
      currentPrice !== null;

    if (!hasValidPrevClose) {
      // Mark baseline as invalid - we can't compute accurate Today P/L
      hasValidBaseline = false;
      continue;
    }

    dailyPL += (currentPrice - previousClose) * h.shares;
    dailyBaseValue += previousClose * h.shares;
  }

  if (!hasValidBaseline) {
    return { dailyPL: null, dailyBaseValue: null, hasDailyBaseline: false };
  }

  return { dailyPL, dailyBaseValue, hasDailyBaseline: true };
};

/**
 * Calculate unrealized P/L from current holdings
 * Formula: Σ((currentPrice - avgCost) × shares)
 * Returns 0 if no currentPrice is available (fallback to avgCost means no change)
 */
export const calculateUnrealizedPL = (holdings: Holding[]): number => {
  return holdings.reduce((sum, h) => {
    // If no live price, assume no unrealized gain/loss yet
    const currentPrice = h.currentPrice ?? h.avgCost;
    const unrealized = (currentPrice - h.avgCost) * h.shares;
    return sum + unrealized;
  }, 0);
};

/**
 * Calculate realized P/L from sell transactions
 * Formula: Σ(transaction.realizedPL) for all sell transactions
 */
export const calculateRealizedPL = (transactions: Transaction[]): number => {
  return transactions
    .filter(t => t.type === 'sell' && t.realizedPL !== undefined)
    .reduce((sum, t) => sum + (t.realizedPL || 0), 0);
};

export const calculatePortfolioMetrics = (portfolio: Portfolio): PortfolioMetrics => {
  const holdingsValue = calculateHoldingsValue(portfolio.holdings);
  const costBasis = calculateCostBasis(portfolio.holdings);
  const totalValue = portfolio.cash + holdingsValue;
  
  // Calculate daily P/L with proper baseline validation
  const dailyResult = calculateDailyPL(portfolio.holdings);
  const { dailyPL, dailyBaseValue, hasDailyBaseline } = dailyResult;
  
  // Calculate daily percentage only if we have a valid baseline
  const dailyPLPercent = hasDailyBaseline && dailyBaseValue && dailyBaseValue > 0 
    ? (dailyPL! / dailyBaseValue) * 100 
    : null;
  
  // Unrealized P/L = current market value - cost basis
  const unrealizedPL = calculateUnrealizedPL(portfolio.holdings);
  
  // Calculate realized P/L from sell transactions
  const realizedPL = calculateRealizedPL(portfolio.transactions);
  
  // Calculate dividend income
  const totalDividends = portfolio.totalDividendsEarned || 
    (portfolio.dividendHistory || []).reduce((sum, d) => sum + d.totalAmount, 0);
  
  // Fees (from income table, default 0 until integrated)
  const totalFees = 0;
  
  // Total Return = Realized + Unrealized + Dividends - Fees
  const allTimePL = realizedPL + unrealizedPL;
  
  // Percent based on cost basis (what you actually invested)
  const allTimePLPercent = costBasis > 0 
    ? (unrealizedPL / costBasis) * 100 
    : 0;
  const cumulativeReturn = allTimePLPercent;
  
  // Total return including dividends
  const totalReturnWithDividends = allTimePL + totalDividends - totalFees;
  const totalReturnWithDividendsPercent = costBasis > 0
    ? (totalReturnWithDividends / costBasis) * 100
    : 0;
  
  return {
    totalValue,
    holdingsValue,
    costBasis,
    dailyPL,
    dailyPLPercent,
    dailyBaseValue,
    hasDailyBaseline,
    allTimePL,
    allTimePLPercent,
    cumulativeReturn,
    totalDividends,
    totalReturnWithDividends,
    totalReturnWithDividendsPercent,
    unrealizedPL,
    realizedPL,
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
