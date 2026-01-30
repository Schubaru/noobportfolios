import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Search, TrendingUp, TrendingDown, AlertCircle, Loader2, DollarSign, Hash, Building2, Globe, Banknote, Info, HelpCircle, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatShares } from '@/lib/portfolio';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { Portfolio, QuoteData, Holding, AssetClass } from '@/lib/types';
import { formatCurrency, formatPercent } from '@/lib/portfolio';
import { fetchQuote, fetchFundamentals, fetchProfile, searchSymbolsApi, formatLargeNumber, formatVolume, formatMetricPercent, formatRatio, formatMetricCurrency, FinnhubQuote, FinnhubFundamentals, FinnhubProfile, FinnhubSearchResult } from '@/lib/finnhub';
import { Skeleton } from '@/components/ui/skeleton';
interface TradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  portfolio: Portfolio;
  onTradeComplete: () => void;
  initialSymbol?: string;
}
type TradeType = 'buy' | 'sell';
type TradeStep = 'search' | 'details' | 'confirm';
type InputMode = 'shares' | 'dollars';
type TradeStatus = 'idle' | 'executing' | 'success' | 'error';

// Hook to detect reduced motion preference
function useReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);
  
  return prefersReducedMotion;
}

// Success overlay component with animation
function TradeSuccessOverlay({
  tradeType,
  symbol,
  shares,
  onComplete
}: {
  tradeType: 'buy' | 'sell';
  symbol: string;
  shares: number;
  onComplete: () => void;
}) {
  const prefersReducedMotion = useReducedMotion();
  
  useEffect(() => {
    const timer = setTimeout(onComplete, prefersReducedMotion ? 600 : 1200);
    return () => clearTimeout(timer);
  }, [onComplete, prefersReducedMotion]);
  
  return (
    <div 
      className="absolute inset-0 flex flex-col items-center justify-center bg-card/95 backdrop-blur-sm z-20"
      role="status"
      aria-live="polite"
    >
      <div className={cn(
        "flex flex-col items-center",
        !prefersReducedMotion && "animate-success-enter"
      )}>
        {/* Checkmark with glow */}
        <div className={cn(
          "w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center",
          !prefersReducedMotion && "animate-success-glow"
        )}>
          <Check className="w-8 h-8 text-primary" />
        </div>
        
        {/* Text */}
        <p className="text-lg font-semibold mt-4 text-foreground">Order Executed</p>
        <p className="text-sm text-muted-foreground mt-1">
          {tradeType === 'buy' ? 'Bought' : 'Sold'} {formatShares(shares)} shares of {symbol}
        </p>
      </div>
    </div>
  );
}

// Known ETF symbols that may be misclassified by Finnhub
const KNOWN_ETF_SYMBOLS = new Set(['JEPI', 'JEPQ', 'SCHD', 'VYM', 'SPHD', 'DVY', 'HDV', 'DIVO', 'QYLD', 'XYLD', 'VOO', 'VTI', 'QQQ', 'SPY', 'IVV', 'VIG', 'VUG', 'VTV', 'VXUS', 'VEA', 'VWO', 'BND', 'AGG', 'TLT', 'IEF', 'LQD', 'HYG', 'VCIT', 'VCSH', 'BSV', 'VNQ', 'VNQI', 'SCHH', 'IYR', 'XLRE', 'RWR', 'VHT', 'XLV', 'XLF', 'XLE', 'XLK', 'XLI', 'XLP', 'XLY', 'XLB', 'XLU', 'ARKK', 'ARKW', 'ARKG', 'ARKF']);

// Known Bond ETF symbols
const KNOWN_BOND_SYMBOLS = new Set(['BND', 'AGG', 'TLT', 'IEF', 'LQD', 'HYG', 'VCIT', 'VCSH', 'BSV', 'BIV', 'GOVT', 'MUB', 'TIP', 'SHY', 'SCHZ', 'BNDX', 'EMB', 'JNK', 'VGIT', 'VGLT']);

// Known REIT symbols
const KNOWN_REIT_SYMBOLS = new Set(['VNQ', 'O', 'SPG', 'AMT', 'PLD', 'CCI', 'EQIX', 'DLR', 'PSA', 'EXR', 'WELL', 'AVB', 'EQR', 'SCHH', 'IYR', 'RWR', 'XLRE', 'STAG', 'NNN', 'WPC']);

// Curated dividend data for popular ETFs (Finnhub free tier doesn't return ETF dividend data)
// Data sourced from public ETF providers - yields are approximate and subject to change
const KNOWN_ETF_DIVIDENDS: Record<string, {
  yield: number; // Current approximate yield %
  frequency: string; // 'quarterly', 'monthly', etc.
  annualAmount: number; // Annual dividend per share (approximate)
}> = {
  // S&P 500 / Total Market ETFs
  'VTI': {
    yield: 1.30,
    frequency: 'quarterly',
    annualAmount: 3.85
  },
  'VOO': {
    yield: 1.25,
    frequency: 'quarterly',
    annualAmount: 7.00
  },
  'SPY': {
    yield: 1.22,
    frequency: 'quarterly',
    annualAmount: 7.20
  },
  'IVV': {
    yield: 1.25,
    frequency: 'quarterly',
    annualAmount: 7.10
  },
  // Nasdaq / Growth ETFs
  'QQQ': {
    yield: 0.55,
    frequency: 'quarterly',
    annualAmount: 2.90
  },
  'VUG': {
    yield: 0.50,
    frequency: 'quarterly',
    annualAmount: 2.00
  },
  // Dividend-focused ETFs
  'VYM': {
    yield: 2.75,
    frequency: 'quarterly',
    annualAmount: 3.50
  },
  'SCHD': {
    yield: 3.40,
    frequency: 'quarterly',
    annualAmount: 0.95
  },
  'HDV': {
    yield: 3.30,
    frequency: 'quarterly',
    annualAmount: 3.80
  },
  'DVY': {
    yield: 3.50,
    frequency: 'quarterly',
    annualAmount: 4.50
  },
  'VIG': {
    yield: 1.75,
    frequency: 'quarterly',
    annualAmount: 3.40
  },
  'SPHD': {
    yield: 3.80,
    frequency: 'monthly',
    annualAmount: 1.80
  },
  // High-income ETFs (covered call strategies)
  'JEPI': {
    yield: 7.20,
    frequency: 'monthly',
    annualAmount: 4.10
  },
  'JEPQ': {
    yield: 9.50,
    frequency: 'monthly',
    annualAmount: 5.00
  },
  'QYLD': {
    yield: 11.50,
    frequency: 'monthly',
    annualAmount: 2.00
  },
  'XYLD': {
    yield: 9.80,
    frequency: 'monthly',
    annualAmount: 4.50
  },
  'DIVO': {
    yield: 4.50,
    frequency: 'monthly',
    annualAmount: 1.60
  },
  // Bond ETFs
  'BND': {
    yield: 3.60,
    frequency: 'monthly',
    annualAmount: 2.70
  },
  'AGG': {
    yield: 3.50,
    frequency: 'monthly',
    annualAmount: 3.50
  },
  'TLT': {
    yield: 3.80,
    frequency: 'monthly',
    annualAmount: 3.70
  },
  'LQD': {
    yield: 4.80,
    frequency: 'monthly',
    annualAmount: 5.40
  },
  'HYG': {
    yield: 5.50,
    frequency: 'monthly',
    annualAmount: 4.30
  },
  'VCIT': {
    yield: 4.40,
    frequency: 'monthly',
    annualAmount: 3.70
  },
  'VCSH': {
    yield: 3.80,
    frequency: 'monthly',
    annualAmount: 3.00
  },
  // REIT ETFs
  'VNQ': {
    yield: 3.90,
    frequency: 'quarterly',
    annualAmount: 3.60
  },
  'SCHH': {
    yield: 2.80,
    frequency: 'quarterly',
    annualAmount: 0.60
  },
  'IYR': {
    yield: 2.50,
    frequency: 'quarterly',
    annualAmount: 2.40
  },
  'XLRE': {
    yield: 3.20,
    frequency: 'quarterly',
    annualAmount: 1.50
  },
  // International ETFs
  'VXUS': {
    yield: 3.00,
    frequency: 'quarterly',
    annualAmount: 1.85
  },
  'VEA': {
    yield: 3.20,
    frequency: 'quarterly',
    annualAmount: 1.65
  },
  'VWO': {
    yield: 3.40,
    frequency: 'quarterly',
    annualAmount: 1.50
  },
  // Sector ETFs
  'XLU': {
    yield: 2.90,
    frequency: 'quarterly',
    annualAmount: 2.20
  },
  'XLE': {
    yield: 3.30,
    frequency: 'quarterly',
    annualAmount: 3.00
  },
  'XLF': {
    yield: 1.50,
    frequency: 'quarterly',
    annualAmount: 0.70
  },
  'VHT': {
    yield: 1.30,
    frequency: 'quarterly',
    annualAmount: 3.60
  }
};

