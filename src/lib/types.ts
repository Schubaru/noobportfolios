export type AssetClass = 'stock' | 'etf' | 'bond' | 'reit' | 'crypto' | 'other';

export interface Holding {
  symbol: string;
  name: string;
  shares: number;
  avgCost: number;
  assetClass: AssetClass;
  currentPrice?: number;
  previousClose?: number;
}

export interface Transaction {
  id: string;
  symbol: string;
  name: string;
  type: 'buy' | 'sell';
  shares: number;
  price: number;
  total: number;
  timestamp: number;
}

export interface ValueSnapshot {
  timestamp: number;
  value: number;
}

export interface Portfolio {
  id: string;
  name: string;
  startingCash: number;
  cash: number;
  holdings: Holding[];
  transactions: Transaction[];
  valueHistory: ValueSnapshot[];
  createdAt: number;
  isExample?: boolean;
}

export interface QuoteData {
  symbol: string;
  name: string;
  currentPrice: number;
  previousClose: number;
  dayChange: number;
  dayChangePercent: number;
  assetClass: AssetClass;
  high?: number;
  low?: number;
  open?: number;
  volume?: number;
}

export interface SearchResult {
  symbol: string;
  name: string;
  type: string;
  assetClass: AssetClass;
}

export interface PortfolioMetrics {
  totalValue: number;
  dailyPL: number;
  dailyPLPercent: number;
  allTimePL: number;
  allTimePLPercent: number;
  cumulativeReturn: number;
}

export interface AllocationItem {
  assetClass: AssetClass;
  value: number;
  percentage: number;
  color: string;
}
