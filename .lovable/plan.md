

# Revert Gain/Loss Card to All-Time Unrealized P/L

## Problem
The last edit made the Gain/Loss card in "Portfolio position" change based on the selected time range (1D/1W/1M/ALL). The user wants this card to always show the **all-time unrealized P/L** -- the total gain or loss on money currently invested, regardless of which range is selected.

The range-based gain should only appear in the pill under the "Investing" header, not in the Portfolio position section.

## Changes

### 1. `src/components/PerformanceSummary.tsx`
- Remove `rangeGain` from `PerformanceSummaryProps`
- Revert `PerformanceDetails` to use `metrics.unrealizedPL` directly for the Gain/Loss card
- Remove the `gainValue` variable, restore `isPositiveUnrealized` to use `metrics.unrealizedPL >= 0`

### 2. `src/pages/PortfolioDetail.tsx`
- Remove the `rangeGain={rangeGain}` prop from the `PerformanceDetails` component call

This is a direct revert of the last edit -- 2 small changes across 2 files.
