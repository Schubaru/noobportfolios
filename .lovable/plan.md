

# Fix Inflated Equity: Backfill cash_history + Initialize-portfolio + Harden getCashAt

## Problem

Portfolio `577d4df6` has 17 transactions but only 1 `cash_history` row showing $10,000 (with `effective_to = NULL`). The actual current cash is $1,502.50. Because `getCashAt(t)` always returns $10,000, equity = $10,000 + holdingsValue -- roughly double the true value.

5 portfolios need backfill (those with exactly 1 cash_history row). Portfolio `93f96f08` already has 6 rows and will be skipped. Only `buy` and `sell` transaction types exist (confirmed).

## Changes

### 1. SQL Migration -- Backfill cash_history

A PL/pgSQL block that:
- Only processes portfolios where `cash_history` has exactly 1 row (idempotent)
- Iterates buy/sell transactions chronologically per portfolio
- For each transaction: finds the latest open row by `id` (ORDER BY effective_from DESC LIMIT 1), closes it, then inserts a new row with updated cash amount
- Expected result for `577d4df6`: 18 cash_history rows (1 seed + 17 transactions), final open row amount = ~$1,502.50

### 2. Update `supabase/functions/initialize-portfolio/index.ts`

After batch buys and `portfolios.cash` update:
- Find and close the latest open `cash_history` row by `id`
- Insert new `cash_history` row with `remainingCash`
- Insert `holdings_history` rows for each initial holding

### 3. Harden `getCashAt` in `supabase/functions/portfolio-performance/index.ts`

Replace the simple loop with a two-pass approach:
- First: exact range match (`from <= t && t < to`) returns immediately
- Second (fallback): use the most recent row that started at-or-before `t`, instead of defaulting to `starting_cash`

## Validation After Deploy

- `cash_history` open row for `577d4df6` should show ~$1,502.50 matching `portfolios.cash`
- `cash_history` row count for `577d4df6` should be 18 (1 seed + 17 transactions)
- Chart equity should no longer show ~$18k hovers; should be ~$10k +/- market movement
- BUY events should appear flat on the chart

## Files Changed

| File | Change |
|------|--------|
| SQL migration (run via migration tool) | Backfill cash_history for portfolios with count=1 |
| `supabase/functions/initialize-portfolio/index.ts` | Write cash_history + holdings_history after batch buys |
| `supabase/functions/portfolio-performance/index.ts` | Harden getCashAt with nearest-prior-row fallback |

