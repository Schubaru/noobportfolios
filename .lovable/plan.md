

# Unified Window-Based Range Logic for Chart and Gain/Loss

## Overview

Align the chart, gain/loss pill, and tooltip so they all use the same window-based baseline logic. Ensure snapshots are created on portfolio open (not just on trades), so the chart always has data for portfolios with holdings.

## Problems in Current Code

1. **1D uses `now - 24h` instead of local midnight**: `RANGE_MS['1D']` is 86400000ms, so 1D filters from "24 hours ago" rather than "start of today".
2. **Chart shows absolute P/L** (`investedValue - costBasis`), not range-relative P/L. The tooltip and chart line should show change *since the window baseline*.
3. **No periodic snapshots on open**: Only a single "daily" snapshot is created per calendar day. If the user opens the portfolio hours later, there's no fresh data point, so the chart looks stale.
4. **Tooltip shows absolute P/L**: Should show "P/L since window start" for the selected range.
5. **X-axis domain uses `dataMin/dataMax`**: Should use the full window (`windowStart` to `now`) so 1D shows midnight-to-now even if data starts later.

## Changes

### 1. Modify: `src/lib/snapshots.ts`

- Expand `source` type to include `'baseline'`
- Add `ensureRecentSnapshot(portfolioId, portfolio, metrics)`: creates a snapshot if the last one is older than 15 minutes (source = `'baseline'`), rate-limited
- Keep `hasSnapshotToday` and `capturePortfolioSnapshot` as-is (they already work for trade/daily)

### 2. Modify: `src/components/PortfolioGrowthChart.tsx`

**Window start calculation**:
- 1D: local midnight today (`new Date().setHours(0,0,0,0)`)
- 1W: `now - 7 days`
- 1M: `now - 30 days`
- ALL: `0` (epoch, meaning all data)

**Baseline snapshot selection** (for chart P/L values):
- Find the snapshot closest to `windowStart`: prefer first snapshot at/after windowStart; if none, use nearest before
- All chart point values become `point.investedValue - baseline.investedValue` (range-relative)

**X-axis domain**:
- Set to `[windowStart, now]` instead of `['dataMin', 'dataMax']`
- This shows the full time window even if data only covers part of it

**Tooltip**:
- Show range-relative P/L: `point.investedValue - baseline.investedValue`

**Export `getWindowStart` utility** so the parent can use the same logic for gain/loss calculation.

### 3. Modify: `src/pages/PortfolioDetail.tsx`

**Fix `computeRangeGain`**:
- Use same `getWindowStart` function for consistency
- 1D baseline = snapshot nearest to local midnight
- 1W/1M baseline = snapshot nearest to `now - 7d/30d`
- ALL baseline = first snapshot
- `range_gain = currentInvestedValue - baseline.investedValue`
- `range_percent = range_gain / baseline.investedValue`

**Add baseline snapshot on open**:
- After prices are fetched, call `ensureRecentSnapshot` to create a snapshot if last one is > 15 minutes old
- Keep existing daily snapshot logic as-is (they complement each other)

## Technical Details

### `getWindowStart` function (exported from PortfolioGrowthChart or a shared util)

```typescript
export function getWindowStart(range: TimeRange): number {
  const now = Date.now();
  switch (range) {
    case '1D': {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }
    case '1W': return now - 7 * 24 * 60 * 60 * 1000;
    case '1M': return now - 30 * 24 * 60 * 60 * 1000;
    case 'ALL': return 0;
  }
}
```

### `findBaseline` function (used by both chart and parent)

```typescript
export function findBaseline(
  snapshots: SnapshotRow[],
  windowStart: number
): SnapshotRow | null {
  const valid = snapshots.filter(s => s.investedValue != null);
  if (valid.length === 0) return null;

  // Prefer first snapshot at or after windowStart
  const atOrAfter = valid
    .filter(s => s.timestamp >= windowStart)
    .sort((a, b) => a.timestamp - b.timestamp);
  if (atOrAfter.length > 0) return atOrAfter[0];

  // Fallback: nearest before windowStart
  const before = valid
    .filter(s => s.timestamp < windowStart)
    .sort((a, b) => b.timestamp - a.timestamp);
  return before[0] ?? null;
}
```

