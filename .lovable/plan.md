

# Fix Portfolio Growth Snapshot Integrity and Time Relevance

## Problems Found

1. **ALL range uses cost basis instead of first snapshot**: `computeRangeGain` for ALL calculates `currentInvestedValue - costBasis`, but should use the first snapshot's invested value as baseline for consistency with the chart's first visible point.

2. **Daily snapshot check uses time-based threshold (20 hours) instead of calendar-day check**: The current logic (`ageMs >= TWENTY_HOURS`) can miss days or double-capture. Should check "does a snapshot exist for today's date?" instead.

3. **No deduplication guard**: Snapshots within 2 minutes of each other should be prevented (the current 5-second rate limit is too short for daily/trade sources).

4. **Range gain/loss doesn't match chart endpoints**: The gain/loss pill computes from raw snapshots while the chart filters by range cutoff -- these can diverge because `computeRangeGain` looks for baseline BEFORE the cutoff but the chart shows points AFTER the cutoff.

## Changes

### 1. Modify: `src/lib/snapshots.ts`

**Fix daily snapshot detection**
- Add a new function `hasSnapshotToday(portfolioId)` that queries for any snapshot where `recorded_at` falls within today's UTC date boundaries
- Replace the 20-hour threshold check in the page with this calendar-day check

**Add 2-minute deduplication for non-auto sources**
- Update `shouldCapture` to accept a `minMs` parameter and use 120000 (2 min) for trade/daily sources
- Add check in `capturePortfolioSnapshot` before inserting

### 2. Modify: `src/pages/PortfolioDetail.tsx`

**Fix `computeRangeGain` for ALL range**
- ALL range should use the first snapshot's invested value as baseline (not cost basis from current metrics)
- This ensures the gain/loss pill matches the difference between the first and last chart points

**Fix baseline consistency**
- For 1D/1W/1M: find the nearest snapshot at or before the cutoff timestamp
- Use that snapshot's `investedValue` as the denominator for percentage calculation
- Gain = `currentInvestedValue - baseline.investedValue`
- Percent = `gain / baseline.investedValue`

**Fix daily snapshot logic**
- Replace the 20-hour threshold with `hasSnapshotToday()` from snapshots.ts
- Ensure a snapshot is created immediately when the user opens the portfolio and none exists for today

### 3. Verify: `src/components/PortfolioGrowthChart.tsx`

No changes needed -- the chart already:
- Only displays real snapshot data (no synthetic points)
- Filters by range cutoff correctly
- Sorts ascending by timestamp
- Animates transitions smoothly
- Pauses updates during hover

## Technical Details

### New `hasSnapshotToday` function (snapshots.ts)

```typescript
export const hasSnapshotToday = async (portfolioId: string): Promise<boolean> => {
  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  const { data } = await supabase
    .from('value_history')
    .select('id')
    .eq('portfolio_id', portfolioId)
    .gte('recorded_at', startOfDay.toISOString())
    .lt('recorded_at', endOfDay.toISOString())
    .limit(1);

  return (data?.length ?? 0) > 0;
};
```

### Updated deduplication in `capturePortfolioSnapshot`

```typescript
// Before insert, check for recent snapshot (2 min for trade/daily)
if (source === 'trade' || source === 'daily') {
  const ok = await shouldCapture(portfolioId, 120_000);
  if (!ok) return;
}
```

### Fixed `computeRangeGain`

```typescript
function computeRangeGain(
  snapshots: SnapshotRow[],
  range: TimeRange,
  currentInvestedValue: number,
  costBasis: number
): { gain: number; percent: number } {
  if (snapshots.length === 0) return { gain: 0, percent: 0 };

  if (range === 'ALL') {
    // Use first snapshot as baseline for consistency with chart
    const sorted = [...snapshots]
      .filter(s => s.investedValue != null)
      .sort((a, b) => a.timestamp - b.timestamp);
    const first = sorted[0];
    if (!first) {
      const gain = currentInvestedValue - costBasis;
      return { gain, percent: costBasis > 0 ? gain / costBasis : 0 };
    }
    const gain = currentInvestedValue - (first.investedValue ?? 0);
    const baseVal = first.investedValue ?? 1;
    return { gain, percent: baseVal > 0 ? gain / baseVal : 0 };
  }

  const cutoff = Date.now() - RANGE_MS[range];
  const baseline = snapshots
    .filter(s => s.timestamp <= cutoff && s.investedValue != null)
    .sort((a, b) => b.timestamp - a.timestamp)[0];

  if (!baseline) {
    // Portfolio younger than range -- use first snapshot
    const sorted = [...snapshots]
      .filter(s => s.investedValue != null)
      .sort((a, b) => a.timestamp - b.timestamp);
    const first = sorted[0];
    if (!first) return { gain: 0, percent: 0 };
    const gain = currentInvestedValue - (first.investedValue ?? 0);
    const baseVal = first.investedValue ?? 1;
    return { gain, percent: baseVal > 0 ? gain / baseVal : 0 };
  }

  const gain = currentInvestedValue - (baseline.investedValue ?? 0);
  const baseVal = baseline.investedValue ?? 1;
  return { gain, percent: baseVal > 0 ? gain / baseVal : 0 };
}
```

### Updated daily snapshot effect (PortfolioDetail.tsx)

```typescript
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
| `src/lib/snapshots.ts` | Modify | Add `hasSnapshotToday`, add 2-min dedup for trade/daily |
| `src/pages/PortfolioDetail.tsx` | Modify | Fix `computeRangeGain` to use first snapshot for ALL, fix daily snapshot check |

