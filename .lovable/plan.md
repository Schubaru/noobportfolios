

# Deterministic Market-Aligned Valuation Engine

## Overview

Replace the current snapshot-driven chart system with a deterministic engine that computes portfolio value at fixed time buckets by reconstructing historical holdings and looking up market prices. Charts will no longer depend on user visits, trade events, or snapshot frequency.

## What Changes

### Database: 3 new tables, 1 deprecation

1. **`holdings_history`** -- tracks every change to every holding over time
   - `id`, `portfolio_id`, `symbol`, `shares`, `avg_cost`, `effective_from` (timestamptz), `effective_to` (nullable timestamptz)
   - RLS: same pattern as `holdings` (join to `portfolios.user_id = auth.uid()`)

2. **`cash_history`** -- tracks every change to cash balance over time
   - `id`, `portfolio_id`, `amount` (numeric), `effective_from` (timestamptz), `effective_to` (nullable timestamptz)
   - RLS: same pattern

3. **`symbol_daily_prices`** -- persistent daily close cache
   - `symbol` (text), `date` (date), `close_price` (numeric), `fetched_at` (timestamptz)
   - Primary key: `(symbol, date)`
   - No RLS needed (public read, service-role write)

4. **`value_history`** -- kept for now but no longer used as chart source. Will serve as migration fallback only.

### Edge Function: Rewrite `portfolio-performance`

The function will be completely rewritten:

**Input:** `portfolio_id`, `range` (1D/1W/1M/ALL)

**Logic:**
1. Generate deterministic time buckets based on range:
   - 1D: every 5 min from market open to now
   - 1W: every 30 min
   - 1M: every 4 hours
   - ALL: 1 bucket per day (midnight UTC)

2. For each bucket time T:
   - Query `holdings_history` for rows where `effective_from <= T AND (effective_to IS NULL OR effective_to > T)`
   - Query `cash_history` for the row active at T
   - Get price: if T's date is before today, use `symbol_daily_prices`; if today, use current Finnhub quote (cached 60s)
   - Compute `holdings_value = SUM(shares * price)`, `total_value = holdings_value + cash`

3. Return array of `{t, v, hv}` points

**Caching strategy (response-level, in-memory):**
- 1D: 60s TTL
- 1W: 5 min
- 1M: 15 min
- ALL: 1 hour

### New Edge Function: `backfill-daily-prices`

A lightweight function that:
- For each unique symbol in `holdings_history`, ensures `symbol_daily_prices` has an entry for each trading day
- Fetches missing daily closes from Finnhub (using `/stock/candle` daily resolution or falling back to quote `pc`)
- Called lazily by `portfolio-performance` when a needed date is missing, or periodically via cron

### Trade Flow Changes (TradeModal.tsx)

On trade execution, in addition to existing DB writes:
1. **Close prior `holdings_history` row** (set `effective_to = now`) for that symbol
2. **Insert new `holdings_history` row** with updated shares/avg_cost and `effective_from = now`
3. **Close prior `cash_history` row** and insert new one with updated cash amount
4. No snapshot writing -- just invalidate/refetch the performance endpoint

### Frontend Changes (PortfolioGrowthChart.tsx)

Minimal changes:
- Remove `source` field handling (no more trade dots)
- The response format stays similar (`points`, `range`, `available`)
- Remove `snapshotKey` dependency -- replace with a simple refetch trigger after trade

### PortfolioDetail.tsx

- Remove `callSnapshotPortfolio` usage entirely
- Remove auto-snapshot timer (60s interval)
- Remove `stale`/`lastUpdated` state
- On trade complete: just refetch portfolios + refetch performance (no snapshot call)

### Data Migration

On first deploy, a one-time migration will:
1. Populate `holdings_history` from current `holdings` table (all current holdings get `effective_from = created_at`, `effective_to = NULL`)
2. Populate `cash_history` from current `portfolios.cash` (single row per portfolio, `effective_from = portfolio.created_at`)
3. Backfill `holdings_history` from `transactions` table to reconstruct historical states

## Sequence of Implementation

1. Create database tables (`holdings_history`, `cash_history`, `symbol_daily_prices`) with RLS
2. Write migration to backfill historical data from `transactions`
3. Create `backfill-daily-prices` edge function
4. Rewrite `portfolio-performance` edge function with deterministic bucket engine
5. Update `TradeModal.tsx` to write `holdings_history` and `cash_history` on trade
6. Update `PortfolioDetail.tsx` to remove snapshot logic
7. Simplify `PortfolioGrowthChart.tsx` (remove trade dots, snapshot dependency)

## Technical Details

### Bucket Generation (pseudocode)

```text
function generateBuckets(range, portfolioCreatedAt):
  now = Date.now()
  switch range:
    1D:  start = todayMarketOpen(9:30 ET), step = 5min
    1W:  start = now - 7d,                 step = 30min
    1M:  start = now - 30d,                step = 4h
    ALL: start = portfolioCreatedAt,       step = 1day

  buckets = []
  t = floor(start / step) * step
  while t <= now:
    buckets.push(t)
    t += step
  return buckets
```

### Holdings Reconstruction Query

```text
SELECT symbol, shares, avg_cost
FROM holdings_history
WHERE portfolio_id = $1
  AND effective_from <= $bucket_time
  AND (effective_to IS NULL OR effective_to > $bucket_time)
```

### Finnhub Rate Limit Safety

- Daily prices: fetched once per symbol per day, stored permanently
- Intraday quotes: cached 60s in-memory, max ~10 unique symbols per portfolio
- Response caching prevents repeated computation
- Estimated API calls per user visit: 1 batch of quotes (current holdings only)

### What Gets Removed

- `snapshot-portfolio` edge function calls from frontend
- Auto-snapshot 60s timer in `PortfolioDetail`
- `callSnapshotPortfolio` from `lib/snapshots.ts`
- Trade dots (`ReferenceDot`) from chart
- `value_history` as chart data source

### What Stays Unchanged

- UI layout (no visual changes)
- `snapshot-portfolio` edge function file (kept for backward compatibility, can be removed later)
- `value_history` table (kept, just unused for charts)
- All metric calculations in `PerformanceSummary`
- `HoldingsTable`, `AllocationChart`, `TradeModal` UI

