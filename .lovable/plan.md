

# Fix Chart to Always Show a Full Left-to-Right Line

## Root Cause

Two critical issues prevent the Robinhood-style full-width line:

1. **Baseline point is never plotted**: `findBaseline` finds the reference snapshot (often before `windowStart`), uses its value for P/L math, but the point itself is excluded from `filteredData` (which only includes `timestamp >= windowStart`). When ALL data is before the window (like 1D when no recent snapshots exist), the chart shows "no data."

2. **No "current" endpoint**: The line ends at the last snapshot timestamp (could be hours old), not at "now." This prevents the line from reaching the right edge.

## Fix (in `PortfolioGrowthChart.tsx`)

### Change 1: Inject a baseline anchor point at `windowStart`

After computing the baseline, add a synthetic chart point at `x = windowStart` with `y = 0` (since P/L is relative to baseline, the baseline's own P/L is always 0). This anchors the line to the left edge.

```typescript
// Start with baseline anchor at the left edge
const points: ChartPoint[] = [{
  timestamp: windowStart,
  investedPL: 0,
  source: null,
}];

// Add all in-window snapshots
for (const s of filtered) {
  points.push({
    timestamp: s.timestamp,
    investedPL: (s.investedValue ?? 0) - baselineValue,
    source: s.source,
  });
}
```

### Change 2: Append a "now" point at `windowEnd`

Add a point at `windowEnd` using the current live P/L (the last known invested value minus baseline). This extends the line to the right edge.

The component already receives `currentUnrealizedPL` but that's absolute P/L. Instead, we'll need to pass the current `holdingsValue` from the parent so we can compute range-relative P/L for the endpoint. However, to keep changes minimal, we can use the last snapshot's invested value as the "current" value (it's updated every 8 seconds via auto-refresh, so it's effectively live).

```typescript
// Extend line to the right edge using last known value
const lastValue = filtered.length > 0
  ? (filtered[filtered.length - 1].investedValue ?? 0)
  : baselineValue;

points.push({
  timestamp: windowEnd,
  investedPL: lastValue - baselineValue,
  source: null,
});
```

### Change 3: Remove the empty/single-point states

With the baseline anchor and "now" endpoint, there will always be at least 2 points when a baseline exists. The empty state should only show when there are truly zero snapshots (brand new portfolio with no holdings).

### Change 4: Pass `currentInvestedValue` prop for live right-edge

To make the right-edge point reflect the live price (not the last snapshot which could be stale), add a `currentInvestedValue` prop from the parent. The parent already computes `metrics.holdingsValue` which is the live invested value.

In `PortfolioDetail.tsx`, pass it:
```tsx
<PortfolioGrowthChart
  ...
  currentInvestedValue={metrics.holdingsValue}
/>
```

In the chart, use it for the right-edge point:
```typescript
const nowPL = (currentInvestedValue ?? lastSnapshotValue) - baselineValue;
points.push({ timestamp: windowEnd, investedPL: nowPL, source: null });
```

## Why This Fixes Each Bug

- **1D empty**: The baseline (last snapshot before midnight) gets anchored at midnight with P/L = 0, and the "now" point shows current P/L. Line spans midnight-to-now.
- **1W/1M vertical cluster**: The baseline anchor at `windowStart` (7/30 days ago) puts a point at the far left. Data points fill the middle/right. Line spans full width.
- **Range switching**: Each range recomputes `windowStart/windowEnd`, re-finds baseline, rebuilds anchor + data + endpoint. Smooth transition via animation.
- **Gain/loss pill matches chart**: Both use `findBaseline` with the same `windowStart`. The pill shows `currentInvestedValue - baseline`, and the chart's rightmost point shows the same value.

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/components/PortfolioGrowthChart.tsx` | Modify | Add baseline anchor point at left edge, "now" point at right edge, accept `currentInvestedValue` prop |
| `src/pages/PortfolioDetail.tsx` | Modify | Pass `currentInvestedValue={metrics.holdingsValue}` to chart |

