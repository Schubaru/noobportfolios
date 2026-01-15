import { Portfolio } from './types';
import { v4 as uuidv4 } from 'uuid';

const STORAGE_KEY = 'noob_portfolios';

export const loadPortfolios = (): Portfolio[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      const example = createExamplePortfolio();
      savePortfolios([example]);
      return [example];
    }
    
    let portfolios: Portfolio[] = JSON.parse(stored);
    
    // Migrate: rename "Example Portfolio" to "N00B Portfolio"
    let needsSave = false;
    portfolios = portfolios.map(p => {
      if (p.isExample && p.name === 'Example Portfolio') {
        needsSave = true;
        return { ...p, name: 'N00B Portfolio' };
      }
      return p;
    });
    
    if (needsSave) {
      savePortfolios(portfolios);
    }
    
    return portfolios;
  } catch {
    return [];
  }
};

export const savePortfolios = (portfolios: Portfolio[]): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolios));
};

export const getPortfolio = (id: string): Portfolio | undefined => {
  const portfolios = loadPortfolios();
  return portfolios.find(p => p.id === id);
};

export const updatePortfolio = (portfolio: Portfolio): void => {
  const portfolios = loadPortfolios();
  const index = portfolios.findIndex(p => p.id === portfolio.id);
  if (index !== -1) {
    portfolios[index] = portfolio;
    savePortfolios(portfolios);
  }
};

export const createPortfolio = (name: string): Portfolio => {
  const now = Date.now();
  const portfolio: Portfolio = {
    id: uuidv4(),
    name,
    startingCash: 10000,
    cash: 10000,
    holdings: [],
    transactions: [],
    valueHistory: [{ timestamp: now, value: 10000 }],
    createdAt: now,
  };
  
  const portfolios = loadPortfolios();
  portfolios.push(portfolio);
  savePortfolios(portfolios);
  
  return portfolio;
};

export const deletePortfolio = (id: string): void => {
  const portfolios = loadPortfolios();
  const filtered = portfolios.filter(p => p.id !== id);
  savePortfolios(filtered);
};

const createExamplePortfolio = (): Portfolio => {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  
  return {
    id: 'example-portfolio',
    name: 'N00B Portfolio',
    startingCash: 10000,
    cash: 2456.32,
    holdings: [
      { symbol: 'AAPL', name: 'Apple Inc.', shares: 10, avgCost: 178.50, assetClass: 'stock', currentPrice: 195.89 },
      { symbol: 'MSFT', name: 'Microsoft Corp.', shares: 8, avgCost: 380.25, assetClass: 'stock', currentPrice: 425.22 },
      { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', shares: 5, avgCost: 420.00, assetClass: 'etf', currentPrice: 485.50 },
      { symbol: 'BND', name: 'Vanguard Total Bond ETF', shares: 15, avgCost: 72.50, assetClass: 'bond', currentPrice: 71.25 },
      { symbol: 'VNQ', name: 'Vanguard Real Estate ETF', shares: 12, avgCost: 82.00, assetClass: 'reit', currentPrice: 88.75 },
    ],
    transactions: [
      { id: '1', symbol: 'AAPL', name: 'Apple Inc.', type: 'buy', shares: 10, price: 178.50, total: 1785, timestamp: now - 30 * dayMs },
      { id: '2', symbol: 'MSFT', name: 'Microsoft Corp.', type: 'buy', shares: 8, price: 380.25, total: 3042, timestamp: now - 25 * dayMs },
      { id: '3', symbol: 'VOO', name: 'Vanguard S&P 500 ETF', type: 'buy', shares: 5, price: 420.00, total: 2100, timestamp: now - 20 * dayMs },
      { id: '4', symbol: 'BND', name: 'Vanguard Total Bond ETF', type: 'buy', shares: 15, price: 72.50, total: 1087.50, timestamp: now - 15 * dayMs },
      { id: '5', symbol: 'VNQ', name: 'Vanguard Real Estate ETF', type: 'buy', shares: 12, price: 82.00, total: 984, timestamp: now - 10 * dayMs },
    ],
    valueHistory: [
      { timestamp: now - 30 * dayMs, value: 10000 },
      { timestamp: now - 25 * dayMs, value: 10150 },
      { timestamp: now - 20 * dayMs, value: 10420 },
      { timestamp: now - 15 * dayMs, value: 10680 },
      { timestamp: now - 10 * dayMs, value: 10890 },
      { timestamp: now - 5 * dayMs, value: 11150 },
      { timestamp: now - 2 * dayMs, value: 11320 },
      { timestamp: now - 1 * dayMs, value: 11480 },
      { timestamp: now, value: 11650 },
    ],
    createdAt: now - 30 * dayMs,
    isExample: true,
  };
};
