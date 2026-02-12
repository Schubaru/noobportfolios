

# Portfolio Growth Chart -- Chart Performance, Not Value

## Problem

The previous chart implementation plotted `total_value` (cash + holdings), which is misleading. A user with $10k who invests $8k sees a flat line near $10k -- buying assets creates fake "jumps" that aren't real gains. The time axis also had sorting/timezone issues.

## Solution: Chart Invested P/L

Instead of charting dollar values, chart the **gain/loss on invested money**:

```
invested_pl = invested_value - cost_basis
```

Where:
- `invested_value` = sum of (shares x current_price) -- holdings only, no cash
- `cost_basis` = sum of (shares x avg_cost) -- what the user actually paid

This means:
- At the moment of a trade, P/L stays near $0 (no fake jumps)
- The line only moves due to market price changes (real "growth")
- Matches the "Gain/Loss" number already shown in the PerformanceSummary header

## Data

The `value_history` table already stores `invested_value`, `cost_basis`, and `unrealized_pl` on recent snapshots. The chart will compute `invested_pl = invested_value - cost_basis` from each snapshot row. Old rows missing these fields will be skipped.

## Implementation

### 1. New File: `src/lib/snapshots.ts`

Snapshot utilities:

- **`capturePortfolioSnapshot(portfolioId, portfolio, metrics, source)`** -- inserts a `value_history` row with `invested_value`, `cost_basis`, `unrealized_pl`, `realized_pl`, and per-holding `metadata`. Rate-limited: skips if last snapshot was < 5s ago (unless source is `'trade'`).

- **`fetchSnapshots(portfolioId, fromDate?)`** -- queries `value_history` ordered by `recorded_at ASC`, returns typed snapshot objects including `invested_value`, `cost_basis`, and `source`.

### 2. New File: `src/components/PortfolioGrowthChart.tsx`

Chart component:

- **Y-axis**: Shows `invested_pl` (= `invested_value - cost_basis`) in dollars. Auto-scaled with 8% padding. Uses dynamic formatting: full dollars below $10k, "k" notation above.
- **X-axis**: Sorted by `recorded_at` ascending (UTC storage, local display). Deduplicates same-day labels by showing time (e.g., "Feb 11 14:05"). 
- **Line color**: Green when latest P/L >= 0, red when negative (using existing `text-success` / `text-destructive` tokens).
- **Tooltip**: Shows date/time, invested P/L value, and delta from previous snapshot (e.g., "+$6.50 since last update"). Shows "Trade executed" badge for trade-source snapshots.
- **Time range selectors**: Smart availability based on portfolio age:
  - **1D**: Always shown
  - **1W**: Shown if portfolio age >= 2 days
  - **1M**: Shown if age >= 7 days
  - **3M**: Shown if age >= 30 days (labeled "YTD" alternative not needed for simplicity)
  - **1Y**: Shown if age >= 90 days
  - **ALL**: Always shown
- **Empty state**: "Your chart will fill in as you trade and check in."
- **Single point**: Renders a dot with the value labeled.
- **QA rule**: Last chart point's `invested_pl` must match `metrics.unrealizedPL` within $0.01. If mismatch, log a warning.

### 3. Modify: `src/pages/PortfolioDetail.tsx`

- Change `REFRESH_INTERVAL_MS` from 20000 to 8000.
- After each `loadPortfolioData` with `forceRefresh=true`, fire-and-forget `capturePortfolioSnapshot(id, portfolio, metrics, 'auto')`.
- After `handleTradeComplete`, call `capturePortfolioSnapshot(id, portfolio, metrics, 'trade')` (bypasses rate limit).
- Add `snapshotKey` state counter that increments after each snapshot capture, passed to `PortfolioGrowthChart` to trigger re-fetch.
- Render `PortfolioGrowthChart` between PerformanceSummary and Holdings grid.
- Add opportunistic daily snapshot: if last snapshot > 20 hours old on page load, capture one with source `'daily'`.

### 4. Modify: `src/components/TradeModal.tsx`

- Enhance the existing `value_history` insert (around line 1172) to also write `cost_basis`, `unrealized_pl`, `realized_pl`, and `metadata` fields. Compute cost_basis from updated holdings after the trade.

### 5. Modify: `src/lib/types.ts`

- Extend `ValueSnapshot` interface to include `investedValue`, `costBasis`, `unrealizedPL`, `source` fields (all optional for backward compat).

### 6. Modify: `src/hooks/usePortfolios.ts`

- Update `DbValueHistory` interface and `transformPortfolio` to pass through the new snapshot fields.

## Technical Details

### Snapshot Rate Limiting

```typescript
// Client-side rate limiting using last snapshot query
const shouldCapture = async (portfolioId: string, minMs = 5000) => {
  const { data } = await supabase
    .from('value_history')
    .select('recorded_at')
    .eq('portfolio_id', portfolioId)
    .order('recorded_at', { ascending: false })
    .limit(1);
  if (!data?.length) return true;
  return Date.now() - new Date(data[0].recorded_at).getTime() >= minMs;
};
```

### Chart Data Flow

```text
value_history rows (sorted by recorded_at ASC)
  |
  filter: only rows where invested_value AND cost_basis are not null
  |
  map: { timestamp, invested_pl: invested_value - cost_basis, source }
  |
  filter by selected time range
  |
  Recharts AreaChart
```

### Y-Axis Domain Calculation

```text
min_pl = min(all invested_pl values in range)
max_pl = max(all invested_pl values in range)
range = max_pl - min_pl
padding = range < 1 ? max(|min_pl| * 0.05, 5) : range * 0.08

domain = [min_pl - padding, max_pl + padding]
// Always include 0 if the data crosses zero
```

### Time Range Button Visibility

```text
portfolio_age = now - portfolio.createdAt

1D   -> always
1W   -> age >= 2 days
1M   -> age >= 7 days
3M   -> age >= 30 days
1Y   -> age >= 90 days
ALL  -> always
```

### QA Consistency Check

On each chart render, compare the last snapshot's `invested_pl` with the live `metrics.unrealizedPL`. If they differ by more than $0.01, log a debug warning. The chart always displays snapshot data, but the header always shows live-computed values -- they should converge after each snapshot capture.

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/snapshots.ts` | Create | Snapshot capture + fetch utilities |
| `src/components/PortfolioGrowthChart.tsx` | Create | P/L chart with time ranges |
| `src/pages/PortfolioDetail.tsx` | Modify | 8s interval, auto-snapshot, render chart |
| `src/components/TradeModal.tsx` | Modify | Enhanced snapshot data on trade |
| `src/lib/types.ts` | Modify | Extend ValueSnapshot interface |
| `src/hooks/usePortfolios.ts` | Modify | Pass through new snapshot fields |
