

# Fix 1D Baseline to Use Yesterday's Close

## The Correct Behavior (Robinhood-style)

1D shows **today's gain/loss relative to yesterday's closing portfolio value**. The chart line starts at $0 on the left (representing yesterday's close) and moves up/down showing how the portfolio performed today. Each new day, it resets.

## The Bug

`findBaseline` currently **prefers the first snapshot AT or AFTER `windowStart` (midnight)**. For 1D, this means it picks today's first snapshot as the baseline -- so the chart shows "change since this morning," not "change since yesterday's close." The gain/loss pill has the same issue since it calls the same function.

The fix: for 1D, always use the **last snapshot BEFORE midnight** as baseline (the "previous close" equivalent). For 1W, 1M, and ALL, the current logic (nearest snapshot to `windowStart`) is fine.

## Changes

### File: `src/components/PortfolioGrowthChart.tsx`

Update `findBaseline` to accept the range and change behavior for 1D:

```typescript
export function findBaseline(
  snapshots: SnapshotRow[],
  windowStart: number,
  range?: TimeRange
): SnapshotRow | null {
  const valid = snapshots.filter(s => s.investedValue != null);
  if (valid.length === 0) return null;

  // For 1D: always use the last snapshot BEFORE midnight (yesterday's close)
  if (range === '1D') {
    const before = valid
      .filter(s => s.timestamp < windowStart)
      .sort((a, b) => b.timestamp - a.timestamp);
    // If no snapshot before midnight, fall back to first available
    return before[0] ?? valid.sort((a, b) => a.timestamp - b.timestamp)[0] ?? null;
  }

  // For 1W/1M/ALL: prefer first snapshot at/after windowStart, fallback to nearest before
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

Update all call sites of `findBaseline` to pass the range:

1. In `filteredData` memo: `findBaseline(validSnapshots, windowStart, selectedRange)`
2. In `PortfolioDetail.tsx` `computeRangeGain`: `findBaseline(snapshots, windowStart, range)`

No other files need changes. The anchor point at `windowStart` with `investedPL: 0` and the "now" endpoint remain correct -- they just use yesterday's close as the zero reference instead of today's first snapshot.

## Why This Is Correct

- **Morning open**: Yesterday's last snapshot becomes baseline. First snapshot today shows overnight gap. Line shows full day's movement.
- **No snapshots yesterday**: Falls back to earliest available snapshot. Chart still works.
- **Gain/loss pill**: Uses same `findBaseline` with `range='1D'`, so pill matches chart endpoint.
- **1W/1M/ALL**: Unchanged behavior -- baseline is nearest snapshot to window start.

## Files Summary

| File | Change |
|------|--------|
| `src/components/PortfolioGrowthChart.tsx` | Add `range` param to `findBaseline`, use "before midnight" logic for 1D |
| `src/pages/PortfolioDetail.tsx` | Pass `range` to `findBaseline` in `computeRangeGain` |

