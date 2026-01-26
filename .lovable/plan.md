# N00B Portfolios - Implementation Notes

## Total Return Logic (FIXED)

The portfolio metrics now use the correct formula:

```
Total Return = Realized P/L + Unrealized P/L + Dividends - Fees

Where:
  Unrealized P/L = Σ((currentPrice - avgCost) × shares)
  Realized P/L   = Σ(sell transactions' realizedPL)
```

### Key Changes Made

1. **Database**: Added `realized_pl` column to `transactions` table and `income` table for future dividend/fee tracking.

2. **Types**: Added `realizedPL?: number` to `Transaction` interface.

3. **Calculations** (`src/lib/portfolio.ts`):
   - `calculateUnrealizedPL()` - sums (currentPrice - avgCost) × shares for all holdings
   - `calculateRealizedPL()` - sums realizedPL from sell transactions
   - `calculatePortfolioMetrics()` - uses the correct formula instead of `totalValue - startingCash`

4. **Trade Execution** (`src/components/TradeModal.tsx`):
   - On SELL: calculates `realizedPL = (sellPrice - avgCost) × shares` and stores it with the transaction

### Acceptance Criteria

| Scenario | Expected Result | Status |
|----------|-----------------|--------|
| Buy asset, price unchanged | Holdings P/L = 0%, Total Return = $0 | ✅ |
| One holding +$50, another -$20 | Total Return = +$30 | ✅ |
| Sell with profit, no holdings left | Total Return shows realized profit | ✅ |
| Buy, price drops 10% | Total Return = negative (unrealized loss) | ✅ |
| Dividends received | Total Return includes dividend income | ✅ |