// Known dividend-paying REITs (monthly payers are popular with income investors)
const KNOWN_REIT_DIVIDENDS: Record<string, {
  yield: number;
  frequency: string;
  annualAmount: number;
}> = {
  'O': {
    yield: 5.50,
    frequency: 'monthly',
    annualAmount: 3.10
  },
  'STAG': {
    yield: 4.20,
    frequency: 'monthly',
    annualAmount: 1.47
  },
  'NNN': {
    yield: 5.00,
    frequency: 'quarterly',
    annualAmount: 2.32
  },
  'WPC': {
    yield: 5.80,
    frequency: 'quarterly',
    annualAmount: 3.48
  },
  'SPG': {
    yield: 5.00,
    frequency: 'quarterly',
    annualAmount: 8.00
  },
  'PSA': {
    yield: 4.00,
    frequency: 'quarterly',
    annualAmount: 12.00
  }
};

// Curated dividend data for popular individual stocks
// Data sourced from public financial records - yields are approximate and subject to change
const KNOWN_STOCK_DIVIDENDS: Record<string, {
  yield: number;
  frequency: string;
  annualAmount: number;
}> = {
  // Dividend Aristocrats (25+ years of dividend increases)
  'JNJ': {
    yield: 3.10,
    frequency: 'quarterly',
    annualAmount: 5.00
  },
  'KO': {
    yield: 2.90,
    frequency: 'quarterly',
    annualAmount: 2.00
  },
  'PG': {
    yield: 2.40,
    frequency: 'quarterly',
    annualAmount: 4.00
  },
  'PEP': {
    yield: 2.70,
    frequency: 'quarterly',
    annualAmount: 5.42
  },
  'MCD': {
    yield: 2.20,
    frequency: 'quarterly',
    annualAmount: 6.68
  },
  'MMM': {
    yield: 5.80,
    frequency: 'quarterly',
    annualAmount: 6.00
  },
  'ABT': {
    yield: 1.80,
    frequency: 'quarterly',
    annualAmount: 2.20
  },
  'T': {
    yield: 5.10,
    frequency: 'quarterly',
    annualAmount: 1.11
  },
  'VZ': {
    yield: 6.40,
    frequency: 'quarterly',
    annualAmount: 2.71
  },
  'XOM': {
    yield: 3.30,
    frequency: 'quarterly',
    annualAmount: 3.96
  },
  'CVX': {
    yield: 4.20,
    frequency: 'quarterly',
    annualAmount: 6.52
  },
  'IBM': {
    yield: 2.60,
    frequency: 'quarterly',
    annualAmount: 6.68
  },
  'HD': {
    yield: 2.30,
    frequency: 'quarterly',
    annualAmount: 9.00
  },
  'LOW': {
    yield: 1.90,
    frequency: 'quarterly',
    annualAmount: 4.60
  },
  'WMT': {
    yield: 1.30,
    frequency: 'quarterly',
    annualAmount: 1.32
  },
  'COST': {
    yield: 0.50,
    frequency: 'quarterly',
    annualAmount: 4.64
  },
  'CL': {
    yield: 2.30,
    frequency: 'quarterly',
    annualAmount: 2.00
  },
  'KMB': {
    yield: 3.50,
    frequency: 'quarterly',
    annualAmount: 4.88
  },
  // Big Tech Dividend Payers
  'AAPL': {
    yield: 0.45,
    frequency: 'quarterly',
    annualAmount: 1.00
  },
  'MSFT': {
    yield: 0.70,
    frequency: 'quarterly',
    annualAmount: 3.00
  },
  'CSCO': {
    yield: 2.80,
    frequency: 'quarterly',
    annualAmount: 1.60
  },
  'INTC': {
    yield: 1.40,
    frequency: 'quarterly',
    annualAmount: 0.50
  },
  'AVGO': {
    yield: 1.30,
    frequency: 'quarterly',
    annualAmount: 21.00
  },
  'TXN': {
    yield: 2.70,
    frequency: 'quarterly',
    annualAmount: 5.20
  },
  'QCOM': {
    yield: 2.00,
    frequency: 'quarterly',
    annualAmount: 3.40
  },
  // Financials
  'JPM': {
    yield: 2.10,
    frequency: 'quarterly',
    annualAmount: 5.00
  },
  'BAC': {
    yield: 2.40,
    frequency: 'quarterly',
    annualAmount: 1.04
  },
  'WFC': {
    yield: 2.30,
    frequency: 'quarterly',
    annualAmount: 1.60
  },
  'GS': {
    yield: 2.00,
    frequency: 'quarterly',
    annualAmount: 12.00
  },
  'BLK': {
    yield: 2.10,
    frequency: 'quarterly',
    annualAmount: 20.40
  },
  'MS': {
    yield: 3.20,
    frequency: 'quarterly',
    annualAmount: 3.40
  },
  'C': {
    yield: 3.00,
    frequency: 'quarterly',
    annualAmount: 2.12
  },
  'USB': {
    yield: 4.20,
    frequency: 'quarterly',
    annualAmount: 2.00
  },
  'PNC': {
    yield: 3.40,
    frequency: 'quarterly',
    annualAmount: 6.20
  },
  // Healthcare
  'ABBV': {
    yield: 3.40,
    frequency: 'quarterly',
    annualAmount: 6.56
  },
  'MRK': {
    yield: 3.00,
    frequency: 'quarterly',
    annualAmount: 3.08
  },
  'PFE': {
    yield: 5.80,
    frequency: 'quarterly',
    annualAmount: 1.68
  },
  'LLY': {
    yield: 0.70,
    frequency: 'quarterly',
    annualAmount: 5.60
  },
  'UNH': {
    yield: 1.40,
    frequency: 'quarterly',
    annualAmount: 8.40
  },
  'BMY': {
    yield: 4.50,
    frequency: 'quarterly',
    annualAmount: 2.40
  },
  'AMGN': {
    yield: 3.00,
    frequency: 'quarterly',
    annualAmount: 9.00
  },
  'GILD': {
    yield: 3.50,
    frequency: 'quarterly',
    annualAmount: 3.08
  },
  // Utilities (high-yield, reliable)
  'NEE': {
    yield: 2.60,
    frequency: 'quarterly',
    annualAmount: 2.06
  },
  'DUK': {
    yield: 3.80,
    frequency: 'quarterly',
    annualAmount: 4.18
  },
  'SO': {
    yield: 3.30,
    frequency: 'quarterly',
    annualAmount: 2.88
  },
  'D': {
    yield: 4.80,
    frequency: 'quarterly',
    annualAmount: 2.67
  },
  'AEP': {
    yield: 3.40,
    frequency: 'quarterly',
    annualAmount: 3.60
  },
  'XEL': {
    yield: 3.30,
    frequency: 'quarterly',
    annualAmount: 2.20
  },
  // Consumer
  'NKE': {
    yield: 1.40,
    frequency: 'quarterly',
    annualAmount: 1.54
  },
  'SBUX': {
    yield: 2.40,
    frequency: 'quarterly',
    annualAmount: 2.28
  },
  'MO': {
    yield: 8.00,
    frequency: 'quarterly',
    annualAmount: 4.00
  },
  'PM': {
    yield: 4.40,
    frequency: 'quarterly',
    annualAmount: 5.40
  },
  'DIS': {
    yield: 0.90,
    frequency: 'semi-annually',
    annualAmount: 1.00
  },
  'MDLZ': {
    yield: 2.20,
    frequency: 'quarterly',
    annualAmount: 1.68
  },
  'STZ': {
    yield: 1.50,
    frequency: 'quarterly',
    annualAmount: 4.04
  },
  // Industrials
  'CAT': {
    yield: 1.50,
    frequency: 'quarterly',
    annualAmount: 5.52
  },
  'DE': {
    yield: 1.30,
    frequency: 'quarterly',
    annualAmount: 5.88
  },
  'HON': {
    yield: 2.00,
    frequency: 'quarterly',
    annualAmount: 4.40
  },
  'UPS': {
    yield: 4.40,
    frequency: 'quarterly',
    annualAmount: 6.52
  },
  'RTX': {
    yield: 2.10,
    frequency: 'quarterly',
    annualAmount: 2.48
  },
  'LMT': {
    yield: 2.60,
    frequency: 'quarterly',
    annualAmount: 12.60
  },
  'GE': {
    yield: 0.60,
    frequency: 'quarterly',
    annualAmount: 1.00
  },
  'BA': {
    yield: 0.00,
    frequency: 'none',
    annualAmount: 0
  },
  // Suspended

  // Energy
  'COP': {
    yield: 2.80,
    frequency: 'quarterly',
    annualAmount: 3.16
  },
  'EOG': {
    yield: 2.70,
    frequency: 'quarterly',
    annualAmount: 3.60
  },
  'SLB': {
    yield: 2.40,
    frequency: 'quarterly',
    annualAmount: 1.10
  },
  'OXY': {
    yield: 1.80,
    frequency: 'quarterly',
    annualAmount: 0.88
  }
};

