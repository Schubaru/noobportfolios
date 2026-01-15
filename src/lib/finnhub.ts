// Types for Finnhub API responses
export interface FinnhubQuote {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  dayHigh: number;
  dayLow: number;
  dayOpen: number;
  prevClose: number;
  timestamp: number;
}

export interface FinnhubFundamentals {
  symbol: string;
  marketCap: number | null;
  peTTM: number | null;
  epsTTM: number | null;
  dividendYieldTTM: number | null;
  week52High: number | null;
  week52Low: number | null;
  beta: number | null;
  avgVolume10d: number | null;
}

export interface FinnhubProfile {
  symbol: string;
  name: string | null;
  exchange: string | null;
  currency: string | null;
  industry: string | null;
  logoUrl: string | null;
  country: string | null;
}

export interface FinnhubSearchResult {
  symbol: string;
  name: string;
  type: string;
}

// API response wrapper
interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

// Fetch quote from our edge function
export async function fetchQuote(symbol: string): Promise<ApiResponse<FinnhubQuote>> {
  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/market-quote?symbol=${encodeURIComponent(symbol)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      }
    );

    const result = await response.json();

    if (!response.ok) {
      return { data: null, error: result.error || 'Failed to fetch quote' };
    }

    return { data: result, error: null };
  } catch (err) {
    console.error('Error fetching quote:', err);
    return { data: null, error: 'Network error' };
  }
}

// Fetch fundamentals from our edge function
export async function fetchFundamentals(symbol: string): Promise<ApiResponse<FinnhubFundamentals>> {
  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/market-fundamentals?symbol=${encodeURIComponent(symbol)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      }
    );

    const result = await response.json();

    if (!response.ok) {
      return { data: null, error: result.error || 'Failed to fetch fundamentals' };
    }

    return { data: result, error: null };
  } catch (err) {
    console.error('Error fetching fundamentals:', err);
    return { data: null, error: 'Network error' };
  }
}

// Fetch profile from our edge function
export async function fetchProfile(symbol: string): Promise<ApiResponse<FinnhubProfile>> {
  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/market-profile?symbol=${encodeURIComponent(symbol)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      }
    );

    const result = await response.json();

    if (!response.ok) {
      return { data: null, error: result.error || 'Failed to fetch profile' };
    }

    return { data: result, error: null };
  } catch (err) {
    console.error('Error fetching profile:', err);
    return { data: null, error: 'Network error' };
  }
}

// Search symbols from our edge function
export async function searchSymbolsApi(query: string): Promise<ApiResponse<FinnhubSearchResult[]>> {
  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/market-search?q=${encodeURIComponent(query)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      }
    );

    const result = await response.json();

    if (!response.ok) {
      return { data: null, error: result.error || 'Failed to search symbols' };
    }

    return { data: result.results || [], error: null };
  } catch (err) {
    console.error('Error searching symbols:', err);
    return { data: null, error: 'Network error' };
  }
}

// Utility to format large numbers
export function formatLargeNumber(num: number | null): string {
  if (num === null || num === undefined) return 'N/A';
  
  if (num >= 1e12) {
    return `$${(num / 1e12).toFixed(2)}T`;
  } else if (num >= 1e9) {
    return `$${(num / 1e9).toFixed(2)}B`;
  } else if (num >= 1e6) {
    return `$${(num / 1e6).toFixed(2)}M`;
  } else {
    return `$${num.toLocaleString()}`;
  }
}

// Utility to format volume
export function formatVolume(num: number | null): string {
  if (num === null || num === undefined) return 'N/A';
  
  // Finnhub returns 10D avg volume in millions
  if (num >= 1000) {
    return `${(num / 1000).toFixed(2)}B`;
  } else if (num >= 1) {
    return `${num.toFixed(2)}M`;
  } else {
    return `${(num * 1000).toFixed(0)}K`;
  }
}

// Utility to format percentage
export function formatMetricPercent(num: number | null): string {
  if (num === null || num === undefined) return 'N/A';
  return `${num.toFixed(2)}%`;
}

// Utility to format ratio
export function formatRatio(num: number | null): string {
  if (num === null || num === undefined) return 'N/A';
  return num.toFixed(2);
}

// Utility to format currency
export function formatMetricCurrency(num: number | null): string {
  if (num === null || num === undefined) return 'N/A';
  return `$${num.toFixed(2)}`;
}
