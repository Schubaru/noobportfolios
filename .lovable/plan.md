

# Fix Flat 1D Chart with Live Last Point

## Root Cause

The backend already generates a final bucket at `t=now` using live Finnhub quotes. However:
- Response cache TTL for 1D = 60s (line 19)
- Quote cache TTL = 60s (line 14)
- Frontend refresh = 60s

So every refresh returns the same cached response with an identical last point. The chart never moves.

## Changes

### 1. Backend: `supabase/functions/portfolio-performance/index.ts`

**Reduce cache TTLs for 1D:**
- Response cache: 60s --> 15s (line 19)
- Quote cache: 60s --> 30s (line 14)

This ensures each frontend refresh (every 60s) gets a fresh response with updated quotes.

**Explicitly ensure the last point is always "now":**
After building all bucket points, if `range === '1D'`, replace or append a final point computed from the freshest quotes at `t = new Date().toISOString()`. This guarantees the chart's right edge always reflects the latest price, even if the bucket math rounded to a slightly earlier time.

### 2. Frontend: `src/components/PortfolioGrowthChart.tsx`

**Reduce refresh interval for better responsiveness (optional):**
- Keep `REFRESH_MS = 60_000` (no change needed since backend cache is now 15s, so even 60s refreshes will get updated data)

No other frontend changes required -- the existing `loadData` already replaces `perfData` with the full response, and `chartData` is derived from it.

## Technical Details

```text
Before (1D):
  Response cache = 60s, Quote cache = 60s
  --> Frontend refresh at T+60s hits cached response from T+0s
  --> Same points, same last timestamp --> flat line

After (1D):
  Response cache = 15s, Quote cache = 30s
  --> Frontend refresh at T+60s gets fresh response
  --> Last point recalculated with updated quote prices
  --> Chart right edge moves with market
```

## Scope

- Only 1D cache TTL is reduced. 1W (5m), 1M (15m), ALL (1h) remain unchanged.
- No DB writes -- the live point is computed on-the-fly and only returned in the response.
- Finnhub rate impact is minimal: quotes are still cached 30s server-side, and the 200ms sequential throttle remains.

## Files Modified

1. `supabase/functions/portfolio-performance/index.ts` -- reduce 1D response cache to 15s, quote cache to 30s, ensure last point is fresh