// Detect asset class from type string and symbol
function detectAssetClass(type: string, symbol?: string): AssetClass {
  const upperSymbol = symbol?.toUpperCase() || '';

  // Check known symbol lists first (most reliable)
  if (KNOWN_BOND_SYMBOLS.has(upperSymbol)) return 'bond';
  if (KNOWN_REIT_SYMBOLS.has(upperSymbol)) return 'reit';
  if (KNOWN_ETF_SYMBOLS.has(upperSymbol)) return 'etf';

  // Then check type string
  const lower = type.toLowerCase();
  if (lower.includes('bond')) return 'bond';
  if (lower.includes('reit')) return 'reit';
  if (lower.includes('etf') || lower.includes('etp')) return 'etf';
  return 'stock';
}

// Curated list of high-quality suggested assets
const SUGGESTED_ASSETS = [
// Blue-chip stocks with strong fundamentals
{
  symbol: 'AAPL',
  name: 'Apple Inc.',
  type: 'Stock',
  category: 'Tech Blue-Chip'
}, {
  symbol: 'MSFT',
  name: 'Microsoft Corp.',
  type: 'Stock',
  category: 'Tech Blue-Chip'
}, {
  symbol: 'JNJ',
  name: 'Johnson & Johnson',
  type: 'Stock',
  category: 'Healthcare'
}, {
  symbol: 'JPM',
  name: 'JPMorgan Chase & Co.',
  type: 'Stock',
  category: 'Financials'
},
// Core ETFs for diversification
{
  symbol: 'VOO',
  name: 'Vanguard S&P 500 ETF',
  type: 'ETF',
  category: 'Index Fund'
}, {
  symbol: 'VTI',
  name: 'Vanguard Total Stock Market ETF',
  type: 'ETF',
  category: 'Index Fund'
}, {
  symbol: 'QQQ',
  name: 'Invesco QQQ Trust',
  type: 'ETF',
  category: 'Tech Index'
},
// Dividend-focused assets
{
  symbol: 'VYM',
  name: 'Vanguard High Dividend Yield ETF',
  type: 'ETF',
  category: 'Dividend'
}, {
  symbol: 'SCHD',
  name: 'Schwab U.S. Dividend Equity ETF',
  type: 'ETF',
  category: 'Dividend'
}, {
  symbol: 'O',
  name: 'Realty Income Corp.',
  type: 'REIT',
  category: 'Monthly Dividend'
},
// Bonds for stability
{
  symbol: 'BND',
  name: 'Vanguard Total Bond ETF',
  type: 'Bond ETF',
  category: 'Bonds'
}, {
  symbol: 'AGG',
  name: 'iShares Core US Aggregate Bond',
  type: 'Bond ETF',
  category: 'Bonds'
},
// Growth stocks
{
  symbol: 'NVDA',
  name: 'NVIDIA Corp.',
  type: 'Stock',
  category: 'AI/Growth'
}, {
  symbol: 'GOOGL',
  name: 'Alphabet Inc.',
  type: 'Stock',
  category: 'Tech Blue-Chip'
}];

