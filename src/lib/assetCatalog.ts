import { AssetClass } from './types';

/**
 * Local asset catalog for instant client-side search
 * Pre-indexed with normalized strings for fast matching
 */
export interface LocalAsset {
  symbol: string;
  name: string;
  normalizedName: string;    // lowercase, pre-computed
  normalizedSymbol: string;  // lowercase, pre-computed
  type: string;              // "Stock", "ETF", "REIT", "Bond ETF"
  assetClass: AssetClass;
  category?: string;         // For grouping: "Index Fund", "Dividend", etc.
  popularity: number;        // 1-100 for ranking (higher = more popular)
}

/**
 * ~200 popular US securities covering:
 * - Major index ETFs (VOO, VTI, QQQ, SPY)
 * - Dividend ETFs (SCHD, VYM, JEPI, JEPQ)
 * - Blue-chip stocks (AAPL, MSFT, GOOGL, AMZN)
 * - REITs (O, VNQ, SPG)
 * - Bond ETFs (BND, AGG, TLT)
 * - Popular growth stocks (NVDA, TSLA, AMD)
 */
const CATALOG_DATA: Omit<LocalAsset, 'normalizedName' | 'normalizedSymbol'>[] = [
  // ============ INDEX ETFs (highest popularity) ============
  { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', type: 'ETF', assetClass: 'etf', category: 'Index Fund', popularity: 100 },
  { symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', type: 'ETF', assetClass: 'etf', category: 'Index Fund', popularity: 99 },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', type: 'ETF', assetClass: 'etf', category: 'Index Fund', popularity: 98 },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', type: 'ETF', assetClass: 'etf', category: 'Tech Index', popularity: 97 },
  { symbol: 'IVV', name: 'iShares Core S&P 500 ETF', type: 'ETF', assetClass: 'etf', category: 'Index Fund', popularity: 96 },
  { symbol: 'VUG', name: 'Vanguard Growth ETF', type: 'ETF', assetClass: 'etf', category: 'Growth', popularity: 85 },
  { symbol: 'VTV', name: 'Vanguard Value ETF', type: 'ETF', assetClass: 'etf', category: 'Value', popularity: 84 },
  { symbol: 'VIG', name: 'Vanguard Dividend Appreciation ETF', type: 'ETF', assetClass: 'etf', category: 'Dividend', popularity: 90 },
  { symbol: 'VXUS', name: 'Vanguard Total International Stock ETF', type: 'ETF', assetClass: 'etf', category: 'International', popularity: 80 },
  { symbol: 'VEA', name: 'Vanguard FTSE Developed Markets ETF', type: 'ETF', assetClass: 'etf', category: 'International', popularity: 75 },
  { symbol: 'VWO', name: 'Vanguard FTSE Emerging Markets ETF', type: 'ETF', assetClass: 'etf', category: 'International', popularity: 74 },
  { symbol: 'IWM', name: 'iShares Russell 2000 ETF', type: 'ETF', assetClass: 'etf', category: 'Small Cap', popularity: 78 },
  { symbol: 'DIA', name: 'SPDR Dow Jones Industrial Average ETF', type: 'ETF', assetClass: 'etf', category: 'Index Fund', popularity: 76 },
  
  // ============ DIVIDEND ETFs ============
  { symbol: 'SCHD', name: 'Schwab U.S. Dividend Equity ETF', type: 'ETF', assetClass: 'etf', category: 'Dividend', popularity: 95 },
  { symbol: 'VYM', name: 'Vanguard High Dividend Yield ETF', type: 'ETF', assetClass: 'etf', category: 'Dividend', popularity: 91 },
  { symbol: 'JEPI', name: 'JPMorgan Equity Premium Income ETF', type: 'ETF', assetClass: 'etf', category: 'Income', popularity: 93 },
  { symbol: 'JEPQ', name: 'JPMorgan Nasdaq Equity Premium Income ETF', type: 'ETF', assetClass: 'etf', category: 'Income', popularity: 92 },
  { symbol: 'HDV', name: 'iShares Core High Dividend ETF', type: 'ETF', assetClass: 'etf', category: 'Dividend', popularity: 82 },
  { symbol: 'DVY', name: 'iShares Select Dividend ETF', type: 'ETF', assetClass: 'etf', category: 'Dividend', popularity: 80 },
  { symbol: 'SPHD', name: 'Invesco S&P 500 High Dividend Low Volatility ETF', type: 'ETF', assetClass: 'etf', category: 'Dividend', popularity: 78 },
  { symbol: 'QYLD', name: 'Global X NASDAQ 100 Covered Call ETF', type: 'ETF', assetClass: 'etf', category: 'Income', popularity: 77 },
  { symbol: 'XYLD', name: 'Global X S&P 500 Covered Call ETF', type: 'ETF', assetClass: 'etf', category: 'Income', popularity: 75 },
  { symbol: 'DIVO', name: 'Amplify CWP Enhanced Dividend Income ETF', type: 'ETF', assetClass: 'etf', category: 'Income', popularity: 73 },
  { symbol: 'DGRO', name: 'iShares Core Dividend Growth ETF', type: 'ETF', assetClass: 'etf', category: 'Dividend', popularity: 79 },
  
  // ============ BOND ETFs ============
  { symbol: 'BND', name: 'Vanguard Total Bond Market ETF', type: 'Bond ETF', assetClass: 'bond', category: 'Bonds', popularity: 88 },
  { symbol: 'AGG', name: 'iShares Core U.S. Aggregate Bond ETF', type: 'Bond ETF', assetClass: 'bond', category: 'Bonds', popularity: 86 },
  { symbol: 'TLT', name: 'iShares 20+ Year Treasury Bond ETF', type: 'Bond ETF', assetClass: 'bond', category: 'Bonds', popularity: 84 },
  { symbol: 'IEF', name: 'iShares 7-10 Year Treasury Bond ETF', type: 'Bond ETF', assetClass: 'bond', category: 'Bonds', popularity: 75 },
  { symbol: 'LQD', name: 'iShares iBoxx Investment Grade Corporate Bond ETF', type: 'Bond ETF', assetClass: 'bond', category: 'Bonds', popularity: 74 },
  { symbol: 'HYG', name: 'iShares iBoxx High Yield Corporate Bond ETF', type: 'Bond ETF', assetClass: 'bond', category: 'Bonds', popularity: 73 },
  { symbol: 'VCIT', name: 'Vanguard Intermediate-Term Corporate Bond ETF', type: 'Bond ETF', assetClass: 'bond', category: 'Bonds', popularity: 70 },
  { symbol: 'VCSH', name: 'Vanguard Short-Term Corporate Bond ETF', type: 'Bond ETF', assetClass: 'bond', category: 'Bonds', popularity: 69 },
  { symbol: 'BSV', name: 'Vanguard Short-Term Bond ETF', type: 'Bond ETF', assetClass: 'bond', category: 'Bonds', popularity: 68 },
  { symbol: 'BIV', name: 'Vanguard Intermediate-Term Bond ETF', type: 'Bond ETF', assetClass: 'bond', category: 'Bonds', popularity: 67 },
  { symbol: 'GOVT', name: 'iShares U.S. Treasury Bond ETF', type: 'Bond ETF', assetClass: 'bond', category: 'Bonds', popularity: 66 },
  { symbol: 'TIP', name: 'iShares TIPS Bond ETF', type: 'Bond ETF', assetClass: 'bond', category: 'Bonds', popularity: 65 },
  { symbol: 'SHY', name: 'iShares 1-3 Year Treasury Bond ETF', type: 'Bond ETF', assetClass: 'bond', category: 'Bonds', popularity: 64 },
  { symbol: 'SCHZ', name: 'Schwab U.S. Aggregate Bond ETF', type: 'Bond ETF', assetClass: 'bond', category: 'Bonds', popularity: 63 },
  { symbol: 'BNDX', name: 'Vanguard Total International Bond ETF', type: 'Bond ETF', assetClass: 'bond', category: 'Bonds', popularity: 62 },
  
  // ============ REITs ============
  { symbol: 'VNQ', name: 'Vanguard Real Estate ETF', type: 'REIT', assetClass: 'reit', category: 'Real Estate', popularity: 87 },
  { symbol: 'O', name: 'Realty Income Corporation', type: 'REIT', assetClass: 'reit', category: 'Monthly Dividend', popularity: 89 },
  { symbol: 'SPG', name: 'Simon Property Group Inc.', type: 'REIT', assetClass: 'reit', category: 'Real Estate', popularity: 72 },
  { symbol: 'AMT', name: 'American Tower Corporation', type: 'REIT', assetClass: 'reit', category: 'Real Estate', popularity: 75 },
  { symbol: 'PLD', name: 'Prologis Inc.', type: 'REIT', assetClass: 'reit', category: 'Real Estate', popularity: 74 },
  { symbol: 'CCI', name: 'Crown Castle Inc.', type: 'REIT', assetClass: 'reit', category: 'Real Estate', popularity: 70 },
  { symbol: 'EQIX', name: 'Equinix Inc.', type: 'REIT', assetClass: 'reit', category: 'Real Estate', popularity: 69 },
  { symbol: 'DLR', name: 'Digital Realty Trust Inc.', type: 'REIT', assetClass: 'reit', category: 'Real Estate', popularity: 68 },
  { symbol: 'PSA', name: 'Public Storage', type: 'REIT', assetClass: 'reit', category: 'Real Estate', popularity: 71 },
  { symbol: 'EXR', name: 'Extra Space Storage Inc.', type: 'REIT', assetClass: 'reit', category: 'Real Estate', popularity: 65 },
  { symbol: 'WELL', name: 'Welltower Inc.', type: 'REIT', assetClass: 'reit', category: 'Real Estate', popularity: 64 },
  { symbol: 'STAG', name: 'STAG Industrial Inc.', type: 'REIT', assetClass: 'reit', category: 'Monthly Dividend', popularity: 67 },
  { symbol: 'NNN', name: 'NNN REIT Inc.', type: 'REIT', assetClass: 'reit', category: 'Real Estate', popularity: 63 },
  { symbol: 'WPC', name: 'W. P. Carey Inc.', type: 'REIT', assetClass: 'reit', category: 'Real Estate', popularity: 62 },
  { symbol: 'SCHH', name: 'Schwab U.S. REIT ETF', type: 'REIT', assetClass: 'reit', category: 'Real Estate', popularity: 66 },
  { symbol: 'IYR', name: 'iShares U.S. Real Estate ETF', type: 'REIT', assetClass: 'reit', category: 'Real Estate', popularity: 65 },
  { symbol: 'XLRE', name: 'Real Estate Select Sector SPDR Fund', type: 'REIT', assetClass: 'reit', category: 'Real Estate', popularity: 64 },
  
  // ============ MEGA-CAP TECH ============
  { symbol: 'AAPL', name: 'Apple Inc.', type: 'Stock', assetClass: 'stock', category: 'Tech Blue-Chip', popularity: 100 },
  { symbol: 'MSFT', name: 'Microsoft Corporation', type: 'Stock', assetClass: 'stock', category: 'Tech Blue-Chip', popularity: 99 },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', type: 'Stock', assetClass: 'stock', category: 'Tech Blue-Chip', popularity: 97 },
  { symbol: 'GOOG', name: 'Alphabet Inc. Class C', type: 'Stock', assetClass: 'stock', category: 'Tech Blue-Chip', popularity: 90 },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', type: 'Stock', assetClass: 'stock', category: 'Tech Blue-Chip', popularity: 98 },
  { symbol: 'META', name: 'Meta Platforms Inc.', type: 'Stock', assetClass: 'stock', category: 'Tech Blue-Chip', popularity: 95 },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', type: 'Stock', assetClass: 'stock', category: 'AI/Growth', popularity: 100 },
  { symbol: 'TSLA', name: 'Tesla Inc.', type: 'Stock', assetClass: 'stock', category: 'Growth', popularity: 96 },
  
  // ============ TECH / SEMICONDUCTORS ============
  { symbol: 'AMD', name: 'Advanced Micro Devices Inc.', type: 'Stock', assetClass: 'stock', category: 'Semiconductors', popularity: 91 },
  { symbol: 'INTC', name: 'Intel Corporation', type: 'Stock', assetClass: 'stock', category: 'Semiconductors', popularity: 80 },
  { symbol: 'AVGO', name: 'Broadcom Inc.', type: 'Stock', assetClass: 'stock', category: 'Semiconductors', popularity: 85 },
  { symbol: 'TSM', name: 'Taiwan Semiconductor Manufacturing', type: 'Stock', assetClass: 'stock', category: 'Semiconductors', popularity: 86 },
  { symbol: 'QCOM', name: 'Qualcomm Incorporated', type: 'Stock', assetClass: 'stock', category: 'Semiconductors', popularity: 78 },
  { symbol: 'TXN', name: 'Texas Instruments Incorporated', type: 'Stock', assetClass: 'stock', category: 'Semiconductors', popularity: 76 },
  { symbol: 'MU', name: 'Micron Technology Inc.', type: 'Stock', assetClass: 'stock', category: 'Semiconductors', popularity: 75 },
  { symbol: 'ARM', name: 'Arm Holdings plc', type: 'Stock', assetClass: 'stock', category: 'Semiconductors', popularity: 82 },
  { symbol: 'ASML', name: 'ASML Holding N.V.', type: 'Stock', assetClass: 'stock', category: 'Semiconductors', popularity: 83 },
  { symbol: 'LRCX', name: 'Lam Research Corporation', type: 'Stock', assetClass: 'stock', category: 'Semiconductors', popularity: 72 },
  { symbol: 'AMAT', name: 'Applied Materials Inc.', type: 'Stock', assetClass: 'stock', category: 'Semiconductors', popularity: 73 },
  
  // ============ SOFTWARE / CLOUD ============
  { symbol: 'CRM', name: 'Salesforce Inc.', type: 'Stock', assetClass: 'stock', category: 'Software', popularity: 84 },
  { symbol: 'ADBE', name: 'Adobe Inc.', type: 'Stock', assetClass: 'stock', category: 'Software', popularity: 82 },
  { symbol: 'ORCL', name: 'Oracle Corporation', type: 'Stock', assetClass: 'stock', category: 'Software', popularity: 80 },
  { symbol: 'NOW', name: 'ServiceNow Inc.', type: 'Stock', assetClass: 'stock', category: 'Software', popularity: 78 },
  { symbol: 'PLTR', name: 'Palantir Technologies Inc.', type: 'Stock', assetClass: 'stock', category: 'AI/Growth', popularity: 88 },
  { symbol: 'SNOW', name: 'Snowflake Inc.', type: 'Stock', assetClass: 'stock', category: 'Software', popularity: 75 },
  { symbol: 'NET', name: 'Cloudflare Inc.', type: 'Stock', assetClass: 'stock', category: 'Software', popularity: 74 },
  { symbol: 'PANW', name: 'Palo Alto Networks Inc.', type: 'Stock', assetClass: 'stock', category: 'Cybersecurity', popularity: 77 },
  { symbol: 'CRWD', name: 'CrowdStrike Holdings Inc.', type: 'Stock', assetClass: 'stock', category: 'Cybersecurity', popularity: 79 },
  { symbol: 'CSCO', name: 'Cisco Systems Inc.', type: 'Stock', assetClass: 'stock', category: 'Networking', popularity: 76 },
  { symbol: 'IBM', name: 'International Business Machines', type: 'Stock', assetClass: 'stock', category: 'Tech Blue-Chip', popularity: 72 },
  
  // ============ FINANCIALS ============
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', type: 'Stock', assetClass: 'stock', category: 'Financials', popularity: 93 },
  { symbol: 'BAC', name: 'Bank of America Corporation', type: 'Stock', assetClass: 'stock', category: 'Financials', popularity: 85 },
  { symbol: 'WFC', name: 'Wells Fargo & Company', type: 'Stock', assetClass: 'stock', category: 'Financials', popularity: 80 },
  { symbol: 'GS', name: 'The Goldman Sachs Group Inc.', type: 'Stock', assetClass: 'stock', category: 'Financials', popularity: 82 },
  { symbol: 'MS', name: 'Morgan Stanley', type: 'Stock', assetClass: 'stock', category: 'Financials', popularity: 79 },
  { symbol: 'C', name: 'Citigroup Inc.', type: 'Stock', assetClass: 'stock', category: 'Financials', popularity: 77 },
  { symbol: 'BLK', name: 'BlackRock Inc.', type: 'Stock', assetClass: 'stock', category: 'Financials', popularity: 81 },
  { symbol: 'SCHW', name: 'The Charles Schwab Corporation', type: 'Stock', assetClass: 'stock', category: 'Financials', popularity: 78 },
  { symbol: 'V', name: 'Visa Inc.', type: 'Stock', assetClass: 'stock', category: 'Financials', popularity: 92 },
  { symbol: 'MA', name: 'Mastercard Incorporated', type: 'Stock', assetClass: 'stock', category: 'Financials', popularity: 90 },
  { symbol: 'AXP', name: 'American Express Company', type: 'Stock', assetClass: 'stock', category: 'Financials', popularity: 83 },
  { symbol: 'BRK.B', name: 'Berkshire Hathaway Inc. Class B', type: 'Stock', assetClass: 'stock', category: 'Financials', popularity: 94 },
  
  // ============ HEALTHCARE ============
  { symbol: 'JNJ', name: 'Johnson & Johnson', type: 'Stock', assetClass: 'stock', category: 'Healthcare', popularity: 91 },
  { symbol: 'UNH', name: 'UnitedHealth Group Incorporated', type: 'Stock', assetClass: 'stock', category: 'Healthcare', popularity: 89 },
  { symbol: 'LLY', name: 'Eli Lilly and Company', type: 'Stock', assetClass: 'stock', category: 'Healthcare', popularity: 93 },
  { symbol: 'PFE', name: 'Pfizer Inc.', type: 'Stock', assetClass: 'stock', category: 'Healthcare', popularity: 82 },
  { symbol: 'MRK', name: 'Merck & Co. Inc.', type: 'Stock', assetClass: 'stock', category: 'Healthcare', popularity: 84 },
  { symbol: 'ABBV', name: 'AbbVie Inc.', type: 'Stock', assetClass: 'stock', category: 'Healthcare', popularity: 86 },
  { symbol: 'ABT', name: 'Abbott Laboratories', type: 'Stock', assetClass: 'stock', category: 'Healthcare', popularity: 81 },
  { symbol: 'TMO', name: 'Thermo Fisher Scientific Inc.', type: 'Stock', assetClass: 'stock', category: 'Healthcare', popularity: 79 },
  { symbol: 'DHR', name: 'Danaher Corporation', type: 'Stock', assetClass: 'stock', category: 'Healthcare', popularity: 77 },
  { symbol: 'BMY', name: 'Bristol-Myers Squibb Company', type: 'Stock', assetClass: 'stock', category: 'Healthcare', popularity: 75 },
  { symbol: 'AMGN', name: 'Amgen Inc.', type: 'Stock', assetClass: 'stock', category: 'Healthcare', popularity: 78 },
  { symbol: 'GILD', name: 'Gilead Sciences Inc.', type: 'Stock', assetClass: 'stock', category: 'Healthcare', popularity: 74 },
  { symbol: 'NVO', name: 'Novo Nordisk A/S', type: 'Stock', assetClass: 'stock', category: 'Healthcare', popularity: 88 },
  
  // ============ CONSUMER ============
  { symbol: 'WMT', name: 'Walmart Inc.', type: 'Stock', assetClass: 'stock', category: 'Consumer', popularity: 88 },
  { symbol: 'COST', name: 'Costco Wholesale Corporation', type: 'Stock', assetClass: 'stock', category: 'Consumer', popularity: 90 },
  { symbol: 'HD', name: 'The Home Depot Inc.', type: 'Stock', assetClass: 'stock', category: 'Consumer', popularity: 85 },
  { symbol: 'LOW', name: 'Lowe\'s Companies Inc.', type: 'Stock', assetClass: 'stock', category: 'Consumer', popularity: 78 },
  { symbol: 'TGT', name: 'Target Corporation', type: 'Stock', assetClass: 'stock', category: 'Consumer', popularity: 76 },
  { symbol: 'PG', name: 'The Procter & Gamble Company', type: 'Stock', assetClass: 'stock', category: 'Consumer', popularity: 87 },
  { symbol: 'KO', name: 'The Coca-Cola Company', type: 'Stock', assetClass: 'stock', category: 'Consumer', popularity: 89 },
  { symbol: 'PEP', name: 'PepsiCo Inc.', type: 'Stock', assetClass: 'stock', category: 'Consumer', popularity: 86 },
  { symbol: 'MCD', name: 'McDonald\'s Corporation', type: 'Stock', assetClass: 'stock', category: 'Consumer', popularity: 84 },
  { symbol: 'SBUX', name: 'Starbucks Corporation', type: 'Stock', assetClass: 'stock', category: 'Consumer', popularity: 82 },
  { symbol: 'NKE', name: 'NIKE Inc.', type: 'Stock', assetClass: 'stock', category: 'Consumer', popularity: 80 },
  { symbol: 'DIS', name: 'The Walt Disney Company', type: 'Stock', assetClass: 'stock', category: 'Entertainment', popularity: 83 },
  { symbol: 'NFLX', name: 'Netflix Inc.', type: 'Stock', assetClass: 'stock', category: 'Entertainment', popularity: 87 },
  
  // ============ ENERGY ============
  { symbol: 'XOM', name: 'Exxon Mobil Corporation', type: 'Stock', assetClass: 'stock', category: 'Energy', popularity: 85 },
  { symbol: 'CVX', name: 'Chevron Corporation', type: 'Stock', assetClass: 'stock', category: 'Energy', popularity: 83 },
  { symbol: 'COP', name: 'ConocoPhillips', type: 'Stock', assetClass: 'stock', category: 'Energy', popularity: 75 },
  { symbol: 'SLB', name: 'Schlumberger Limited', type: 'Stock', assetClass: 'stock', category: 'Energy', popularity: 72 },
  { symbol: 'EOG', name: 'EOG Resources Inc.', type: 'Stock', assetClass: 'stock', category: 'Energy', popularity: 70 },
  { symbol: 'OXY', name: 'Occidental Petroleum Corporation', type: 'Stock', assetClass: 'stock', category: 'Energy', popularity: 73 },
  
  // ============ INDUSTRIALS ============
  { symbol: 'CAT', name: 'Caterpillar Inc.', type: 'Stock', assetClass: 'stock', category: 'Industrials', popularity: 80 },
  { symbol: 'DE', name: 'Deere & Company', type: 'Stock', assetClass: 'stock', category: 'Industrials', popularity: 78 },
  { symbol: 'HON', name: 'Honeywell International Inc.', type: 'Stock', assetClass: 'stock', category: 'Industrials', popularity: 77 },
  { symbol: 'UPS', name: 'United Parcel Service Inc.', type: 'Stock', assetClass: 'stock', category: 'Industrials', popularity: 76 },
  { symbol: 'BA', name: 'The Boeing Company', type: 'Stock', assetClass: 'stock', category: 'Industrials', popularity: 79 },
  { symbol: 'RTX', name: 'RTX Corporation', type: 'Stock', assetClass: 'stock', category: 'Industrials', popularity: 74 },
  { symbol: 'LMT', name: 'Lockheed Martin Corporation', type: 'Stock', assetClass: 'stock', category: 'Industrials', popularity: 75 },
  { symbol: 'GE', name: 'General Electric Company', type: 'Stock', assetClass: 'stock', category: 'Industrials', popularity: 81 },
  { symbol: 'MMM', name: '3M Company', type: 'Stock', assetClass: 'stock', category: 'Industrials', popularity: 70 },
  
  // ============ UTILITIES ============
  { symbol: 'NEE', name: 'NextEra Energy Inc.', type: 'Stock', assetClass: 'stock', category: 'Utilities', popularity: 78 },
  { symbol: 'DUK', name: 'Duke Energy Corporation', type: 'Stock', assetClass: 'stock', category: 'Utilities', popularity: 72 },
  { symbol: 'SO', name: 'The Southern Company', type: 'Stock', assetClass: 'stock', category: 'Utilities', popularity: 70 },
  { symbol: 'D', name: 'Dominion Energy Inc.', type: 'Stock', assetClass: 'stock', category: 'Utilities', popularity: 68 },
  { symbol: 'AEP', name: 'American Electric Power Company', type: 'Stock', assetClass: 'stock', category: 'Utilities', popularity: 66 },
  { symbol: 'XEL', name: 'Xcel Energy Inc.', type: 'Stock', assetClass: 'stock', category: 'Utilities', popularity: 65 },
  
  // ============ TELECOM ============
  { symbol: 'T', name: 'AT&T Inc.', type: 'Stock', assetClass: 'stock', category: 'Telecom', popularity: 75 },
  { symbol: 'VZ', name: 'Verizon Communications Inc.', type: 'Stock', assetClass: 'stock', category: 'Telecom', popularity: 77 },
  { symbol: 'TMUS', name: 'T-Mobile US Inc.', type: 'Stock', assetClass: 'stock', category: 'Telecom', popularity: 74 },
  
  // ============ SECTOR ETFs ============
  { symbol: 'XLK', name: 'Technology Select Sector SPDR Fund', type: 'ETF', assetClass: 'etf', category: 'Sector', popularity: 82 },
  { symbol: 'XLF', name: 'Financial Select Sector SPDR Fund', type: 'ETF', assetClass: 'etf', category: 'Sector', popularity: 78 },
  { symbol: 'XLE', name: 'Energy Select Sector SPDR Fund', type: 'ETF', assetClass: 'etf', category: 'Sector', popularity: 76 },
  { symbol: 'XLV', name: 'Health Care Select Sector SPDR Fund', type: 'ETF', assetClass: 'etf', category: 'Sector', popularity: 77 },
  { symbol: 'XLI', name: 'Industrial Select Sector SPDR Fund', type: 'ETF', assetClass: 'etf', category: 'Sector', popularity: 74 },
  { symbol: 'XLP', name: 'Consumer Staples Select Sector SPDR Fund', type: 'ETF', assetClass: 'etf', category: 'Sector', popularity: 73 },
  { symbol: 'XLY', name: 'Consumer Discretionary Select Sector SPDR Fund', type: 'ETF', assetClass: 'etf', category: 'Sector', popularity: 75 },
  { symbol: 'XLU', name: 'Utilities Select Sector SPDR Fund', type: 'ETF', assetClass: 'etf', category: 'Sector', popularity: 72 },
  { symbol: 'XLB', name: 'Materials Select Sector SPDR Fund', type: 'ETF', assetClass: 'etf', category: 'Sector', popularity: 70 },
  { symbol: 'VHT', name: 'Vanguard Health Care ETF', type: 'ETF', assetClass: 'etf', category: 'Sector', popularity: 71 },
  
  // ============ ARK ETFs ============
  { symbol: 'ARKK', name: 'ARK Innovation ETF', type: 'ETF', assetClass: 'etf', category: 'Growth', popularity: 80 },
  { symbol: 'ARKW', name: 'ARK Next Generation Internet ETF', type: 'ETF', assetClass: 'etf', category: 'Growth', popularity: 72 },
  { symbol: 'ARKG', name: 'ARK Genomic Revolution ETF', type: 'ETF', assetClass: 'etf', category: 'Growth', popularity: 70 },
  { symbol: 'ARKF', name: 'ARK Fintech Innovation ETF', type: 'ETF', assetClass: 'etf', category: 'Growth', popularity: 68 },
  { symbol: 'ARKQ', name: 'ARK Autonomous Tech & Robotics ETF', type: 'ETF', assetClass: 'etf', category: 'Growth', popularity: 67 },
  
  // ============ INTERNATIONAL ETFs ============
  { symbol: 'EFA', name: 'iShares MSCI EAFE ETF', type: 'ETF', assetClass: 'etf', category: 'International', popularity: 78 },
  { symbol: 'EEM', name: 'iShares MSCI Emerging Markets ETF', type: 'ETF', assetClass: 'etf', category: 'International', popularity: 77 },
  { symbol: 'IEFA', name: 'iShares Core MSCI EAFE ETF', type: 'ETF', assetClass: 'etf', category: 'International', popularity: 76 },
  { symbol: 'IEMG', name: 'iShares Core MSCI Emerging Markets ETF', type: 'ETF', assetClass: 'etf', category: 'International', popularity: 75 },
];

/**
 * Pre-computed catalog with normalized search fields
 */
export const ASSET_CATALOG: LocalAsset[] = CATALOG_DATA.map(asset => ({
  ...asset,
  normalizedSymbol: asset.symbol.toLowerCase(),
  normalizedName: asset.name.toLowerCase(),
}));

/**
 * Create a lookup map for O(1) symbol access
 */
export const CATALOG_BY_SYMBOL = new Map<string, LocalAsset>(
  ASSET_CATALOG.map(a => [a.normalizedSymbol, a])
);

/**
 * Get asset from catalog by symbol
 */
export function getCatalogAsset(symbol: string): LocalAsset | undefined {
  return CATALOG_BY_SYMBOL.get(symbol.toLowerCase());
}

/**
 * Check if a symbol exists in the local catalog
 */
export function isInCatalog(symbol: string): boolean {
  return CATALOG_BY_SYMBOL.has(symbol.toLowerCase());
}
