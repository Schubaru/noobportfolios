

# Fix Portfolio Performance Chart: Full-Width Time Axis

## Root Cause

Two issues cause the chart to collapse into a vertical line for 1W/1M:

1. **Missing `allowDataOverflow` on XAxis**: Recharts ignores the `domain` prop when data doesn't fill the domain unless `allowDataOverflow={true}` is set. Without it, the axis auto-shrinks to fit only the actual data points.

2. **~7,500 data points**: Auto-snapshots every 8 seconds create thousands of near-identical points. This overwhelms Recharts and provides no visual value. The data needs downsampling before rendering.

3. **`scale` should be `"time"`**: For proper time-axis behavior in Recharts, XAxis should use `scale="time"` alongside `type="number"`.

## Data Profile

The portfolio has snapshots on 4 days:
- Jan 27: 1 point (null invested_value)
- Jan 30: 1 point
- Feb 11: 2,906 points
- Feb 12: 4,597 points

For 1W (Feb 5 to Feb 12), all data is on Feb 11-12. The domain should show a full 7-day window with the line in the right portion -- but currently it collapses because Recharts ignores the domain.

## Changes

### Modify: `src/components/PortfolioGrowthChart.tsx`

**Fix 1 -- Add `allowDataOverflow` and `scale="time"` to XAxis**

```tsx
<XAxis
  dataKey="timestamp"
  type="number"
  scale="time"
  domain={[windowStart, windowEnd]}
  allowDataOverflow={true}
  ...
/>
```

This forces Recharts to respect the explicit domain even when data doesn't span the full window.

**Fix 2 -- Downsample data points**

Add a `downsample` function that limits rendered points to ~200 max. Algorithm:
- If data has <= 200 points, use as-is
- Otherwise, always keep first point, last point, and all trade-source points
- Distribute remaining budget evenly across the array by index stepping
- This preserves the shape of the line while drastically reducing render load

```typescript
function downsample(points: ChartPoint[], maxPoints = 200): ChartPoint[] {
  if (points.length <= maxPoints) return points;

  const result: ChartPoint[] = [];
  const step = (points.length - 1) / (maxPoints - 1);

  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round(i * step);
    result.push(points[idx]);
  }

  // Ensure trade dots are included
  const resultSet = new Set(result);
  for (const p of points) {
    if (p.source === 'trade' && !resultSet.has(p)) {
      result.push(p);
    }
  }

  return result.sort((a, b) => a.timestamp - b.timestamp);
}
```

Apply after filtering: `filteredData = downsample(filtered.map(...))`.

**Fix 3 -- Memoize windowStart/windowEnd**

Compute `windowStart` and `windowEnd` as memoized values used by both the `filteredData` computation and the XAxis domain, so they're consistent within a single render:

```typescript
const { windowStart, windowEnd } = useMemo(() => ({
  windowStart: getWindowStart(selectedRange),
  windowEnd: Date.now(),
}), [selectedRange]);
```

Pass these directly to `domain={[windowStart, windowEnd]}` instead of calling `getWindowStart` again in JSX.

**Fix 4 -- Hide XAxis (keep existing minimal style)**

The current design uses a hidden Y-axis and minimal chart. Keep `hide={true}` or `tick={false}` on XAxis to maintain the clean look -- the domain enforcement matters for scaling, not for visible tick labels.

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/components/PortfolioGrowthChart.tsx` | Modify | Add `allowDataOverflow`, `scale="time"`, downsample data, memoize window bounds |

No changes needed to `snapshots.ts` or `PortfolioDetail.tsx` -- the snapshot creation and gain/loss calculation logic is already correct.

