

# Scalable "Alive" Chart Refresh for Alpaca

## Problem
Currently, every chart refresh triggers a full `portfolio-performance` call that fetches bars AND live snapshots from Alpaca independently per user. With hundreds of users, this creates N upstream API calls for the same symbols, risking rate-limit storms.

## Architecture Overview

```
Client (15s/60s/5m)
    |
    v
portfolio-performance (Edge Function)
    |
    +-- Bars: cached per range (60s/5m/15m/1h)
    |
    +-- Live quote: reads from `symbol_quote_cache` DB table
            |
            v
      quote-cache-refresh (Edge Function, called by clients needing fresh quotes)
            |
            v
        Alpaca /v2/stocks/snapshots (single call per batch of stale symbols)
```

## Changes

### 1. Database: `symbol_quote_cache` table

Create a new table to act as a shared server-side quote cache:

- `symbol` (TEXT, PK)
- `price` (NUMERIC)
- `prev_close` (NUMERIC)
- `day_high` (NUMERIC)
- `day_low` (NUMERIC)
- `day_open` (NUMERIC)
- `updated_at` (TIMESTAMPTZ)

No RLS needed -- this is public market data accessed only by edge functions (using service role). The table replaces in-memory Maps that reset on cold starts.

### 2. New Edge Function: `quote-cache-refresh`

A lightweight function that:

1. Accepts `symbols` (comma-separated) and `max_age_ms` (default 15000)
2. Reads `symbol_quote_cache` for all requested symbols
3. Splits into "fresh" (updated_at within max_age_ms) and "stale"
4. For stale symbols: makes ONE Alpaca `/v2/stocks/snapshots` call, upserts results back into `symbol_quote_cache`
5. Returns all quotes (fresh + newly fetched)

This is the single funnel point -- no matter how many users request AAPL, only one upstream call happens per 15s window.

### 3. Refactor `portfolio-performance`

Split the function's behavior by range:

**For 1D:**
- Fetch bars (5Min timeframe) with a 60s response cache (bars don't update faster)
- For the live "last point": call `quote-cache-refresh` with the portfolio's symbols instead of calling Alpaca snapshots directly
- Append/replace the last point using cached quotes (15s freshness)

**For 1W / 1M:**
- Bars only, no live point appended
- Response cache: 60s for 1W, 15m for 1M (already close to current values)

**For ALL:**
- Bars only, no live point
- Response cache: 1h (already matches current)

Key change: remove the direct `fetchSnapshots()` call from portfolio-performance and replace it with a read from `symbol_quote_cache` (or a call to `quote-cache-refresh`).

### 4. Refactor `market-quote-batch`

Update to use `symbol_quote_cache` as its backing store instead of an in-memory Map:

1. Read from DB table for requested symbols
2. If fresh (within TTL), return immediately
3. If stale, fetch from Alpaca, upsert into DB, return

This means `market-quote-batch` and `portfolio-performance` share the same cache, preventing duplicate upstream calls.

### 5. Frontend: Update Refresh Cadence

Update `PortfolioGrowthChart.tsx` `getRefreshMs()`:

| Range | Current | New |
|-------|---------|-----|
| 1D    | 15s     | 15s (no change) |
| 1W    | 2m      | 60s |
| 1M    | 5m      | 60s |
| ALL   | 10m     | 5m  |

Add a safety throttle in `PortfolioGrowthChart.tsx`: track `lastFetchTime` and skip if less than 15s since last successful fetch, preventing rapid-fire requests from React re-renders.

### 6. Frontend: Holdings Count Degradation

In `PortfolioGrowthChart.tsx`, if the portfolio has more than 25 holdings, multiply the refresh interval by 2 (e.g., 1D becomes 30s instead of 15s). This is a simple check using a prop or by inspecting the response.

### 7. Update `usePortfolioQuotes.ts`

Update `fetchMultipleQuotes` client-side cache TTL from 120s to 30s to better match the new server-side cache, ensuring the Index page also benefits from the shared cache without unnecessary staleness.

## Technical Details

### `symbol_quote_cache` Upsert Pattern
```sql
INSERT INTO symbol_quote_cache (symbol, price, prev_close, day_high, day_low, day_open, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, now())
ON CONFLICT (symbol) DO UPDATE SET
  price = EXCLUDED.price,
  prev_close = EXCLUDED.prev_close,
  day_high = EXCLUDED.day_high,
  day_low = EXCLUDED.day_low,
  day_open = EXCLUDED.day_open,
  updated_at = now();
```

### Rate Limit Safety
- Alpaca free tier: 200 requests/minute
- With shared cache (15s TTL), worst case: 4 upstream calls/minute per unique symbol set
- Even with 100 concurrent users holding the same 8 symbols, only 4 calls/min instead of 400

### Files Modified
- `supabase/functions/portfolio-performance/index.ts` -- use DB cache for live point, adjust bar cache TTLs
- `supabase/functions/market-quote-batch/index.ts` -- back with DB table instead of in-memory Map
- `supabase/functions/quote-cache-refresh/index.ts` -- new function
- `src/components/PortfolioGrowthChart.tsx` -- update refresh intervals, add throttle and holdings degradation
- `src/hooks/usePortfolioQuotes.ts` -- reduce client cache TTL
- New migration for `symbol_quote_cache` table
- `supabase/config.toml` -- add `quote-cache-refresh` entry

