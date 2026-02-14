

# Fix 1D to Show Last 24 Hours

## The Problem

`getWindowStart('1D')` currently returns **local midnight**, and `findBaseline` for 1D searches for snapshots **before midnight**. If there are no snapshots from yesterday (this feature is new), the baseline is `null` and the chart shows "no data."

## The Fix

Change 1D from "since midnight" to "last 24 hours." This eliminates timezone edge cases and always finds a baseline because there are snapshots going back to Jan 27.

### File: `src/components/PortfolioGrowthChart.tsx`

**1. Change `getWindowStart('1D')` to use 24 hours ago instead of midnight:**

```typescript
case '1D': return now - 24 * 60 * 60 * 1000;
```

**2. Remove the special 1D case in `findBaseline`:**

Since 1D is now just "24h ago" (same pattern as 1W/1M), it can use the standard logic: find the nearest snapshot at/after windowStart, or fall back to the nearest before it. No special "before midnight" handling needed.

```typescript
export function findBaseline(
  snapshots: SnapshotRow[],
  windowStart: number,
  range?: TimeRange
): SnapshotRow | null {
  const valid = snapshots.filter(s => s.investedValue != null);
  if (valid.length === 0) return null;

  // Universal logic for all ranges: prefer first at/after windowStart, fallback to nearest before
  const atOrAfter = valid
    .filter(s => s.timestamp >= windowStart)
    .sort((a, b) => a.timestamp - b.timestamp);
  if (atOrAfter.length > 0) return atOrAfter[0];

  const before = valid
    .filter(s => s.timestamp < windowStart)
    .sort((a, b) => b.timestamp - a.timestamp);
  return before[0] ?? null;
}
```

### File: `src/pages/PortfolioDetail.tsx`

The `computeRangeGain` function already passes `range` to `findBaseline`, which will now use the unified logic. No changes needed here -- it will automatically work with the 24h window.

## Why This Works

- There are snapshots going back to Jan 27, so "24 hours ago" will always find a baseline
- No timezone issues -- 24h is timezone-agnostic
- Same pattern as 1W and 1M, just a shorter window
- The chart will show a line from 24h ago to now, with the baseline anchor at the left and the live price at the right
- The gain/loss pill will show the change over the last 24 hours, matching the chart

## Files Summary

| File | Change |
|------|--------|
| `src/components/PortfolioGrowthChart.tsx` | Change 1D window to 24h ago; simplify `findBaseline` to use unified logic for all ranges |

