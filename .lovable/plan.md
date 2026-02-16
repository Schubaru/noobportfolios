

# Switch Chart + Pricing from Finnhub to Alpaca Market Data

## Overview

Replace the four pricing/charting edge functions with Alpaca-backed equivalents while keeping Finnhub for fundamentals, profile, dividends, and search. The frontend stays untouched -- all changes are backend-only, preserving the existing response contracts.

## What Changes

### 1. New: `supabase/functions/_shared/alpaca.ts` (shared helper)

A small module imported by all Alpaca-powered functions:

- Reads `ALPACA_API_KEY_ID` and `ALPACA_API_SECRET_KEY` from `Deno.env`
- If either is missing, provides a helper that returns a 500 response with `"Alpaca keys not configured"`
- Exports an `alpacaFetch(path, params?)` function that:
  - Base URL: `https://data.alpaca.markets`
  - Sets headers: `APCA-API-KEY-ID` and `APCA-API-SECRET-KEY`
  - Includes retry with exponential backoff (reuse existing pattern)
  - Returns the `Response` object

### 2. Rewrite: `supabase/functions/market-quote/index.ts`

**Current**: Calls Finnhub `/quote?symbol=X`
**New**: Calls Alpaca `GET /v2/stocks/{symbol}/snapshot`

- Extract `latestTrade.p` as price (fallback: `minuteBar.c`)
- Extract `prevDailyBar.c` as prevClose
- Compute `change = price - prevClose`, `changePct = (change / prevClose) * 100`
- Return the **same normalized shape**: `{ symbol, price, change, changePct, dayHigh, dayLow, dayOpen, prevClose, timestamp }`
- Keep in-memory cache (60s TTL)
- If Alpaca keys missing: return 500 with clear message, no crash

### 3. Rewrite: `supabase/functions/market-quote-batch/index.ts`

**Current**: Loops Finnhub `/quote` per symbol sequentially
**New**: Single Alpaca call `GET /v2/stocks/snapshots?symbols=SYM1,SYM2,...`

- One API call for up to 20 symbols (vs N sequential calls before)
- Normalize each snapshot to the same `QuoteData` shape
- Return `{ quotes: Record<string, QuoteData>, errors?: Record<string, string> }`
- Keep in-memory cache (120s TTL) per symbol
- Major improvement: no more sequential 150ms delays between symbols

### 4. Rewrite: `supabase/functions/market-history/index.ts`

**Current**: Calls Finnhub `/stock/candle` (free tier = daily only)
**New**: Calls Alpaca `GET /v2/stocks/bars?symbols=SYM&timeframe=...&start=ISO&end=ISO`

- Supports all timeframes (1Min, 5Min, 15Min, 1Hour, 1Day) -- no more free-tier limitation
- Normalize to existing shape: `{ symbol, resolution, candles: [{ timestamp, close }] }`
- Cache: 1 hour for daily, 5 min for intraday
- This unlocks intraday chart data that Finnhub free tier blocked

### 5. Rewrite: `supabase/functions/portfolio-performance/index.ts`

**Current**: Reconstructs portfolio value using DB snapshots + Finnhub quotes + lazy Finnhub candle backfill
**New**: Bar-driven valuation using Alpaca bars

Core logic change:

```text
A) Map range to Alpaca timeframe + window:
   1D  -> 5Min bars,  today market open to now
   1W  -> 30Min bars, now - 7d to now
   1M  -> 1Hour bars, now - 30d to now
   ALL -> 1Day bars,  portfolio created_at to now

B) Fetch holdings (symbol, shares, avg_cost) + cash from DB

C) Single Alpaca call: GET /v2/stocks/bars?symbols=SYM1,SYM2,...&timeframe=X&start=ISO&end=ISO
   (multi-symbol in one request)

D) Align timestamps:
   - Union all bar timestamps across symbols as canonical x-axis
   - Forward-fill: for each symbol at time t, use latest bar at or before t
   - This avoids gaps from symbols with different trading volumes

E) Compute per timestamp:
   hv(t) = SUM(shares * price_at_t)
   cb = SUM(shares * avg_cost)  (constant, from DB)
   v(t) = hv(t) + cash

F) Downsample to ~300 points max (time-based)

G) Return: { points: [{ t, v, hv, cb }], range, available }
```

- Still appends a live point for 1D using Alpaca snapshot (reuses the new market-quote logic)
- Removes Finnhub lazy-backfill code (no longer needed -- Alpaca provides bars directly)
- Removes dependency on `symbol_daily_prices` and `symbol_last_quotes` for chart rendering (those tables remain for snapshot-portfolio which stays on Finnhub)
- Response cache TTLs remain: 1D=10s, 1W=5m, 1M=15m, ALL=1h

### 6. No Changes (Stays on Finnhub)

- `market-profile` -- company profile data
- `market-fundamentals` -- PE, EPS, market cap, etc.
- `market-dividends` -- dividend history
- `market-search` -- symbol search
- `snapshot-portfolio` -- snapshot writer (still uses Finnhub for quotes)
- `snapshot-all-portfolios` -- cron snapshot runner
- `backfill-daily-prices` -- historical price backfill
- `get-top-growth-picks` -- AI growth picks
- `initialize-portfolio` -- portfolio setup

### 7. No Frontend Changes

The response contracts are identical. The frontend (`PortfolioGrowthChart.tsx`, `finnhub.ts`, `usePortfolioQuotes.ts`) continues to work without modification.

## Config Updates

Add to `supabase/config.toml` (no JWT verification, matching existing pattern):
- No new entries needed -- all four functions already have `verify_jwt = false` entries

## Env Vars (NOT Added Yet)

The code will reference these but gracefully return 500 if missing:
- `ALPACA_API_KEY_ID`
- `ALPACA_API_SECRET_KEY`

## Technical Details

### Alpaca API Endpoints Used

| Endpoint | Used By | Purpose |
|---|---|---|
| `GET /v2/stocks/{symbol}/snapshot` | market-quote | Single symbol current price |
| `GET /v2/stocks/snapshots?symbols=...` | market-quote-batch | Multi-symbol current prices |
| `GET /v2/stocks/bars?symbols=...&timeframe=...` | market-history, portfolio-performance | Historical + intraday bars |

### Key Advantages Over Finnhub Free Tier

- Intraday bars (1Min, 5Min, etc.) available -- Finnhub restricted these to premium
- Multi-symbol bars in a single API call -- no sequential throttling needed
- Multi-symbol snapshots in one call -- batch quotes become a single request
- No 60 calls/min rate limit concern for the bar-based chart engine

### Files Created/Modified

1. **Create**: `supabase/functions/_shared/alpaca.ts`
2. **Rewrite**: `supabase/functions/market-quote/index.ts`
3. **Rewrite**: `supabase/functions/market-quote-batch/index.ts`
4. **Rewrite**: `supabase/functions/market-history/index.ts`
5. **Rewrite**: `supabase/functions/portfolio-performance/index.ts`

### Verification (Before Secrets)

- All functions compile and deploy without Alpaca env vars set
- Calling any Alpaca-powered function returns: `{ "error": "Alpaca keys not configured" }` with status 500
- Finnhub-powered functions (profile, fundamentals, dividends, search) continue working normally
- Frontend renders the "keys not configured" state gracefully (chart shows error message)

