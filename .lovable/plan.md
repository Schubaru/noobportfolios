

# Interactive Portfolio Value Line Chart

## Overview

This plan creates an interactive time-series chart showing total portfolio value over time using the **existing `value_history` data** stored in the database. The chart will feature hover/scrub interaction with real-time value updates, time range filtering, and graceful handling of limited data.

## Simplified Approach

Instead of fetching historical candles from Finnhub and reconstructing portfolio values, we'll:
- Use the `value_history` snapshots already stored in the database
- Add the current portfolio value as the latest data point
- Build an interactive UI on top of this existing data

This approach is:
- More reliable (no additional API calls that can fail)
- Faster (data already exists locally)
- Simpler to implement and maintain

## Implementation Plan

### Phase 1: Chart Header Component

**New file: `src/components/ChartHeader.tsx`**

Dynamic header that updates during hover:
- Large portfolio value display (e.g., "$12,450.32")
- Gain/loss amount and percentage vs range start
- Color changes: green for gains, red for losses
- Smooth transitions during scrubbing
- Resets to current value when hover ends

### Phase 2: Time Range Selector

**New file: `src/components/TimeRangeSelector.tsx`**

Horizontal toggle buttons:
- Options: 1D, 1W, 1M, 3M, YTD, 1Y, ALL
- Note: Removing "LIVE" since we don't have real-time streaming data
- Active state styling with primary color
- Mobile-responsive with horizontal scroll if needed

### Phase 3: Interactive Chart Component

**New file: `src/components/InteractivePortfolioChart.tsx`**

Main chart with hover interaction:

```
┌─────────────────────────────────────────────────────────────┐
│  <ChartHeader />                                            │
│  $12,450.32                                                 │
│  +$450.32 (+3.75%)                                         │
│                                                             │
│  ╭────────────────────────────────────────╮                 │
│  │                     ●────────          │ ← Single line   │
│  │              ╱─────╲       │           │                 │
│  │ ┊─────────────────────────────────────-│ ← Baseline      │
│  │            ╲_╱             │           │   (dotted)      │
│  ╰────────────────────────────────────────╯                 │
│                               ▲                             │
│                          Crosshair                          │
│                                                             │
│  <TimeRangeSelector />                                      │
│  [1D] [1W] [1M] [3M] [YTD] [1Y] [ALL]                      │
│                                                             │
│  "This shows how your portfolio's total value has           │
│   changed over time."                                       │
└─────────────────────────────────────────────────────────────┘
```

Key features:
- **Hover detection**: onMouseMove captures X position, finds nearest data point
- **Active dot**: Highlighted circle on the line at hover position
- **Vertical crosshair**: Dashed line from data point down
- **Baseline reference**: Horizontal dotted line at range start value
- **Dynamic gradient fill**: Green above baseline, red below
- **Touch support**: onTouchMove for mobile scrubbing

### Phase 4: Chart Data Hook

**New file: `src/hooks/usePortfolioChart.ts`**

Manages chart state and data filtering:

```typescript
Input: {
  valueHistory: ValueSnapshot[]
  currentValue: number
  timeRange: '1D' | '1W' | '1M' | '3M' | 'YTD' | '1Y' | 'ALL'
}

Output: {
  chartData: { timestamp: number, value: number, date: string }[]
  startValue: number
  currentValue: number
  absoluteChange: number
  percentChange: number
  isPositive: boolean
  hoverIndex: number | null
  setHoverIndex: (index: number | null) => void
}
```

Logic:
1. Filter `valueHistory` based on selected time range
2. Always append current portfolio value as latest point
3. Calculate start value (first point in filtered range)
4. Compute absolute and percent change
5. Manage hover state for interactive updates

### Phase 5: Integration

**Modify: `src/pages/PortfolioDetail.tsx`**

- Replace existing `<PortfolioChart>` with new `<InteractivePortfolioChart>`
- Pass portfolio data and current metrics
- The chart header replaces the "Total Value" card in MetricsGrid (avoid duplication)

---

## Technical Details

### Time Range Filtering

| Range | Filter Logic |
|-------|--------------|
| 1D    | Last 24 hours |
| 1W    | Last 7 days |
| 1M    | Last 30 days |
| 3M    | Last 90 days |
| YTD   | Since Jan 1 of current year |
| 1Y    | Last 365 days |
| ALL   | All available data |

### Hover Interaction Flow

```
User hovers/touches chart
    → onMouseMove / onTouchMove fires
    → Calculate X position relative to chart
    → Find nearest data point index
    → setHoverIndex(index)
    → ChartHeader re-renders with hovered point's value
    → Active dot + crosshair render at that position

User leaves chart
    → onMouseLeave fires
    → setHoverIndex(null)
    → ChartHeader shows current (latest) value
```

### Edge Cases

1. **New portfolios with 1-2 data points**
   - Always render chart, even with minimal data
   - Show flat or simple line connecting available points

2. **No data for selected range**
   - Fall back to showing all available data
   - Display message: "Limited data available for this range"

3. **All values are the same**
   - Render flat line at that value
   - Show 0% change, neutral gray color

### Visual Design

- Single smooth line (monotone interpolation)
- Gradient fill under line (green for gains, red for losses)
- Hidden Y-axis (values shown in header)
- Minimal X-axis with sparse date labels
- Subtle or hidden gridlines
- Glass-card tooltip styling (consistent with existing design)

---

## Files Summary

### New Files

| File | Purpose |
|------|---------|
| `src/components/ChartHeader.tsx` | Dynamic value display that updates on hover |
| `src/components/TimeRangeSelector.tsx` | Time range toggle buttons |
| `src/components/InteractivePortfolioChart.tsx` | Main chart with hover/scrub interaction |
| `src/hooks/usePortfolioChart.ts` | Chart data filtering and hover state management |

### Modified Files

| File | Changes |
|------|---------|
| `src/pages/PortfolioDetail.tsx` | Replace PortfolioChart, integrate new components |
| `src/components/MetricsGrid.tsx` | Remove Total Value card (now in chart header) |

### Files to Keep (No Changes)

- `src/components/PortfolioChart.tsx` - Can be deleted after migration, or kept as fallback
- All Edge Functions - No backend changes needed!

---

## Summary

This simplified approach:
- Uses existing `value_history` data (no new API calls)
- Creates a polished Robinhood-style interactive experience
- Supports time range filtering with smooth hover/scrub updates
- Handles edge cases gracefully
- Requires no backend changes