### Chart `filteredData` update

```typescript
const windowStart = getWindowStart(selectedRange);
const now = Date.now();
const baseline = findBaseline(validSnapshots, windowStart);
const baselineValue = baseline?.investedValue ?? 0;

const filtered = validSnapshots
  .filter(s => s.timestamp >= windowStart)
  .sort((a, b) => a.timestamp - b.timestamp);

return filtered.map((s): ChartPoint => ({
  timestamp: s.timestamp,
  investedPL: (s.investedValue ?? 0) - baselineValue,
  source: s.source,
}));
```

### X-axis domain

```typescript
<XAxis
  dataKey="timestamp"
  type="number"
  domain={[windowStart, now]}
  ...
/>
```

### Updated `computeRangeGain`

```typescript
function computeRangeGain(
  snapshots: SnapshotRow[],
  range: TimeRange,
  currentInvestedValue: number
): { gain: number; percent: number } {
  if (snapshots.length === 0) return { gain: 0, percent: 0 };

  const windowStart = getWindowStart(range);
  const baseline = findBaseline(snapshots, windowStart);
  if (!baseline || baseline.investedValue == null) return { gain: 0, percent: 0 };

  const gain = currentInvestedValue - baseline.investedValue;
  const pct = baseline.investedValue > 0 ? gain / baseline.investedValue : 0;
  return { gain, percent: pct };
}
```

### `ensureRecentSnapshot` (snapshots.ts)

```typescript
export const ensureRecentSnapshot = async (
  portfolioId: string,
  portfolio: Portfolio,
  metrics: PortfolioMetrics
): Promise<void> => {
  if (portfolio.holdings.length === 0) return;
  const age = await getLastSnapshotAge(portfolioId);
  // Create if no snapshots or last one > 15 min old
  if (age === null || age >= 15 * 60 * 1000) {
    await capturePortfolioSnapshot(portfolioId, portfolio, metrics, 'baseline');
  }
};
```

The `capturePortfolioSnapshot` source type needs to accept `'baseline'` in addition to existing values. Update its type signature to: `source: 'auto' | 'trade' | 'daily' | 'baseline'`.

For baseline snapshots, use the same 5-second rate limit as auto (not 2-minute).

### Updated daily snapshot effect (PortfolioDetail.tsx)

```typescript
// Ensure baseline snapshot on open (if last snapshot > 15 min)
useEffect(() => {
  if (id && hasFetchedPrices && portfolio && metrics) {
    ensureRecentSnapshot(id, portfolio, metrics);
  }
}, [id, hasFetchedPrices, portfolio, metrics]);

// Daily snapshot (once per calendar day)
useEffect(() => {
  if (id && hasFetchedPrices && portfolio && metrics && !dailySnapshotDoneRef.current) {
    dailySnapshotDoneRef.current = true;
    hasSnapshotToday(id).then(exists => {
      if (!exists && portfolio.holdings.length > 0) {
        capturePortfolioSnapshot(id, portfolio, metrics, 'daily');
      }
    });
  }
}, [id, hasFetchedPrices, portfolio, metrics]);
```

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/snapshots.ts` | Modify | Add `ensureRecentSnapshot`, expand source type to include `'baseline'` |
| `src/components/PortfolioGrowthChart.tsx` | Modify | Use window-based filtering, range-relative P/L, full window x-axis domain, export `getWindowStart` and `findBaseline` |
| `src/pages/PortfolioDetail.tsx` | Modify | Use `getWindowStart`/`findBaseline` in `computeRangeGain`, add `ensureRecentSnapshot` on open |