// Curated descriptions for popular assets (for educational context)
const ASSET_DESCRIPTIONS: Record<string, string> = {
  // Index ETFs
  'VOO': 'Tracks the S&P 500 index, giving you exposure to 500 of the largest U.S. companies in a single investment. Low-cost and highly diversified.',
  'VTI': 'Covers the entire U.S. stock market including small, mid, and large-cap companies. One of the most diversified U.S. stock ETFs available.',
  'QQQ': 'Tracks the Nasdaq-100 index, focused on 100 of the largest non-financial companies on Nasdaq. Heavy in technology and growth stocks.',
  'SPY': 'The original S&P 500 ETF and one of the most traded securities in the world. Provides exposure to America\'s largest companies.',
  'IVV': 'Low-cost ETF tracking the S&P 500 from BlackRock. Similar to VOO and SPY with slightly different expense ratios.',
  // Dividend ETFs
  'VYM': 'Focuses on high dividend-paying U.S. stocks. Good for income-focused investors seeking regular dividend payments.',
  'SCHD': 'Tracks quality dividend stocks with consistent payment history. Known for solid dividend growth over time.',
  'JEPI': 'Generates monthly income through a combination of dividends and options premiums. Popular for income-focused portfolios.',
  'JEPQ': 'Similar to JEPI but focused on Nasdaq stocks. Offers monthly income with tech exposure.',
  'HDV': 'Invests in high-dividend U.S. stocks with quality screens. Focuses on established, financially healthy companies.',
  // REITs
  'O': 'Known as "The Monthly Dividend Company," this REIT pays dividends monthly. Invests in commercial real estate under long-term leases.',
  'VNQ': 'Provides broad exposure to U.S. real estate through REITs. Includes residential, commercial, and specialized properties.',
  // Bond ETFs
  'BND': 'Broad exposure to U.S. investment-grade bonds. Lower volatility than stocks, providing portfolio stability.',
  'AGG': 'Tracks the total U.S. bond market. A core holding for conservative investors seeking income and stability.',
  'TLT': 'Focuses on long-term U.S. Treasury bonds. Highly sensitive to interest rate changes.',
  // Blue-chip stocks
  'AAPL': 'World\'s largest company by market cap. Known for iPhone, Mac, and a growing services business.',
  'MSFT': 'Technology giant leading in cloud computing (Azure), productivity software, and AI investments.',
  'GOOGL': 'Parent company of Google, YouTube, and Android. Leader in search, advertising, and cloud services.',
  'AMZN': 'E-commerce and cloud computing leader. AWS is a major profit driver alongside retail operations.',
  'NVDA': 'Leader in graphics processing units (GPUs) and AI chips. Key beneficiary of AI infrastructure buildout.',
  'META': 'Parent of Facebook, Instagram, and WhatsApp. Major player in social media and VR technology.',
  'JNJ': 'Diversified healthcare giant with pharmaceuticals, medical devices, and consumer health products.',
  'JPM': 'Largest U.S. bank by assets. Diversified across investment banking, retail banking, and asset management.',
  'V': 'Global payments technology company. Profits from transaction fees rather than lending.',
  'WMT': 'World\'s largest retailer with extensive physical stores and growing e-commerce presence.',
  'PG': 'Consumer goods giant owning brands like Tide, Pampers, and Gillette. Known for consistent dividends.',
  'KO': 'Iconic beverage company with global brand recognition. Long history of dividend payments.',
  'DIS': 'Entertainment conglomerate including Disney+, theme parks, and Marvel/Star Wars franchises.',
  'TSLA': 'Electric vehicle pioneer also involved in energy storage and solar. Known for high volatility.'
};
const TradeModal = ({
  isOpen,
  onClose,
  portfolio,
  onTradeComplete,
  initialSymbol
}: TradeModalProps) => {
  const [step, setStep] = useState<TradeStep>('search');
  const [tradeType, setTradeType] = useState<TradeType>('buy');
  const [inputMode, setInputMode] = useState<InputMode>('shares');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FinnhubSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Market data state
  const [quote, setQuote] = useState<FinnhubQuote | null>(null);
  const [fundamentals, setFundamentals] = useState<FinnhubFundamentals | null>(null);
  const [profile, setProfile] = useState<FinnhubProfile | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [loadingFundamentals, setLoadingFundamentals] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // Legacy quote for trade calculations (fallback)
  const [selectedQuote, setSelectedQuote] = useState<QuoteData | null>(null);
  const [shares, setShares] = useState('');
  const [dollarAmount, setDollarAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [tradeStatus, setTradeStatus] = useState<TradeStatus>('idle');

  // Quote refresh interval
  const quoteRefreshRef = useRef<NodeJS.Timeout | null>(null);
  const lastFetchedSymbol = useRef<string | null>(null);
  const existingHolding = selectedQuote ? portfolio.holdings.find(h => h.symbol === selectedQuote.symbol) : null;
  const currentPrice = quote?.price ?? selectedQuote?.currentPrice ?? 0;
  const maxBuyShares = currentPrice > 0 ? Math.floor(portfolio.cash / currentPrice) : 0;
  const maxSellShares = existingHolding?.shares || 0;

  // Calculate effective shares based on input mode
  const effectiveShares = currentPrice > 0 ? inputMode === 'dollars' && dollarAmount ? Number(dollarAmount) / currentPrice : Number(shares) || 0 : 0;
  const totalCost = effectiveShares * currentPrice;
  const hasValidInput = inputMode === 'shares' ? shares && Number(shares) > 0 : dollarAmount && Number(dollarAmount) > 0;
  const resetState = useCallback(() => {
    setStep('search');
    setTradeType('buy');
    setInputMode('shares');
    setSearchQuery('');
    setSearchResults([]);
    setQuote(null);
    setFundamentals(null);
    setProfile(null);
    setSelectedQuote(null);
    setShares('');
    setDollarAmount('');
    setError('');
    setIsLoading(false);
    setTradeStatus('idle');
    setLoadingQuote(false);
    setLoadingFundamentals(false);
    setLoadingProfile(false);
    lastFetchedSymbol.current = null;
    if (quoteRefreshRef.current) {
      clearInterval(quoteRefreshRef.current);
      quoteRefreshRef.current = null;
    }
  }, []);

  // Fetch all market data for a symbol
  const fetchMarketData = useCallback(async (symbol: string) => {
    lastFetchedSymbol.current = symbol;

    // Start all fetches in parallel
    setLoadingQuote(true);
    setLoadingFundamentals(true);
    setLoadingProfile(true);
    const [quoteResult, fundamentalsResult, profileResult] = await Promise.all([fetchQuote(symbol), fetchFundamentals(symbol), fetchProfile(symbol)]);
    if (quoteResult.data) {
      setQuote(quoteResult.data);
    } else if (quoteResult.error) {
      console.error('Quote error:', quoteResult.error);
    }
    setLoadingQuote(false);
    if (fundamentalsResult.data) {
      setFundamentals(fundamentalsResult.data);
    }
    setLoadingFundamentals(false);
    if (profileResult.data) {
      setProfile(profileResult.data);
    }
    setLoadingProfile(false);
  }, []);

  // Refresh quote only (every 10 seconds while modal is open)
  const refreshQuote = useCallback(async () => {
    if (!lastFetchedSymbol.current) return;
    const result = await fetchQuote(lastFetchedSymbol.current);
    if (result.data) {
      setQuote(result.data);
    }
  }, []);
  useEffect(() => {
    if (!isOpen) {
      resetState();
    } else if (initialSymbol) {
      handleSelectSymbol(initialSymbol);
    }
  }, [isOpen, initialSymbol, resetState]);

  // Set up quote refresh interval when on details step
  useEffect(() => {
    if (step === 'details' && lastFetchedSymbol.current) {
      quoteRefreshRef.current = setInterval(refreshQuote, 10000);
    }
    return () => {
      if (quoteRefreshRef.current) {
        clearInterval(quoteRefreshRef.current);
        quoteRefreshRef.current = null;
      }
    };
  }, [step, refreshQuote]);

  // Search with debounce - use real Finnhub API only
  useEffect(() => {
    const searchTickers = async () => {
      if (searchQuery.length < 1) {
        setSearchResults([]);
        return;
      }
      setIsSearching(true);
      try {
        const apiResult = await searchSymbolsApi(searchQuery);
        if (apiResult.data && apiResult.data.length > 0) {
          // Ensure assetClass is properly set from API response
          setSearchResults(apiResult.data.map(r => ({
            ...r,
            assetClass: r.assetClass || detectAssetClass(r.type, r.symbol)
          })));
        } else {
          // No results from API - show empty state
          setSearchResults([]);
        }
      } catch {
        // API error - show empty state
        setSearchResults([]);
        console.error('Search API error');
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
      // Start fetching real market data
      await fetchMarketData(symbol);

      // Create a placeholder quote for trade calculations (will be populated by real data)
      const searchResult = searchResults.find(r => r.symbol === symbol);
      setSelectedQuote({
        symbol,
        name: searchResult?.name || symbol,
        currentPrice: 0,
        previousClose: 0,
        dayChange: 0,
        dayChangePercent: 0,
        assetClass: detectAssetClass(searchResult?.type || 'stock', symbol)
      });
      setStep('details');

      // Check if we own this stock
      const owned = portfolio.holdings.find(h => h.symbol === symbol);
      if (owned && owned.shares > 0) {
        setTradeType('buy');
      }
    } catch {
      setError('Unable to fetch quote. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };
  const handleConfirmTrade = async () => {
    if (!hasValidInput || currentPrice <= 0) return;
    setIsLoading(true);
    setError('');
    const shareCount = effectiveShares;
    const price = currentPrice;
    const total = shareCount * price;
    const symbolToUse = quote?.symbol || selectedQuote?.symbol || '';
    const nameToUse = profile?.name || selectedQuote?.name || symbolToUse;

    // Validation
    if (shareCount <= 0) {
      setError('Please enter a valid amount.');
      setIsLoading(false);
      return;
    }
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
    try {
      // Calculate new cash balance
      const newCash = tradeType === 'buy' ? portfolio.cash - total : portfolio.cash + total;

      // 1. Update portfolio cash
      const {
        error: cashError
      } = await supabase.from('portfolios').update({
        cash: newCash
      }).eq('id', portfolio.id);
      if (cashError) throw cashError;

      // 2. Update holdings
      // First, fetch current holding from database
      const {
        data: existingDbHolding
      } = await supabase.from('holdings').select('*').eq('portfolio_id', portfolio.id).eq('symbol', symbolToUse).maybeSingle();
      if (tradeType === 'buy') {
        if (existingDbHolding) {
          // Update existing holding with new average cost
          const totalShares = Number(existingDbHolding.shares) + shareCount;
          const totalCost = Number(existingDbHolding.avg_cost) * Number(existingDbHolding.shares) + price * shareCount;
          const newAvgCost = totalCost / totalShares;
          const {
            error: updateError
          } = await supabase.from('holdings').update({
            shares: totalShares,
            avg_cost: newAvgCost
          }).eq('id', existingDbHolding.id);
          if (updateError) throw updateError;
        } else {
          // Create new holding
          const searchResult = searchResults.find(r => r.symbol === symbolToUse);
          const assetClass = searchResult?.assetClass as AssetClass || detectAssetClass(searchResult?.type || 'stock', symbolToUse);
          const {
            error: insertError
          } = await supabase.from('holdings').insert({
            portfolio_id: portfolio.id,
            symbol: symbolToUse,
            name: nameToUse,
            shares: shareCount,
            avg_cost: price,
            asset_class: assetClass
          });
          if (insertError) throw insertError;
        }
      } else {
        // Sell - reduce or remove holding
        if (existingDbHolding) {
          const remainingShares = Number(existingDbHolding.shares) - shareCount;
          if (remainingShares <= 0.0001) {
            // Remove holding completely
            const {
              error: deleteError
            } = await supabase.from('holdings').delete().eq('id', existingDbHolding.id);
            if (deleteError) throw deleteError;
          } else {
            // Update with remaining shares
            const {
              error: updateError
            } = await supabase.from('holdings').update({
              shares: remainingShares
            }).eq('id', existingDbHolding.id);
            if (updateError) throw updateError;
          }
        }
      }

      // 3. Add transaction record
      // Calculate realized P/L for sell transactions
      let realizedPL: number | null = null;
      if (tradeType === 'sell' && existingDbHolding) {
        const avgCostAtSale = Number(existingDbHolding.avg_cost);
        realizedPL = (price - avgCostAtSale) * shareCount;
      }
      const {
        error: txError
      } = await supabase.from('transactions').insert({
        portfolio_id: portfolio.id,
        symbol: symbolToUse,
        name: nameToUse,
        type: tradeType,
        shares: shareCount,
        price: price,
        total: total,
        realized_pl: realizedPL
      });
      if (txError) throw txError;

      // 4. Add value history entry with invested_value
      // Calculate holdings value (invested assets only, excluding cash)
      const holdingsValue = portfolio.holdings.reduce((sum, h) => {
        if (h.symbol === symbolToUse) {
          // Use updated shares for this holding
          if (tradeType === 'buy') {
            return sum + (h.currentPrice || h.avgCost) * (h.shares + shareCount);
          } else {
            const remaining = h.shares - shareCount;
            return remaining > 0 ? sum + (h.currentPrice || h.avgCost) * remaining : sum;
          }
        }
        return sum + (h.currentPrice || h.avgCost) * h.shares;
      }, 0);

      // If buying a new asset, add its value
      const isNewAsset = !portfolio.holdings.find(h => h.symbol === symbolToUse);
      const newAssetValue = isNewAsset && tradeType === 'buy' ? price * shareCount : 0;
      const investedValue = holdingsValue + newAssetValue;
      const newPortfolioValue = newCash + investedValue;
      const {
        error: valueError
      } = await supabase.from('value_history').insert({
        portfolio_id: portfolio.id,
        value: newPortfolioValue,
        invested_value: investedValue,
        source: 'trade'
      });
      if (valueError) throw valueError;

      // Success! Show animation instead of immediately closing
      setIsLoading(false);
      setTradeStatus('success');
    } catch (error) {
      console.error('Trade error:', error);
      setError('Failed to execute trade. Please try again.');
      setIsLoading(false);
    }
  };
  
  // Handle success animation completion
  const handleSuccessComplete = useCallback(() => {
    setTradeStatus('idle');
    onTradeComplete();
    onClose();
  }, [onTradeComplete, onClose]);
  
  const handleSetMaxShares = () => {
    if (inputMode === 'shares') {
      setShares(String(tradeType === 'buy' ? maxBuyShares : maxSellShares));
    } else {
      const maxDollars = tradeType === 'buy' ? portfolio.cash : maxSellShares * currentPrice;
      setDollarAmount(String(Math.floor(maxDollars * 100) / 100));
    }
  };
  if (!isOpen) return null;
  const displaySymbol = quote?.symbol || selectedQuote?.symbol || '';
  const displayName = profile?.name || selectedQuote?.name || displaySymbol;
  const displayPrice = quote?.price ?? selectedQuote?.currentPrice ?? 0;
  const displayChange = quote?.change ?? selectedQuote?.dayChange ?? 0;
  const displayChangePct = quote?.changePct ?? selectedQuote?.dayChangePercent ?? 0;
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-lg glass-card slide-up overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Success Overlay */}
        {tradeStatus === 'success' && (
          <TradeSuccessOverlay
            tradeType={tradeType}
            symbol={displaySymbol}
            shares={effectiveShares}
            onComplete={handleSuccessComplete}
          />
        )}
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card z-10">
          <h2 className="text-lg font-bold">
            {step === 'search' && 'Search Asset'}
            {step === 'details' && 'Trade'}
            {step === 'confirm' && 'Confirm Order'}
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Search Step */}
          {step === 'search' && <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search by symbol or name..." className="w-full pl-10 pr-4 py-3 rounded-xl bg-secondary border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" autoFocus />
                {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground animate-spin" />}
              </div>

              {/* Search Results */}
              {searchResults.length > 0 && <div className="space-y-1 max-h-[300px] overflow-y-auto">
                  {searchResults.map(result => <button key={result.symbol} onClick={() => handleSelectSymbol(result.symbol)} className="w-full p-3 rounded-lg hover:bg-secondary flex items-center justify-between transition-colors text-left">
                      <div>
                        <p className="font-semibold text-primary">{result.symbol}</p>
                        <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                          {result.name}
                        </p>
                      </div>
                      <span className="px-2 py-1 rounded-md bg-muted text-xs">
                        {result.type}
                      </span>
                    </button>)}
                </div>}

              {/* No Results Message */}
              {searchQuery && !isSearching && searchResults.length === 0 && <p className="text-center text-muted-foreground py-4">
                  No results found for "{searchQuery}"
                </p>}

              {/* Suggested Assets - shown when no search query */}
              {!searchQuery && searchResults.length === 0 && <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground">Suggested Assets</span>
                    <span className="text-xs text-muted-foreground/60">• Quality picks for long-term portfolios</span>
                  </div>
                  
                  {/* Group by category */}
                  <div className="space-y-4 max-h-[350px] overflow-y-auto">
                    {/* Index Funds */}
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">Index Funds</p>
                      {SUGGESTED_ASSETS.filter(a => a.category === 'Index Fund' || a.category === 'Tech Index').map(asset => <button key={asset.symbol} onClick={() => handleSelectSymbol(asset.symbol)} className="w-full p-3 rounded-lg hover:bg-secondary flex items-center justify-between transition-colors text-left border border-transparent hover:border-border">
                          <div>
                            <p className="font-semibold text-primary">{asset.symbol}</p>
                            <p className="text-sm text-muted-foreground truncate max-w-[200px]">{asset.name}</p>
                          </div>
                          <span className="px-2 py-1 rounded-md bg-primary/10 text-primary text-xs">{asset.type}</span>
                        </button>)}
                    </div>

                    {/* Blue-Chip Stocks */}
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">Blue-Chip Stocks</p>
                      {SUGGESTED_ASSETS.filter(a => a.category === 'Tech Blue-Chip' || a.category === 'Healthcare' || a.category === 'Financials').map(asset => <button key={asset.symbol} onClick={() => handleSelectSymbol(asset.symbol)} className="w-full p-3 rounded-lg hover:bg-secondary flex items-center justify-between transition-colors text-left border border-transparent hover:border-border">
                          <div>
                            <p className="font-semibold text-primary">{asset.symbol}</p>
                            <p className="text-sm text-muted-foreground truncate max-w-[200px]">{asset.name}</p>
                          </div>
                          <span className="px-2 py-1 rounded-md bg-muted text-xs">{asset.type}</span>
                        </button>)}
                    </div>

                    {/* Dividend Focused */}
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">Dividend Income</p>
                      {SUGGESTED_ASSETS.filter(a => a.category === 'Dividend' || a.category === 'Monthly Dividend').map(asset => <button key={asset.symbol} onClick={() => handleSelectSymbol(asset.symbol)} className="w-full p-3 rounded-lg hover:bg-secondary flex items-center justify-between transition-colors text-left border border-transparent hover:border-border">
                          <div>
                            <p className="font-semibold text-primary">{asset.symbol}</p>
                            <p className="text-sm text-muted-foreground truncate max-w-[200px]">{asset.name}</p>
                          </div>
                          <span className="px-2 py-1 rounded-md bg-muted text-xs">{asset.type}</span>
                        </button>)}
                    </div>

                    {/* Bonds */}
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">Search Asset</p>
                      {SUGGESTED_ASSETS.filter(a => a.category === 'Bonds').map(asset => <button key={asset.symbol} onClick={() => handleSelectSymbol(asset.symbol)} className="w-full p-3 rounded-lg hover:bg-secondary flex items-center justify-between transition-colors text-left border border-transparent hover:border-border">
                          <div>
                            <p className="font-semibold text-primary">{asset.symbol}</p>
                            <p className="text-sm text-muted-foreground truncate max-w-[200px]">{asset.name}</p>
                          </div>
                          <span className="px-2 py-1 rounded-md bg-muted text-xs">{asset.type}</span>
                        </button>)}
                    </div>
                  </div>
                </div>}
            </div>}

          {/* Details Step */}
          {step === 'details' && <div className="space-y-4">
              {/* Stock Header with Live Price */}
              <div className="p-4 rounded-xl bg-secondary">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {profile?.logoUrl ? <img src={profile.logoUrl} alt={displayName} className="w-12 h-12 rounded-lg object-contain bg-white p-1" onError={e => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }} /> : loadingProfile ? <Skeleton className="w-12 h-12 rounded-lg" /> : <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                        <Building2 className="w-6 h-6 text-muted-foreground" />
                      </div>}
                    <div className="min-w-0">
                      <p className="font-bold text-lg">{displaySymbol}</p>
                      {loadingProfile ? <Skeleton className="h-4 w-32 mt-1" /> : <p className="text-sm text-muted-foreground truncate">{displayName}</p>}
                      {profile?.industry && <div className="flex items-center gap-1 mt-1">
                          <Globe className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">{profile.industry}</span>
                        </div>}
                    </div>
                  </div>
                  <div className="text-right">
                    {loadingQuote ? <>
                        <Skeleton className="h-6 w-20 mb-1" />
                        <Skeleton className="h-4 w-16" />
                      </> : <>
                        <p className="font-bold text-xl">{formatCurrency(displayPrice)}</p>
                        <div className={`flex items-center justify-end gap-1 text-sm ${displayChange >= 0 ? 'text-success' : 'text-destructive'}`}>
                          {displayChange >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                          <span>
                            {displayChange >= 0 ? '+' : ''}{formatCurrency(displayChange)} ({formatPercent(displayChangePct)})
                          </span>
                        </div>
                      </>}
                  </div>
                </div>
                {existingHolding && <p className="text-xs text-primary mt-3 pt-3 border-t border-border/50">
                    You own {existingHolding.shares.toFixed(4)} shares
                  </p>}
              </div>

              {/* About This Asset */}
              <AssetAboutSection symbol={displaySymbol} profile={profile} loading={loadingProfile} />

              {/* Dividend Information - uses curated data for ETFs/REITs/stocks, fundamentals for others */}
              <DividendInfoSection symbol={displaySymbol} dividendYield={fundamentals?.dividendYieldTTM ?? null} dividendsPerShare={fundamentals?.dividendsPerShareTTM ?? null} currentPrice={displayPrice} loading={loadingFundamentals} />

              {/* Key Fundamentals Grid */}
              <div className="p-4 rounded-xl bg-muted/50 border border-border">
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">Key Fundamentals</h3>
                <div className="grid grid-cols-2 gap-3">
                  <FundamentalItem label="Market Cap" value={loadingFundamentals ? null : formatLargeNumber(fundamentals?.marketCap ?? null)} loading={loadingFundamentals} />
                  <FundamentalItem label="P/E (TTM)" value={loadingFundamentals ? null : formatRatio(fundamentals?.peTTM ?? null)} loading={loadingFundamentals} />
                  <FundamentalItem label="EPS (TTM)" value={loadingFundamentals ? null : formatMetricCurrency(fundamentals?.epsTTM ?? null)} loading={loadingFundamentals} />
                  <FundamentalItem label="Dividend Yield" value={loadingFundamentals ? null : formatMetricPercent(fundamentals?.dividendYieldTTM ?? null)} loading={loadingFundamentals} />
                  <FundamentalItem label="52W High" value={loadingFundamentals ? null : formatMetricCurrency(fundamentals?.week52High ?? null)} loading={loadingFundamentals} />
                  <FundamentalItem label="52W Low" value={loadingFundamentals ? null : formatMetricCurrency(fundamentals?.week52Low ?? null)} loading={loadingFundamentals} />
                  <FundamentalItem label="Beta" value={loadingFundamentals ? null : formatRatio(fundamentals?.beta ?? null)} loading={loadingFundamentals} />
                  <FundamentalItem label="Avg Vol (10D)" value={loadingFundamentals ? null : formatVolume(fundamentals?.avgVolume10d ?? null)} loading={loadingFundamentals} />
                </div>
              </div>

              {/* Toggle Controls - Side by Side */}
              <div className="flex gap-2">
                {/* Trade Type Toggle */}
                <div className="flex flex-1 rounded-lg bg-secondary p-0.5">
                  <button onClick={() => setTradeType('buy')} className={`flex-1 py-1.5 px-3 rounded-md text-sm font-medium transition-all ${tradeType === 'buy' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                    Buy
                  </button>
                  <button onClick={() => setTradeType('sell')} disabled={!existingHolding} className={`flex-1 py-1.5 px-3 rounded-md text-sm font-medium transition-all ${tradeType === 'sell' ? 'bg-destructive text-destructive-foreground' : 'text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed'}`}>
                    Sell
                  </button>
                </div>

                {/* Input Mode Toggle */}
                <div className="flex flex-1 rounded-lg bg-muted p-0.5">
                  <button onClick={() => {
                setInputMode('shares');
                setDollarAmount('');
              }} className={`flex-1 py-1.5 px-2 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${inputMode === 'shares' ? 'bg-secondary text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                    <Hash className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Shares</span>
                  </button>
                  <button onClick={() => {
                setInputMode('dollars');
                setShares('');
              }} className={`flex-1 py-1.5 px-2 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${inputMode === 'dollars' ? 'bg-secondary text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                    <DollarSign className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Dollars</span>
                  </button>
                </div>
              </div>

              {/* Input Field */}
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm font-medium">
                    {inputMode === 'shares' ? 'Number of Shares' : 'Dollar Amount'}
                  </label>
                  <button onClick={handleSetMaxShares} className="text-xs text-primary hover:underline">
                    {inputMode === 'shares' ? `Max: ${tradeType === 'buy' ? maxBuyShares : maxSellShares} shares` : `Max: ${formatCurrency(tradeType === 'buy' ? portfolio.cash : maxSellShares * currentPrice)}`}
                  </button>
                </div>
                {inputMode === 'shares' ? <input type="number" min="0.0001" step="any" max={tradeType === 'buy' ? maxBuyShares : maxSellShares} value={shares} onChange={e => setShares(e.target.value)} placeholder="Enter number of shares" className="w-full px-4 py-3 rounded-xl bg-secondary border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" /> : <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <input type="number" min="0.01" step="0.01" max={tradeType === 'buy' ? portfolio.cash : maxSellShares * currentPrice} value={dollarAmount} onChange={e => setDollarAmount(e.target.value)} placeholder="Enter dollar amount" className="w-full pl-8 pr-4 py-3 rounded-xl bg-secondary border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" />
                  </div>}

                {/* Shares preview for dollar input */}
                {inputMode === 'dollars' && dollarAmount && Number(dollarAmount) > 0 && <p className="text-xs text-muted-foreground mt-2">
                    ≈ {effectiveShares.toFixed(4)} shares
                  </p>}
              </div>

              {/* Order Summary */}
              {hasValidInput && <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Order Type</span>
                    <span className={tradeType === 'buy' ? 'text-success' : 'text-destructive'}>
                      Market {tradeType === 'buy' ? 'Buy' : 'Sell'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {effectiveShares.toFixed(4)} shares × {formatCurrency(currentPrice)}
                    </span>
                    <span className="font-bold">{formatCurrency(totalCost)}</span>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t border-border/50">
                    <span className="text-muted-foreground">
                      {tradeType === 'buy' ? 'Cash after trade' : 'Cash after sale'}
                    </span>
                    <span className="font-medium">
                      {formatCurrency(tradeType === 'buy' ? portfolio.cash - totalCost : portfolio.cash + totalCost)}
                    </span>
                  </div>
                </div>}

              {error && <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>}

              {/* Actions */}
              <div className="flex gap-3">
                <button onClick={() => {
              setQuote(null);
              setFundamentals(null);
              setProfile(null);
              setSelectedQuote(null);
              setStep('search');
              setShares('');
              setDollarAmount('');
              setError('');
              lastFetchedSymbol.current = null;
            }} className="flex-1 py-3 rounded-xl border border-border font-medium hover:bg-secondary transition-colors">
                  Back
                </button>
                <button onClick={handleConfirmTrade} disabled={!hasValidInput || isLoading || displayPrice <= 0} className={`flex-1 py-3 rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${tradeType === 'buy' ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'}`}>
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : `${tradeType === 'buy' ? 'Buy' : 'Sell'} ${displaySymbol}`}
                </button>
              </div>
            </div>}

          {isLoading && step === 'search' && <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>}
        </div>
      </div>
    </div>;
};

// Helper component for fundamentals grid items
// Tooltip descriptions for fundamental metrics
const FUNDAMENTAL_TOOLTIPS: Record<string, string> = {
  'Market Cap': 'The total value of all the company\'s shares combined. Bigger companies usually have larger market caps.',
  'P/E (TTM)': 'Shows how expensive a stock is compared to how much money the company is making. A higher number usually means higher expectations.',
  'EPS (TTM)': 'How much profit the company makes per share of stock. It\'s a simple way to see if the company is profitable.',
  'Dividend Yield': 'How much cash the company pays investors each year, shown as a percentage of the stock price.',
  '52W High': 'The highest price the stock reached in the last year.',
  '52W Low': 'The lowest price the stock reached in the last year.',
  'Beta': 'How much the stock tends to move compared to the overall market. Higher means more ups and downs.',
  'Avg Vol (10D)': 'The average number of shares traded per day over the last 10 days. It shows how actively the stock is traded.'
};
function FundamentalItem({
  label,
  value,
  loading
}: {
  label: string;
  value: string | null;
  loading: boolean;
}) {
  const tooltip = FUNDAMENTAL_TOOLTIPS[label];
  return <div className="space-y-1">
      <div className="flex items-center gap-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        {tooltip && <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground/60 hover:text-muted-foreground transition-colors">
                  <HelpCircle className="w-3 h-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[220px] text-xs">
                <p>{tooltip}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>}
      </div>
      {loading ? <Skeleton className="h-5 w-16" /> : <p className="text-sm font-medium">{value ?? 'N/A'}</p>}
    </div>;
}

// About section for asset descriptions
function AssetAboutSection({
  symbol,
  profile,
  loading
}: {
  symbol: string;
  profile: FinnhubProfile | null;
  loading: boolean;
}) {
  const curatedDescription = ASSET_DESCRIPTIONS[symbol.toUpperCase()];

  // Build a fallback description from profile data
  const fallbackDescription = profile?.industry ? `A ${profile.industry.toLowerCase()} company${profile.country ? ` based in ${profile.country}` : ''}.` : null;
  const description = curatedDescription || fallbackDescription;
  if (loading) {
    return <div className="p-4 rounded-xl bg-muted/50 border border-border">
        <div className="flex items-center gap-2 mb-2">
          <Info className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-muted-foreground">About This Asset</h3>
        </div>
        <Skeleton className="h-4 w-full mb-1" />
        <Skeleton className="h-4 w-3/4" />
      </div>;
  }
  if (!description) return null;
  return <div className="p-4 rounded-xl bg-muted/50 border border-border">
      <div className="flex items-center gap-2 mb-2">
        <Info className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-muted-foreground">About This Asset</h3>
      </div>
      <p className="text-sm text-foreground leading-relaxed">{description}</p>
      {profile?.exchange && <p className="text-xs text-muted-foreground mt-2">
          Listed on {profile.exchange}{profile.country ? ` • ${profile.country}` : ''}
        </p>}
    </div>;
}

// Dividend information section - uses curated data first, then API data, with smart defaults
function DividendInfoSection({
  symbol,
  dividendYield,
  dividendsPerShare,
  currentPrice,
  loading
}: {
  symbol: string;
  dividendYield: number | null;
  dividendsPerShare: number | null;
  currentPrice: number;
  loading: boolean;
}) {
  const upperSymbol = symbol.toUpperCase();

  // Check all curated data sources (ETFs, REITs, and individual stocks)
  const curatedEtfData = KNOWN_ETF_DIVIDENDS[upperSymbol];
  const curatedReitData = KNOWN_REIT_DIVIDENDS[upperSymbol];
  const curatedStockData = KNOWN_STOCK_DIVIDENDS[upperSymbol];
  const curatedData = curatedEtfData || curatedReitData || curatedStockData;
  if (loading) {
    return <div className="p-4 rounded-xl bg-success/5 border border-success/20">
        <div className="flex items-center gap-2 mb-2">
          <Banknote className="w-4 h-4 text-success" />
          <h3 className="text-sm font-semibold text-success">Dividend Information</h3>
        </div>
        <Skeleton className="h-4 w-32 mb-2" />
        <Skeleton className="h-4 w-48" />
      </div>;
  }

  // Use curated data if available, otherwise fall back to fundamentals API data
  const effectiveYield = curatedData?.yield ?? dividendYield;
  const paysDividends = effectiveYield !== null && effectiveYield > 0;

  // Check if it's a known non-dividend payer
  const isKnownNoDividend = curatedData?.frequency === 'none';
  if (!paysDividends || isKnownNoDividend) {
    return <div className="p-4 rounded-xl bg-muted/30 border border-border">
        <div className="flex items-center gap-2 mb-2">
          <Banknote className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-muted-foreground">Dividend Information</h3>
        </div>
        <p className="text-sm text-muted-foreground">This asset does not currently pay dividends.</p>
        <p className="text-xs text-muted-foreground/70 mt-2 flex items-start gap-1">
          <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
          <span>Some companies reinvest profits into growth instead of paying dividends to shareholders.</span>
        </p>
      </div>;
  }

  // Calculate estimated annual dividend - use curated, then API dividendsPerShare, then calculate from yield
  const estimatedAnnualDividend = curatedData?.annualAmount ?? dividendsPerShare ?? (currentPrice > 0 && effectiveYield ? effectiveYield / 100 * currentPrice : null);

  // Frequency info - use curated if available, otherwise default to quarterly (most common in US markets)
  const isFromCurated = !!curatedData;
  const frequency = curatedData?.frequency ?? 'quarterly';
  const frequencyIsEstimated = !isFromCurated && paysDividends;
  const frequencyLabel = frequency === 'monthly' ? 'Monthly' : frequency === 'quarterly' ? 'Quarterly' : frequency === 'semi-annually' ? 'Semi-Annually' : frequency === 'annually' ? 'Annually' : 'Quarterly';
  const frequencyExplanation = frequency === 'monthly' ? '12 payments per year' : frequency === 'quarterly' ? '4 payments per year' : frequency === 'semi-annually' ? '2 payments per year' : frequency === 'annually' ? '1 payment per year' : '4 payments per year';
  return <div className="p-4 rounded-xl bg-success/5 border border-success/20">
      <div className="flex items-center gap-2 mb-3">
        <Banknote className="w-4 h-4 text-success" />
        <h3 className="text-sm font-semibold text-success">Dividend Information</h3>
      </div>
      
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Payment Frequency</span>
          <span className="text-sm font-medium text-foreground">
            {frequencyLabel}
            {frequencyIsEstimated && '*'}
            <span className="text-xs text-muted-foreground ml-1">({frequencyExplanation})</span>
          </span>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Current Yield</span>
          <span className="text-sm font-medium text-success">
            {isFromCurated ? '~' : ''}{effectiveYield!.toFixed(2)}%
          </span>
        </div>
        
        {estimatedAnnualDividend && estimatedAnnualDividend > 0 && <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Est. Annual Dividend</span>
            <span className="text-sm font-medium text-foreground">
              ~${estimatedAnnualDividend.toFixed(2)}/share
            </span>
          </div>}
      </div>

      <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-success/10 flex items-start gap-1">
        <Info className="w-3 h-3 mt-0.5 flex-shrink-0 text-success/70" />
        <span>
          {frequencyIsEstimated ? '*Most US stocks pay quarterly. This asset pays dividends to shareholders—check company investor relations for exact payment dates.' : frequency === 'monthly' ? 'This asset pays dividends monthly. You\'ll receive cash payments 12 times per year if you own shares.' : frequency === 'quarterly' ? 'This asset pays dividends quarterly. You\'ll receive cash payments 4 times per year if you own shares.' : frequency === 'semi-annually' ? 'This asset pays dividends twice a year. You\'ll receive cash payments 2 times per year if you own shares.' : 'This asset pays dividends to shareholders. Dividends are cash payments that companies distribute from their profits.'}
        </span>
      </p>
    </div>;
}
export default TradeModal;