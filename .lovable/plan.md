
# Robinhood-Style Portfolio Layout

## Overview

Restructure the portfolio detail page to match Robinhood's visual hierarchy: the "Investing" value and all-time change pill sit at the top, followed immediately by the chart (no card border, no title), then a labeled "Portfolio position" section containing the metric tiles.

## Changes

### 1. Modify: `src/components/PerformanceSummary.tsx`

Split this component into two parts:

**Part A -- `PerformanceHeader`** (new export from same file): Renders only the top "Investing" section:
- "INVESTING" label
- Large holdings value
- All-time change pill with percentage
- "No investments yet" empty state
- No card wrapper (no `glass-card`) -- just raw content so it flows into the chart

**Part B -- `PerformanceDetails`** (new export from same file): Renders the breakdown tiles under a "Portfolio position" heading:
- Section title: `<h2 className="text-lg font-semibold mb-4">Portfolio position</h2>`
- The 2x2/4-col grid: Total invested, Cash, Gain/Loss, Today
- The footer row: Buying Power, Realized P/L, Dividends
- Wrapped in `glass-card p-6`

Keep the existing `PerformanceSummary` default export for backward compatibility (renders both parts together), but export the two sub-components for use in `PortfolioDetail`.

### 2. Modify: `src/components/PortfolioGrowthChart.tsx`

Remove chart chrome:
- Remove the `glass-card p-6` wrapper div -- the chart will be placed inside the parent's card
- Remove the "Portfolio Growth" `<h2>` title and subtitle `<p>`
- Remove `YAxis` component entirely (no Y-axis labels/ticks)
- Keep the time range buttons, but move them to a standalone row above the chart area
- Keep tooltip, area fill, trade dots, hover handlers, animation
- Adjust left margin from 10 to 0 since there's no Y-axis
- Export `onMouseEnter`/`onMouseLeave` props or keep them on the outer div

### 3. Modify: `src/pages/PortfolioDetail.tsx`

Restructure the layout order:

```text
[Nav header + back button + trade button]

[glass-card]
  PerformanceHeader (INVESTING + change pill)
  [time range buttons]
  PortfolioGrowthChart (no card, no title, no Y-axis)
[/glass-card]

[Portfolio position section]
  <h2>Portfolio position</h2>
  PerformanceDetails (tiles + footer row)

[Holdings & Allocation grid]
[Recent Transactions]
```

- Wrap `PerformanceHeader` and `PortfolioGrowthChart` together in a single `glass-card p-6` div
- Replace the old `<PerformanceSummary>` with the two new sub-components placed in their respective positions
- The chart's hover handlers attach to the shared card container

## Technical Details

### PerformanceHeader component

```typescript
export const PerformanceHeader = ({ metrics, cash, startingCash }: PerformanceSummaryProps) => {
  // Renders only lines 21-41 of current PerformanceSummary:
  // - "INVESTING" label
  // - Large value
  // - All-time change pill
  // No wrapping card div
};
```

### PerformanceDetails component

```typescript
export const PerformanceDetails = ({ metrics, cash, startingCash }: PerformanceSummaryProps) => {
  // Renders the grid (lines 44-87) and footer (lines 90-108)
  // Wrapped in glass-card with "Portfolio position" heading
};
```

### PortfolioGrowthChart changes

- Remove outer `glass-card p-6` div -- replace with plain `<div>` for hover handlers
- Delete `<h2>Portfolio Growth</h2>` and subtitle `<p>`
- Delete entire `<YAxis ... />` element
- Update `AreaChart` margin to `{ top: 5, right: 10, left: 0, bottom: 0 }`
- Keep time range buttons row (renders above the chart area within the component)

### PortfolioDetail layout

```tsx
{/* Hero: Investing value + Chart */}
<div className="glass-card p-6 mb-6">
  <PerformanceHeader metrics={metrics} cash={portfolio.cash} startingCash={portfolio.startingCash} />
  <PortfolioGrowthChart
    portfolioId={portfolio.id}
    portfolioCreatedAt={portfolio.createdAt}
    snapshotKey={snapshotKey}
    currentUnrealizedPL={metrics.unrealizedPL}
  />
</div>

{/* Portfolio position */}
<div className="mb-6">
  <PerformanceDetails metrics={metrics} cash={portfolio.cash} startingCash={portfolio.startingCash} />
</div>
```

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/components/PerformanceSummary.tsx` | Modify | Split into PerformanceHeader + PerformanceDetails exports |
| `src/components/PortfolioGrowthChart.tsx` | Modify | Remove title, subtitle, Y-axis, card wrapper |
| `src/pages/PortfolioDetail.tsx` | Modify | Restructure layout order |
