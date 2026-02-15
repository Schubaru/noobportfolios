

# Fix Gain/Loss Card to Match Selected Range

## Problem
The "Gain/Loss" card in "Portfolio position" always shows all-time unrealized P/L (`metrics.unrealizedPL`), while the pill under "Investing" shows range-based gain. When 1D is selected, these should match.

## Changes

### 1. `src/components/PerformanceSummary.tsx`
- Add optional `rangeGain?: number` to `PerformanceSummaryProps`
- In `PerformanceDetails`, use `rangeGain ?? metrics.unrealizedPL` for the Gain/Loss card value

### 2. `src/pages/PortfolioDetail.tsx`
- Pass `rangeGain` to the `PerformanceDetails` component on line 357-361:
```tsx
<PerformanceDetails
  metrics={metrics}
  cash={portfolio.cash}
  startingCash={portfolio.startingCash}
  rangeGain={rangeGain}
/>
```

This is a 2-line change across 2 files. The Gain/Loss card will always reflect whichever time range is currently selected, staying in sync with the pill.

