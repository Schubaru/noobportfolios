import { QuoteData, SearchResult, AssetClass } from './types';

// Mock market data for demo purposes
// In production, replace with real API calls (Alpha Vantage, Finnhub, etc.)

const MOCK_STOCKS: Record<string, Omit<QuoteData, 'dayChange' | 'dayChangePercent'>> = {
  AAPL: { symbol: 'AAPL', name: 'Apple Inc.', currentPrice: 195.89, previousClose: 193.12, assetClass: 'stock', open: 193.50, high: 196.25, low: 192.80, volume: 52340000 },
  MSFT: { symbol: 'MSFT', name: 'Microsoft Corp.', currentPrice: 425.22, previousClose: 420.55, assetClass: 'stock', open: 421.00, high: 427.50, low: 419.20, volume: 18650000 },
  GOOGL: { symbol: 'GOOGL', name: 'Alphabet Inc.', currentPrice: 175.35, previousClose: 173.80, assetClass: 'stock', open: 174.00, high: 176.80, low: 173.50, volume: 24120000 },
  AMZN: { symbol: 'AMZN', name: 'Amazon.com Inc.', currentPrice: 185.50, previousClose: 182.30, assetClass: 'stock', open: 183.00, high: 186.90, low: 181.50, volume: 35780000 },
  NVDA: { symbol: 'NVDA', name: 'NVIDIA Corp.', currentPrice: 132.65, previousClose: 129.45, assetClass: 'stock', open: 130.00, high: 134.20, low: 128.90, volume: 45230000 },
  TSLA: { symbol: 'TSLA', name: 'Tesla Inc.', currentPrice: 248.75, previousClose: 251.20, assetClass: 'stock', open: 250.50, high: 253.00, low: 246.30, volume: 62150000 },
  META: { symbol: 'META', name: 'Meta Platforms Inc.', currentPrice: 505.82, previousClose: 498.50, assetClass: 'stock', open: 500.00, high: 508.90, low: 497.20, volume: 12340000 },
  JPM: { symbol: 'JPM', name: 'JPMorgan Chase & Co.', currentPrice: 198.45, previousClose: 196.30, assetClass: 'stock', open: 196.80, high: 199.50, low: 195.60, volume: 8920000 },
  V: { symbol: 'V', name: 'Visa Inc.', currentPrice: 275.80, previousClose: 273.50, assetClass: 'stock', open: 274.00, high: 277.20, low: 272.80, volume: 6540000 },
  JNJ: { symbol: 'JNJ', name: 'Johnson & Johnson', currentPrice: 156.30, previousClose: 155.80, assetClass: 'stock', open: 155.90, high: 157.10, low: 155.20, volume: 5670000 },
  
  // ETFs
  VOO: { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', currentPrice: 485.50, previousClose: 482.20, assetClass: 'etf', open: 483.00, high: 487.20, low: 481.50, volume: 4230000 },
  VTI: { symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', currentPrice: 265.75, previousClose: 263.40, assetClass: 'etf', open: 264.00, high: 266.80, low: 262.90, volume: 3120000 },
  QQQ: { symbol: 'QQQ', name: 'Invesco QQQ Trust', currentPrice: 495.30, previousClose: 490.80, assetClass: 'etf', open: 492.00, high: 497.50, low: 489.20, volume: 28450000 },
  SPY: { symbol: 'SPY', name: 'SPDR S&P 500 ETF', currentPrice: 528.45, previousClose: 524.90, assetClass: 'etf', open: 525.50, high: 530.20, low: 523.80, volume: 52340000 },
  IWM: { symbol: 'IWM', name: 'iShares Russell 2000 ETF', currentPrice: 225.60, previousClose: 223.80, assetClass: 'etf', open: 224.20, high: 226.80, low: 223.10, volume: 18920000 },
  
  // Bonds
  BND: { symbol: 'BND', name: 'Vanguard Total Bond ETF', currentPrice: 71.25, previousClose: 71.45, assetClass: 'bond', open: 71.40, high: 71.55, low: 71.10, volume: 5430000 },
  AGG: { symbol: 'AGG', name: 'iShares Core US Aggregate Bond', currentPrice: 97.50, previousClose: 97.65, assetClass: 'bond', open: 97.60, high: 97.80, low: 97.35, volume: 4120000 },
  TLT: { symbol: 'TLT', name: 'iShares 20+ Year Treasury Bond', currentPrice: 92.30, previousClose: 92.80, assetClass: 'bond', open: 92.70, high: 93.10, low: 91.90, volume: 18760000 },
  
  // REITs
  VNQ: { symbol: 'VNQ', name: 'Vanguard Real Estate ETF', currentPrice: 88.75, previousClose: 87.90, assetClass: 'reit', open: 88.10, high: 89.30, low: 87.60, volume: 3450000 },
  O: { symbol: 'O', name: 'Realty Income Corp.', currentPrice: 55.40, previousClose: 54.95, assetClass: 'reit', open: 55.10, high: 55.80, low: 54.70, volume: 4230000 },
  SPG: { symbol: 'SPG', name: 'Simon Property Group', currentPrice: 155.20, previousClose: 153.80, assetClass: 'reit', open: 154.20, high: 156.50, low: 153.40, volume: 1870000 },
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
    open: stock.open,
    high: stock.high,
    low: stock.low,
    volume: stock.volume,
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
