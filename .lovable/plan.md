

# Make the Portfolio Chart Feel Alive

## Current State Assessment

Most of the requested functionality already exists:
- Live point injection for 1D: implemented (backend lines 332-370)
- Scheduled cron snapshots: two jobs running (hourly during market hours + daily close)
- Trade-triggered snapshots with trade_id dedup: implemented in `snapshot-portfolio`
- Coverage gating (skip if < 98%): implemented in both snapshot functions
- No avg_cost fallback in snapshot writes: implemented
- Cost basis tracking and UPL delta math: implemented in previous change

## Gaps to Close

### 1. Frontend: 1D refresh is too slow (60s)

Currently `REFRESH_MS = 60_000` for all ranges. For 1D to feel alive during market hours, refresh should be 15-20 seconds. Longer ranges don't need frequent updates.

**File: `src/components/PortfolioGrowthChart.tsx`**
- Replace fixed `REFRESH_MS = 60_000` with a function that returns range-dependent intervals:
  - 1D: 15 seconds
  - 1W: 2 minutes
  - 1M: 5 minutes
  - ALL: 10 minutes
- Update the auto-refresh `useEffect` to use the range-specific interval

### 2. Backend: Reduce 1D response cache TTL

Currently 15 seconds. Reduce to 10 seconds so the faster frontend refresh actually gets fresh data.

**File: `supabase/functions/portfolio-performance/index.ts`**
- Change `case '1D': return 15_000;` to `return 10_000;`

### 3. Backend: Remove avg_cost price fallback for historical points

Line 308 falls back to `avg_cost` when no market price is found. This can create misleading chart shapes if avg_cost differs from actual market price. Instead, carry forward the last known market price for that symbol within the same date range.

**File: `supabase/functions/portfolio-performance/index.ts`**
- In the bucket loop, if no daily price and no current quote is found for a symbol, use the most recent price from `symbol_daily_prices` for that symbol (any earlier date), or from `currentQuotes` if available. Only if absolutely no price exists anywhere, skip that holding's contribution (treat as 0) rather than using avg_cost.
- This prevents artificial flatness or spikes from cost-basis-as-price.

### 4. Backend: Use `symbol_last_quotes` for today's intraday fallback

For 1D buckets earlier today where the live quote is the only source, if the Finnhub fetch fails, fall back to `symbol_last_quotes` (which snapshot-portfolio already populates). This prevents gaps in the 1D chart from transient API failures.

**File: `supabase/functions/portfolio-performance/index.ts`**
- Before fetching Finnhub quotes, load `symbol_last_quotes` for all symbols
- In `batchGetQuotes`, if Finnhub fails and cache misses, check `symbol_last_quotes` (with a 30-min staleness threshold)

## Gain/Loss Math (No Change Needed)

The current implementation already uses Unrealized P/L Delta (`(hv - cb) - baselineUPL`) which correctly isolates market movement and prevents capital deployment from showing as gain. This satisfies:
- "Buying assets does NOT create artificial gains"
- "Gain/Loss reflects only market movement"

Note: The spec says `Gain/Loss = current_hv - baseline_hv`, but that formula would count buying more stock as a gain. The current UPL delta approach is the correct one for the stated acceptance criteria.

## Files Modified

1. `src/components/PortfolioGrowthChart.tsx` -- range-dependent refresh intervals
2. `supabase/functions/portfolio-performance/index.ts` -- reduced 1D cache TTL, remove avg_cost fallback, add symbol_last_quotes fallback

## No Changes Needed (Already Implemented)

- Live point for 1D (append/replace last point with t=now)
- Scheduled cron snapshots (hourly market hours + daily close)
- Trade-triggered snapshots with trade_id dedup
- Coverage gating (< 98% skips write)
- No avg_cost in snapshot writes
- Cost basis in every data point

