import { Portfolio, DividendPaymentRecord, DividendInfo } from './types';

// Fetch dividend info from our edge function
export async function fetchDividendInfo(symbol: string): Promise<DividendInfo | null> {
  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/market-dividends?symbol=${encodeURIComponent(symbol)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      }
    );

    if (!response.ok) {
      console.error(`Failed to fetch dividends for ${symbol}`);
      return null;
    }

    return await response.json();
  } catch (err) {
    console.error('Error fetching dividends:', err);
    return null;
  }
}

// Check if a dividend should be paid based on portfolio holding
export function checkDividendPayments(
  portfolio: Portfolio,
  dividendInfoMap: Map<string, DividendInfo>
): DividendPaymentRecord[] {
  const newPayments: DividendPaymentRecord[] = [];
  const now = new Date();
  const existingPaymentIds = new Set(
    portfolio.dividendHistory?.map(p => `${p.symbol}-${p.payDate}`) || []
  );

  for (const holding of portfolio.holdings) {
    const dividendInfo = dividendInfoMap.get(holding.symbol);
    if (!dividendInfo || !dividendInfo.dividends) continue;

    // Find the transaction that established this holding to determine eligibility dates
    const holdingTransactions = portfolio.transactions
      .filter(t => t.symbol === holding.symbol && t.type === 'buy')
      .sort((a, b) => a.timestamp - b.timestamp);

    if (holdingTransactions.length === 0) continue;

    // Check each dividend payment
    for (const dividend of dividendInfo.dividends) {
      const payDate = new Date(dividend.payDate);
      const exDate = new Date(dividend.exDate || dividend.payDate);
      const paymentId = `${holding.symbol}-${dividend.payDate}`;

      // Skip if already paid
      if (existingPaymentIds.has(paymentId)) continue;

      // Skip if pay date hasn't occurred yet
      if (payDate > now) continue;

      // Check if user owned shares before ex-date
      let sharesOnExDate = 0;
      for (const tx of portfolio.transactions.filter(t => t.symbol === holding.symbol)) {
        if (new Date(tx.timestamp) <= exDate) {
          sharesOnExDate += tx.type === 'buy' ? tx.shares : -tx.shares;
        }
      }

      if (sharesOnExDate <= 0) continue;

      // Calculate dividend payment
      const dividendAmount = dividend.amount * sharesOnExDate;

      newPayments.push({
        id: paymentId,
        symbol: holding.symbol,
        name: holding.name,
        shares: sharesOnExDate,
        dividendPerShare: dividend.amount,
        totalAmount: dividendAmount,
        exDate: dividend.exDate,
        payDate: dividend.payDate,
        paidAt: Date.now(),
      });
    }
  }

  return newPayments;
}

// Calculate total dividend income for a portfolio
export function calculateTotalDividendIncome(portfolio: Portfolio): number {
  return (portfolio.dividendHistory || []).reduce((sum, p) => sum + p.totalAmount, 0);
}

// Calculate dividend income by symbol
export function calculateDividendsBySymbol(portfolio: Portfolio): Map<string, number> {
  const bySymbol = new Map<string, number>();
  
  for (const payment of portfolio.dividendHistory || []) {
    const current = bySymbol.get(payment.symbol) || 0;
    bySymbol.set(payment.symbol, current + payment.totalAmount);
  }
  
  return bySymbol;
}

// Get recent dividend payments (last N days)
export function getRecentDividends(
  portfolio: Portfolio, 
  days: number = 90
): DividendPaymentRecord[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  
  return (portfolio.dividendHistory || [])
    .filter(p => p.paidAt >= cutoff)
    .sort((a, b) => b.paidAt - a.paidAt);
}

// Format dividend frequency
export function formatDividendFrequency(frequency: string | null): string {
  if (!frequency) return 'Unknown';
  
  const map: Record<string, string> = {
    'monthly': 'Monthly',
    'quarterly': 'Quarterly',
    'semi-annual': 'Semi-Annual',
    'annual': 'Annual',
  };
  
  return map[frequency] || frequency;
}

// Estimate next dividend date based on frequency
export function estimateNextDividend(
  lastPayDate: string | null,
  frequency: string | null
): Date | null {
  if (!lastPayDate || !frequency) return null;
  
  const last = new Date(lastPayDate);
  const next = new Date(last);
  
  switch (frequency) {
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'quarterly':
      next.setMonth(next.getMonth() + 3);
      break;
    case 'semi-annual':
      next.setMonth(next.getMonth() + 6);
      break;
    case 'annual':
      next.setFullYear(next.getFullYear() + 1);
      break;
    default:
      return null;
  }
  
  return next;
}