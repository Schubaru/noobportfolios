

# Fix Total Return Logic Bug

## Problem Analysis

The portfolio is showing **+$903.12 Total Return** when the holdings P/L shows **~0%**. This inconsistency stems from a flawed calculation formula in `src/lib/portfolio.ts`.

### Root Cause

The current formula:
```
allTimePL = totalValue - startingCash
         = (cash + holdingsValue) - startingCash
```

When `currentPrice` falls back to `avgCost`:
- Holdings value = (3 × $301.04) + (4 × $637.09) = $3,451.48
- Total value = $7,451.64 + $3,451.48 = $10,903.12
- All-time P/L = $10,903.12 - $10,000 = **+$903.12** (WRONG!)

The formula incorrectly treats the cost basis of holdings as profit. When prices equal the purchase price, the correct P/L should be **$0**.

### Correct Formula

```
Total Return = Realized P/L + Unrealized P/L + Dividends - Fees

Where:
  Unrealized P/L = Σ((currentPrice - avgCost) × shares)
  Realized P/L   = Σ(sell transactions' (sellPrice - avgCostAtSale) × shares)
```

---

## Implementation Plan

### Phase 1: Database Schema Enhancement

Add `realized_pl` column to transactions table to track profit/loss on each sell.

**Migration SQL:**
```sql
ALTER TABLE transactions 
ADD COLUMN realized_pl numeric DEFAULT NULL;

COMMENT ON COLUMN transactions.realized_pl IS 
'Profit/loss realized on SELL transactions: (sell_price - avg_cost_at_time) * shares';
```

### Phase 2: Create Income Table (Future-Proofing)

Add income table for dividends, interest, and fees.

**Migration SQL:**
```sql
CREATE TABLE income (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  symbol text,
  type text NOT NULL CHECK (type IN ('DIVIDEND', 'INTEREST', 'FEE')),
  amount numeric NOT NULL,
  posted_at timestamp with time zone DEFAULT now(),
  description text
);

ALTER TABLE income ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view income of their portfolios" ON income
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM portfolios WHERE portfolios.id = income.portfolio_id AND portfolios.user_id = auth.uid())
  );

CREATE POLICY "Users can insert income for their portfolios" ON income
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM portfolios WHERE portfolios.id = income.portfolio_id AND portfolios.user_id = auth.uid())
  );
```

---

### Phase 3: Fix Portfolio Metrics Calculation

**File: `src/lib/portfolio.ts`**

Replace the flawed `allTimePL` calculation with proper unrealized + realized P/L logic:

```typescript
export const calculateUnrealizedPL = (holdings: Holding[]): number => {
  return holdings.reduce((sum, h) => {
    const currentPrice = h.currentPrice ?? h.avgCost;
    const unrealized = (currentPrice - h.avgCost) * h.shares;
    return sum + unrealized;
  }, 0);
};

export const calculateRealizedPL = (transactions: Transaction[]): number => {
  return transactions
    .filter(t => t.type === 'sell' && t.realizedPL !== undefined)
    .reduce((sum, t) => sum + (t.realizedPL || 0), 0);
};

export const calculatePortfolioMetrics = (portfolio: Portfolio): PortfolioMetrics => {
  const totalValue = calculatePortfolioValue(portfolio);
  const dailyPL = calculateDailyPL(portfolio.holdings);
  
  const previousValue = totalValue - dailyPL;
  const dailyPLPercent = previousValue > 0 ? (dailyPL / previousValue) * 100 : 0;
  
  // FIXED: Calculate unrealized P/L correctly
  const unrealizedPL = calculateUnrealizedPL(portfolio.holdings);
  
  // Calculate realized P/L from sell transactions
  const realizedPL = calculateRealizedPL(portfolio.transactions);
  
  // Dividend income
  const totalDividends = portfolio.totalDividendsEarned || 
    (portfolio.dividendHistory || []).reduce((sum, d) => sum + d.totalAmount, 0);
  
  // Fees (from income table, default 0)
  const totalFees = 0; // Will integrate with income table later
  
  // CORRECT FORMULA: Total Return = Realized + Unrealized + Dividends - Fees
  const allTimePL = realizedPL + unrealizedPL;
  const allTimePLPercent = portfolio.startingCash > 0 
    ? (allTimePL / portfolio.startingCash) * 100 
    : 0;
  
  const totalReturnWithDividends = allTimePL + totalDividends - totalFees;
  const totalReturnWithDividendsPercent = portfolio.startingCash > 0
    ? (totalReturnWithDividends / portfolio.startingCash) * 100
    : 0;
  
  return {
    totalValue,
    dailyPL,
    dailyPLPercent,
    allTimePL,
    allTimePLPercent,
    cumulativeReturn: allTimePLPercent,
    totalDividends,
    totalReturnWithDividends,
    totalReturnWithDividendsPercent,
  };
};
```

---

### Phase 4: Update Trade Execution for Realized P/L

**File: `src/components/TradeModal.tsx`**

When selling, calculate and store `realized_pl`:

```typescript
// On SELL: Calculate realized P/L
if (tradeType === 'sell' && existingDbHolding) {
  const avgCostAtSale = Number(existingDbHolding.avg_cost);
  const realizedPL = (price - avgCostAtSale) * shareCount;
  
  // Store transaction with realized P/L
  await supabase.from('transactions').insert({
    portfolio_id: portfolio.id,
    symbol: symbolToUse,
    name: nameToUse,
    type: 'sell',
    shares: shareCount,
    price: price,
    total: total,
    realized_pl: realizedPL,  // NEW FIELD
  });
}
```

---

### Phase 5: Update Type Definitions

**File: `src/lib/types.ts`**

Add `realizedPL` to Transaction interface:

```typescript
export interface Transaction {
  id: string;
  symbol: string;
  name: string;
  type: 'buy' | 'sell';
  shares: number;
  price: number;
  total: number;
  timestamp: number;
  realizedPL?: number;  // NEW: Only populated for sell transactions
}
```

**File: `src/hooks/usePortfolios.ts`**

Update DbTransaction and transformer to include `realized_pl`:

```typescript
export interface DbTransaction {
  // ... existing fields
  realized_pl: number | null;  // NEW
}

// In transformPortfolio:
transactions: transactions.map((t): Transaction => ({
  // ... existing fields
  realizedPL: t.realized_pl ? Number(t.realized_pl) : undefined,
})),
```

---

## Acceptance Test Cases

| Scenario | Expected Result |
|----------|-----------------|
| Buy asset, price unchanged | Holdings P/L = 0%, Total Return = $0 |
| One holding +$50, another -$20 | Total Return = +$30 |
| Sell with profit, no holdings left | Total Return shows realized profit |
| Buy, price drops 10% | Total Return = negative (unrealized loss) |
| Dividends received | Total Return includes dividend income |

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/lib/types.ts` | Add `realizedPL` to Transaction interface |
| `src/lib/portfolio.ts` | Fix calculation logic with proper unrealized/realized P/L |
| `src/hooks/usePortfolios.ts` | Add `realized_pl` to DbTransaction and transformer |
| `src/components/TradeModal.tsx` | Calculate and store `realized_pl` on sell transactions |

## Database Migrations

1. Add `realized_pl` column to `transactions` table
2. Create `income` table for future dividend/fee tracking

---

## Summary

This fix corrects the Total Return calculation by:

1. Replacing the flawed `totalValue - startingCash` formula with proper `realizedPL + unrealizedPL + dividends - fees`
2. Adding `realized_pl` tracking to sell transactions
3. Ensuring UI consistency between Holdings table P/L and Total Return metrics
4. Future-proofing with an `income` table for dividends and fees

