

# Harden Snapshot-Based Portfolio Chart

## Summary
This plan eliminates chart spikes/snapbacks, ensures trade snapshots are never missed, and fills data gaps when users aren't visiting -- all without changing UI layout. Changes span schema, two edge functions, a new scheduled function, and minor client-side wiring.

---

## 1. Database Schema Migration

### A) Extend `value_history` table
Add new columns with defaults so existing rows remain valid:

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `cash_value` | numeric | 0 | Explicit cash at snapshot time |
| `day_reference_value` | numeric | null | sum(shares * prevClose) + cash |
| `quality` | text | 'good' | 'good', 'degraded', or 'stale' |
| `quote_coverage` | numeric | null | 0..1 fraction of holdings covered |
| `quote_time_spread_seconds` | int | null | max - min quote timestamps |

### B) Create `symbol_last_quotes` table

| Column | Type | Notes |
|--------|------|-------|
| `symbol` | text | Primary key |
| `price` | numeric | Not null |
| `prev_close` | numeric | Nullable |
| `quote_time` | timestamptz | Not null |
| `updated_at` | timestamptz | Default now() |

No RLS needed -- only edge functions (service role) read/write this table. RLS will be disabled explicitly.

### C) Add index
- `(portfolio_id, recorded_at DESC)` on `value_history` (likely exists, will add if missing)

---

## 2. Edge Function: `snapshot-portfolio` Rewrite

### Key changes from current implementation:

**A) Parallel quote fetching (max 6 concurrent)**
Replace sequential 150ms-delay loop with a concurrency-limited pool. Still respects rate limits via backoff on 429, but processes up to 6 symbols simultaneously.

**B) `symbol_last_quotes` fallback**
On successful quote, UPSERT into `symbol_last_quotes`. On failure, fallback to `symbol_last_quotes` only if `quote_time` is within 15 minutes. Never fall back to `avg_cost` as a price -- that causes spikes.

**C) Coverage gating**
Compute `quote_coverage` as fraction of total holdings value with valid quotes. If coverage < 0.98, set `quality='stale'` and skip the snapshot write entirely. Return `stale: true` with the last snapshot timestamp so the UI stays stable.

**D) Trade idempotency**
- Accept optional `trade_id` in the request body.
- For `reason='trade'` with `trade_id`: check if `metadata->>'trade_id'` already exists in `value_history` for this portfolio. Skip write if duplicate.
- For `reason='trade'` without `trade_id`: fall back to current 2-minute dedup (backwards compatibility).
- Remove time-based dedup for trades entirely when `trade_id` is provided.

**E) Richer snapshot data**
Write all new columns: `cash_value`, `day_reference_value`, `quality`, `quote_coverage`, `quote_time_spread_seconds`.

**F) Updated response**
```
{
  total_value, holdings_value, cash_value, day_reference_value,
  cost_basis, snapshot_written, last_snapshot_at,
  stale, quote_coverage, quality
}
```

---

## 3. Edge Function: `portfolio-performance` Rewrite

### A) Quality filtering
- Default query: `quality IN ('good')`. If that yields < 2 rows, include `'degraded'`. Never include `'stale'`.
- Old rows without quality default to 'good' (column default handles this).

### B) Time-bucket downsampling
Replace index-based rounding with time-bucket approach:

| Range | Bucket size | Max points |
|-------|------------|------------|
| 1D | 5 min | 288 |
| 1W | 1 hour | 168 |
| 1M | 4 hours | 180 |
| ALL | 1 day | variable |

For each bucket, take the last point. Always preserve:
- First point in range
- Last point in range
- All `source='trade'` points (merge back in, then trim if over max)

### C) Monotonic timestamp guarantee
After merging trade points, sort by timestamp and deduplicate any points sharing the same timestamp (keep trade-sourced).

### D) Response additions
- Include `coverage_notes: string | null` if any degraded points were included.
- Keep existing `available`, `points`, `range`, `first_snapshot_at` fields.

---

## 4. New Edge Function: `snapshot-all-portfolios` (Scheduled)

