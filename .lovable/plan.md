

# Fix 1D Chart: Center Flat Lines and Add Market-Closed Context

## Problem Analysis

The 1D chart IS rendering data -- the green line at the bottom is a flat line at $0.00 P/L. Two issues make it look broken:

1. **Y-axis domain not applied**: The `yDomain` is computed with proper padding ([-5, 5] for flat data) but never passed to a `<YAxis>` component. Recharts auto-scales the Y axis, pushing the flat line to the bottom edge instead of centering it.

2. **No user context**: When the market is closed and the line is flat, users think the chart is empty. A subtle indicator like "Market closed" or "Markets open at 9:30 AM ET" would clarify.

3. **Pill vs. Today card discrepancy**: The 1D pill uses snapshot-based comparison while the "Today" card uses Finnhub's `previousClose`. This is actually correct behavior -- they measure different things -- but when the market opens and new snapshots arrive, both will converge. No code change needed for this.

## Changes

### File: `src/components/PortfolioGrowthChart.tsx`

**1. Add a hidden YAxis with the computed domain**

Add a `<YAxis>` component that's hidden but enforces the computed `yDomain`. This centers the flat line vertically when all values are near zero.

```tsx
import { AreaChart, Area, XAxis, YAxis, Tooltip, ... } from 'recharts';

// Inside the AreaChart:
<YAxis
  domain={yDomain}
  hide
/>
```

**2. Show contextual message when line is flat (market closed)**

When all chart points have the same P/L value (flat line), show a subtle "Markets are closed" message overlaid on or below the chart, so users understand why there's no movement. This only shows when the data range is truly flat -- not when the chart is empty.

```tsx
const isFlat = filteredData.length >= 2 &&
  filteredData.every(d => d.investedPL === filteredData[0].investedPL);

// Render inside the chart container:
{isFlat && (
  <p className="text-center text-xs text-muted-foreground mt-1">
    Markets are closed -- your chart will update when trading resumes.
  </p>
)}
```

## Files Summary

| File | Change |
|------|--------|
| `src/components/PortfolioGrowthChart.tsx` | Add hidden `YAxis` with `yDomain`, add "markets closed" message for flat lines |

No changes to other files. The snapshot logic, baseline calculation, and gain/loss pill are all correct.

