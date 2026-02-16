

# Rebuild Portfolio Performance Chart: Snapshot-Based Architecture

## Overview
Replace the current chart system (which relies on Finnhub candle-based backfill for gaps) with a purely snapshot-driven approach. The chart will render entirely from `value_history` snapshots stored in the database, with no dependency on `market-history` candles. This eliminates the 500/403 errors from Finnhub's free tier blocking historical data for ETFs.

## What Changes

### 1. Delete `src/lib/backfill.ts`
Remove the candle-based backfill system entirely. It calls `market-history` which fails on free-tier Finnhub for many symbols (ETFs, etc.). Snapshots captured every 8 seconds while the page is open, plus baseline/daily/trade snapshots, provide sufficient data.

### 2. Create new edge function: `snapshot-portfolio`
A server-side function that computes and optionally persists a portfolio value snapshot. This centralizes the quote-fetch + value-compute + snapshot-insert logic.

**Endpoint:** `POST /functions/v1/snapshot-portfolio`
**Body:** `{ portfolio_id, reason: "trade" | "view_load" | "auto" | "manual_refresh" }`

**Logic:**
1. Fetch portfolio holdings + cash from DB (using service role key for server-side access)
2. Get quotes for all held symbols using Finnhub (with 30s server-side cache, sequential throttling, stale fallback)
3. Compute: `holdings_value = sum(shares * price)`, `total_value = holdings_value + cash`, `day_reference_value = sum(shares * prevClose) + cash`
4. Snapshot decision:
   - `reason == "trade"` -> always write (2-min dedup guard)
   - Otherwise -> write only if last snapshot is older than 5 minutes
5. Return: `{ total_value, holdings_value, cash, day_reference_value, snapshot_written, last_snapshot_at, stale, missing_symbols[] }`

**Error handling:**
- If some quotes fail, use last known price from holdings table as fallback, mark `stale: true`
- If all quotes fail, return last snapshot values + `stale: true` (never throw 500)
- Handle 429 with backoff, never retry more than 3 times

### 3. Create new edge function: `portfolio-performance`
Serves downsampled snapshot data for the chart.

**Endpoint:** `GET /functions/v1/portfolio-performance?portfolio_id=X&range=1D|1W|1M|ALL`

**Logic:**
1. Query `value_history` for the portfolio within the time range
2. Downsample to max points:
   - 1D: ~200 points (every ~5 min from ~8s captures)
   - 1W: ~168 points (every ~1 hour)
   - 1M: ~180 points (every ~4 hours)
   - ALL: ~200 points (every ~1 day)
3. Return: `{ points: [{t, v, hv, rv}], range, available, first_snapshot_at, stale_message? }`
   - `t` = ISO timestamp, `v` = total_value, `hv` = holdings_value (invested), `rv` = day_reference_value
4. If fewer than 2 points exist for a range, return `available: false` with a message

### 4. Rewrite `src/components/PortfolioGrowthChart.tsx`
Simplify the chart component significantly:

- Fetch data from `portfolio-performance` edge function instead of client-side snapshot processing
- Remove all client-side downsampling, deduplication, and baseline logic (server handles it)
- Keep: Recharts AreaChart, tooltip with scrubbing, trade dots, hover-pause behavior
- Add: "Last updated" timestamp, "Some prices delayed" subtle text when stale
- Add: Robinhood-style hover scrubbing -- on hover, update header value to show the hovered point's value and delta vs first point in range
- Smooth interaction: debounce hover state updates by 16ms (one frame)

### 5. Update `src/pages/PortfolioDetail.tsx`
- Remove backfill import and logic (`backfillDailyCloses`, `backfillDoneRef`)
- On page load, call `snapshot-portfolio` with `reason: "view_load"` to ensure fresh data
- On trade complete, call `snapshot-portfolio` with `reason: "trade"` then refresh chart
- Auto-refresh: every 60s call `snapshot-portfolio` with `reason: "auto"` (server decides whether to write)
- Pass `stale` and `lastUpdated` from snapshot response to chart for display

### 6. Update `src/lib/snapshots.ts`
- Keep `SnapshotRow` interface and `fetchSnapshots` as internal utilities
- Remove `capturePortfolioSnapshot` from client-side usage (now server-side via edge function)
- Keep `hasSnapshotToday` and `ensureRecentSnapshot` as lightweight checks

### 7. Scrubbing UX (Robinhood-style)
When hovering the chart:
- The header "Investing" value changes to show the hovered point's `holdings_value`
- The gain/loss pill changes to show delta from the range start to the hovered point
- On mouse leave, revert to current live values
- Implementation: `onDataReady` callback passes chart interaction state up to `PortfolioDetail`

## Files Changed

| File | Action |
|------|--------|
| `src/lib/backfill.ts` | Delete |
| `supabase/functions/snapshot-portfolio/index.ts` | Create |
| `supabase/functions/portfolio-performance/index.ts` | Create |
| `supabase/config.toml` | Add new function configs |
| `src/components/PortfolioGrowthChart.tsx` | Rewrite (simpler, server-driven) |
| `src/pages/PortfolioDetail.tsx` | Remove backfill, use new edge functions |
| `src/lib/snapshots.ts` | Simplify (remove client-side capture calls) |

## Architecture Flow

```text
User opens portfolio page
  |
  v
POST snapshot-portfolio (reason: view_load)
  |-> Fetches quotes from Finnhub (cached 30s)
  |-> Computes total_value, holdings_value, day_reference
  |-> Writes snapshot if stale (>5 min)
  |-> Returns current values + stale flag
  |
  v
GET portfolio-performance?range=1D
  |-> Queries value_history (last 24h)
  |-> Downsamples to ~200 points
  |-> Returns [{t, v, hv}]
  |
  v
Chart renders from returned points
  |
  v
Every 60s: POST snapshot-portfolio (reason: auto)
  |-> Server decides: snapshot if >5 min old, skip otherwise
  |-> Chart re-fetches performance data
```

## Non-negotiables Addressed
- No Finnhub candle/history endpoints used for chart
- Rate-limit safe (server-side 30s cache, sequential throttling, backoff)
- Never broken chart (stale fallback, graceful degradation)
- Trade -> instant chart update (snapshot on trade, then re-fetch)
- Range toggles return appropriate downsampled data with correct deltas

