

# Inline Time Range Controls with Unified Gain/Loss

## Overview

Lift the time range state out of the chart and into the parent, so a single set of range buttons controls both the gain/loss indicator under "INVESTING" and the chart data filtering.

## Changes

### 1. Modify: `src/components/PortfolioGrowthChart.tsx`

**Externalize range state**
- Accept `selectedRange` and `onRangeChange` as props instead of managing state internally
- Remove the `availableRanges` computation and range button rendering from this component
- Export the `TimeRange` type and `RANGE_MS` constant for use by siblings
- Keep all chart rendering, hover logic, animation, and stale-while-revalidate behavior unchanged

**Expose filtered snapshot data for gain/loss calculation**
- Add a new prop: `onDataReady?: (snapshots: SnapshotRow[]) => void`
- Call it whenever `validSnapshots` changes (the full unfiltered set), so the parent can compute range-specific gain/loss from the raw data

### 2. Modify: `src/components/PerformanceSummary.tsx`

**PerformanceHeader changes**
- Accept new props: `selectedRange`, `onRangeChange`, `availableRanges`, `rangeGain`, `rangeGainPercent`
- Replace the hardcoded "all-time" gain/loss pill with a dynamic one driven by `rangeGain` / `rangeGainPercent`
- Render the time range buttons inline, right-aligned on the same row as the gain/loss pill
- Replace the "all-time" label with the selected range label (e.g., "today", "past week", "past month", "all-time")
- Active button uses `variant="default"`, others use `variant="ghost"` (existing Button component)

**Layout structure:**
```
INVESTING
$X,XXX.XX
[Gain/Loss pill + range label]   [1D  1W  1M  ALL]
```

### 3. Modify: `src/pages/PortfolioDetail.tsx`

**Lift state up**
- Add `selectedRange` state (default `'1D'`)
- Add `chartSnapshots` state to receive raw snapshot data from chart's `onDataReady`
- Compute `availableRanges` based on `portfolio.createdAt`
- Compute `rangeGain` and `rangeGainPercent` from `chartSnapshots`:
  - ALL: current invested value minus cost basis (from metrics, same as before)
  - 1D: current invested P/L minus first snapshot of today's invested P/L
  - 1W: current invested P/L minus snapshot from 7 days ago
  - 1M: current invested P/L minus snapshot from 30 days ago
  - Baseline for percentage: the comparison snapshot's invested value
  - If no snapshot at exact boundary, use nearest earlier snapshot
- Pass `selectedRange`, `onRangeChange`, `availableRanges`, `rangeGain`, `rangeGainPercent` to `PerformanceHeader`
- Pass `selectedRange` and `onRangeChange` to `PortfolioGrowthChart`

## Technical Details

### Range gain/loss calculation

```typescript
function computeRangeGain(
  snapshots: SnapshotRow[],
  range: TimeRange,
  currentInvestedValue: number,
  costBasis: number
): { gain: number; percent: number } {
  if (range === 'ALL') {
    const gain = currentInvestedValue - costBasis;
    const pct = costBasis > 0 ? gain / costBasis : 0;
    return { gain, percent: pct };
  }

  const cutoff = Date.now() - RANGE_MS[range];
  // Find nearest snapshot at or before cutoff
  const baseline = snapshots
    .filter(s => s.timestamp <= cutoff && s.investedValue != null && s.costBasis != null)
    .sort((a, b) => b.timestamp - a.timestamp)[0];

  if (!baseline) {
    // Fall back to earliest snapshot
    const earliest = snapshots.find(s => s.investedValue != null);
    if (!earliest) return { gain: 0, percent: 0 };
    const baselinePL = (earliest.investedValue ?? 0) - (earliest.costBasis ?? 0);
    const currentPL = currentInvestedValue - costBasis;
    const gain = currentPL - baselinePL;
    const baseVal = earliest.investedValue ?? 1;
    return { gain, percent: baseVal > 0 ? gain / baseVal : 0 };
  }

  const baselinePL = (baseline.investedValue ?? 0) - (baseline.costBasis ?? 0);
  const currentPL = currentInvestedValue - costBasis;
  const gain = currentPL - baselinePL;
  const baseVal = baseline.investedValue ?? 1;
  return { gain, percent: baseVal > 0 ? gain / baseVal : 0 };
}
```

### Available ranges logic (moved from chart to parent)

```typescript
const availableRanges = useMemo((): TimeRange[] => {
  const ageDays = (Date.now() - portfolio.createdAt) / (24 * 60 * 60 * 1000);
  const ranges: TimeRange[] = ['1D'];
  if (ageDays >= 2) ranges.push('1W');
  if (ageDays >= 7) ranges.push('1M');
  ranges.push('ALL');
  return ranges;
}, [portfolio.createdAt]);
```

### Range label mapping

| Range | Label |
|-------|-------|
| 1D | today |
| 1W | past week |
| 1M | past month |
| ALL | all-time |

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/components/PortfolioGrowthChart.tsx` | Modify | Externalize range state, expose snapshot data via callback, remove range buttons |
| `src/components/PerformanceSummary.tsx` | Modify | Add inline range buttons and dynamic gain/loss to PerformanceHeader |
| `src/pages/PortfolioDetail.tsx` | Modify | Lift range state, compute range gain/loss, wire props |

