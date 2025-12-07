import { QuoteData, SearchResult, AssetClass } from './types';

// Mock market data for demo purposes
// In production, replace with real API calls (Alpha Vantage, Finnhub, etc.)

const MOCK_STOCKS: Record<string, Omit<QuoteData, 'dayChange' | 'dayChangePercent'>> = {
  AAPL: { symbol: 'AAPL', name: 'Apple Inc.', currentPrice: 195.89, previousClose: 193.12, assetClass: 'stock' },
  MSFT: { symbol: 'MSFT', name: 'Microsoft Corp.', currentPrice: 425.22, previousClose: 420.55, assetClass: 'stock' },
  GOOGL: { symbol: 'GOOGL', name: 'Alphabet Inc.', currentPrice: 175.35, previousClose: 173.80, assetClass: 'stock' },
  AMZN: { symbol: 'AMZN', name: 'Amazon.com Inc.', currentPrice: 185.50, previousClose: 182.30, assetClass: 'stock' },
  NVDA: { symbol: 'NVDA', name: 'NVIDIA Corp.', currentPrice: 132.65, previousClose: 129.45, assetClass: 'stock' },
  TSLA: { symbol: 'TSLA', name: 'Tesla Inc.', currentPrice: 248.75, previousClose: 251.20, assetClass: 'stock' },
  META: { symbol: 'META', name: 'Meta Platforms Inc.', currentPrice: 505.82, previousClose: 498.50, assetClass: 'stock' },
  JPM: { symbol: 'JPM', name: 'JPMorgan Chase & Co.', currentPrice: 198.45, previousClose: 196.30, assetClass: 'stock' },
  V: { symbol: 'V', name: 'Visa Inc.', currentPrice: 275.80, previousClose: 273.50, assetClass: 'stock' },
  JNJ: { symbol: 'JNJ', name: 'Johnson & Johnson', currentPrice: 156.30, previousClose: 155.80, assetClass: 'stock' },
  
  // ETFs
  VOO: { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', currentPrice: 485.50, previousClose: 482.20, assetClass: 'etf' },
  VTI: { symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', currentPrice: 265.75, previousClose: 263.40, assetClass: 'etf' },
  QQQ: { symbol: 'QQQ', name: 'Invesco QQQ Trust', currentPrice: 495.30, previousClose: 490.80, assetClass: 'etf' },
  SPY: { symbol: 'SPY', name: 'SPDR S&P 500 ETF', currentPrice: 528.45, previousClose: 524.90, assetClass: 'etf' },
  IWM: { symbol: 'IWM', name: 'iShares Russell 2000 ETF', currentPrice: 225.60, previousClose: 223.80, assetClass: 'etf' },
  
  // Bonds
  BND: { symbol: 'BND', name: 'Vanguard Total Bond ETF', currentPrice: 71.25, previousClose: 71.45, assetClass: 'bond' },
  AGG: { symbol: 'AGG', name: 'iShares Core US Aggregate Bond', currentPrice: 97.50, previousClose: 97.65, assetClass: 'bond' },
  TLT: { symbol: 'TLT', name: 'iShares 20+ Year Treasury Bond', currentPrice: 92.30, previousClose: 92.80, assetClass: 'bond' },
  
  // REITs
  VNQ: { symbol: 'VNQ', name: 'Vanguard Real Estate ETF', currentPrice: 88.75, previousClose: 87.90, assetClass: 'reit' },
  O: { symbol: 'O', name: 'Realty Income Corp.', currentPrice: 55.40, previousClose: 54.95, assetClass: 'reit' },
  SPG: { symbol: 'SPG', name: 'Simon Property Group', currentPrice: 155.20, previousClose: 153.80, assetClass: 'reit' },
};

// Add some price variation for realism
const getVariedPrice = (basePrice: number): number => {
  const variation = (Math.random() - 0.5) * 0.01; // ±0.5%
  return Number((basePrice * (1 + variation)).toFixed(2));
};

export const getQuote = async (symbol: string): Promise<QuoteData | null> => {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));
  
  const upperSymbol = symbol.toUpperCase();
  const stock = MOCK_STOCKS[upperSymbol];
  
  if (!stock) return null;
  
  const currentPrice = getVariedPrice(stock.currentPrice);
  const dayChange = currentPrice - stock.previousClose;
  const dayChangePercent = (dayChange / stock.previousClose) * 100;
  
  return {
    ...stock,
    currentPrice,
    dayChange,
    dayChangePercent,
  };
};

export const searchSymbols = async (query: string): Promise<SearchResult[]> => {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 150 + Math.random() * 200));
  
  const lowerQuery = query.toLowerCase();
  
  return Object.values(MOCK_STOCKS)
    .filter(stock => 
      stock.symbol.toLowerCase().includes(lowerQuery) ||
      stock.name.toLowerCase().includes(lowerQuery)
    )
    .slice(0, 8)
    .map(stock => ({
      symbol: stock.symbol,
      name: stock.name,
      type: stock.assetClass === 'etf' ? 'ETF' : stock.assetClass === 'bond' ? 'Bond' : stock.assetClass === 'reit' ? 'REIT' : 'Stock',
      assetClass: stock.assetClass,
    }));
};

export const getMultipleQuotes = async (symbols: string[]): Promise<Map<string, QuoteData>> => {
  const quotes = new Map<string, QuoteData>();
  
  // Fetch all quotes in parallel
  const results = await Promise.all(
    symbols.map(async symbol => {
      const quote = await getQuote(symbol);
      return { symbol, quote };
    })
  );
  
  results.forEach(({ symbol, quote }) => {
    if (quote) {
      quotes.set(symbol.toUpperCase(), quote);
    }
  });
  
  return quotes;
};

export const detectAssetClass = (type: string, name: string): AssetClass => {
  const lowerType = type.toLowerCase();
  const lowerName = name.toLowerCase();
  
  if (lowerType.includes('etf') || lowerName.includes('etf')) return 'etf';
  if (lowerType.includes('bond') || lowerName.includes('bond') || lowerName.includes('treasury')) return 'bond';
  if (lowerType.includes('reit') || lowerName.includes('reit') || lowerName.includes('real estate')) return 'reit';
  if (lowerType.includes('crypto') || lowerName.includes('bitcoin') || lowerName.includes('ethereum')) return 'crypto';
  
  return 'stock';
};
