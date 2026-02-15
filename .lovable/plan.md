

# Fix Timeframe Calculations for All Ranges

## Root Cause
All 12 snapshots before Feb 14 have `cost_basis = NULL` because earlier code didn't populate that field. The chart filters snapshots with `s.costBasis !== null`, discarding all pre-Feb 14 data. This means 1W, 1M, and ALL ranges all use Feb 14 as baseline -- they show identical values.

The backfill system also failed because it uses these filtered snapshots to detect gaps, and with the first visible snapshot being Feb 14, no gaps are detected.

## Changes

### 1. Relax the snapshot filter (`src/components/PortfolioGrowthChart.tsx`)

The chart only uses `investedValue` for its P/L line, never `costBasis`. Change the filter from:

```tsx
// Before
validSnapshots.filter(s => s.investedValue !== null && s.costBasis !== null)

// After
validSnapshots.filter(s => s.investedValue !== null)
```

This immediately makes the 12 older snapshots visible to the chart and to the `computeRangeGain` function, fixing 1W, 1M, and ALL range calculations.

### 2. Backfill missing `cost_basis` on old snapshots (database migration)

Run a one-time migration to fill `cost_basis` for the existing NULL rows. Use the `invested_value` as an approximation for snapshots where `cost_basis` was never recorded (since they were captured at trade time, the invested value closely approximates the cost basis at that moment). This ensures future features that need `cost_basis` won't hit the same gap.

```sql
UPDATE value_history
SET cost_basis = invested_value,
    unrealized_pl = 0
WHERE cost_basis IS NULL
  AND invested_value IS NOT NULL;
```

### 3. Fix backfill gap detection (`src/lib/backfill.ts`)

The backfill uses `existingSnapshots` to determine what dates already have data. But it receives the filtered list (which skipped old snapshots). After fix #1, this resolves itself. However, add a safety improvement: also pass the raw `allSnapshots` for gap detection instead of relying on the chart-filtered set.

No separate change needed here since fix #1 means the full snapshot history is now passed through `onDataReady`.

### 4. Prevent future NULL cost_basis (`src/lib/snapshots.ts`)

In `capturePortfolioSnapshot`, ensure `cost_basis` always gets a fallback value even if `metrics.costBasis` is undefined. Add a fallback:

```tsx
cost_basis: metrics.costBasis ?? 0,
```

## Summary of File Changes

| File | Change |
|------|--------|
| `src/components/PortfolioGrowthChart.tsx` | Remove `costBasis !== null` from filter (line 227) |
| `src/lib/snapshots.ts` | Add fallback for `cost_basis` in `capturePortfolioSnapshot` |
| Database migration | Backfill NULL `cost_basis` rows with `invested_value` |

## Expected Result
- **1D**: Same as before (all recent data has full fields)
- **1W**: Baseline from ~7 days ago (Feb 8 trade snapshot), showing week-over-week change
- **1M**: Baseline from ~30 days ago (Jan 27 first trade), showing monthly performance
- **ALL**: Baseline from first-ever snapshot (Jan 27), showing total lifetime performance
- All four ranges will show distinct, correct gain/loss values in both the header pill and the chart