Create a new function that can be called by an external cron (or manually) to snapshot all active portfolios daily.

**Endpoint:** `POST /functions/v1/snapshot-all-portfolios`
**Auth:** Requires a `CRON_SECRET` header matching a stored secret (not user JWT).

**Logic:**
1. Query all portfolios that have at least one holding.
2. For each portfolio, call the snapshot-portfolio logic internally (reuse the same quote-fetch + coverage-gating).
3. Process portfolios sequentially with 1s delays to stay within Finnhub limits.
4. Log results: how many written, how many skipped (stale), how many failed.
5. Return summary JSON.

**Scheduling:** Since Lovable Cloud doesn't have native cron, the function will be secured with a `CRON_SECRET` environment variable. The user can set up an external cron service (e.g., cron-job.org, GitHub Actions, or Cloudflare Workers) to call it once or twice daily. The function is fully idempotent.

---

## 5. Client-Side Changes (Minimal)

### A) `src/lib/snapshots.ts`
- Update `callSnapshotPortfolio` to accept optional `trade_id` parameter and include it in the request body.
- Update return type to include `quality` and `quote_coverage`.

### B) `src/components/TradeModal.tsx`
- After inserting the transaction, capture the returned transaction `id`.
- Pass `trade_id` to `callSnapshotPortfolio` (via `onTradeComplete` callback or directly).
- Note: The TradeModal already inserts a `value_history` row directly (lines 1191-1203). This client-side snapshot insert will be removed -- the edge function handles it now, preventing duplicate/inconsistent snapshots.

### C) `src/pages/PortfolioDetail.tsx`
- Update `handleTradeComplete` to pass the trade transaction ID to `triggerSnapshot('trade', tradeId)`.
- No layout changes.

### D) `supabase/config.toml`
- Add `[functions.snapshot-all-portfolios]` with `verify_jwt = false`.

---

## 6. Remove Client-Side Snapshot Insert from TradeModal

Currently, `TradeModal.tsx` (lines 1191-1203) inserts a `value_history` row directly using client-side calculated values (which can be stale/wrong since it uses `h.currentPrice || h.avgCost`). This is a source of spikes.

**Change:** Remove this direct insert. The edge function `snapshot-portfolio` with `reason='trade'` will handle it server-side with fresh quotes and coverage gating.

---

## Technical Flow After Changes

```text
Trade executed in TradeModal
  |-> Insert transaction (get trade_id)
  |-> Update holdings/cash in DB
  |-> Remove: client-side value_history insert
  |-> Call onTradeComplete(trade_id)
  |
  v
PortfolioDetail.handleTradeComplete(trade_id)
  |-> callSnapshotPortfolio(id, 'trade', trade_id)
  |   |-> Edge fn fetches fresh quotes (parallel, cached)
  |   |-> Coverage >= 98%? Write snapshot. Else skip.
  |   |-> Idempotent by trade_id (no duplicates)
  |-> snapshotKey++ triggers chart reload
  |
  v
Chart re-fetches portfolio-performance
  |-> Returns quality-filtered, time-bucketed points
  |-> Trade points always preserved
  |-> No spikes from avg_cost fallback
```

---

## Files Changed

| File | Action |
|------|--------|
| Database migration | Add columns to `value_history`, create `symbol_last_quotes` |
| `supabase/functions/snapshot-portfolio/index.ts` | Rewrite (parallel quotes, coverage gating, trade_id dedup) |
| `supabase/functions/portfolio-performance/index.ts` | Rewrite (quality filter, time-bucket downsample) |
| `supabase/functions/snapshot-all-portfolios/index.ts` | Create (daily cron endpoint) |
| `supabase/config.toml` | Add snapshot-all-portfolios config |
| `src/lib/snapshots.ts` | Add trade_id param, update types |
| `src/components/TradeModal.tsx` | Remove direct value_history insert, pass trade_id up |
| `src/pages/PortfolioDetail.tsx` | Wire trade_id through handleTradeComplete |

