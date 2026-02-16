

# Fix Gain/Loss Math: Use Portfolio Value, Not Holdings Value

## Root Cause

The backend already returns two correct fields per point:
- `v` = portfolio_value (holdings + cash) -- stays flat when you buy stock
- `hv` = holdings_value (holdings only) -- jumps up when you buy stock

The frontend chart and header incorrectly use `hv` to compute gain/loss, so converting cash to holdings looks like profit.

## Changes

### 1. PortfolioGrowthChart.tsx -- Use `v` (portfolio_value) instead of `hv`

- Chart line plots `portfolioValue(t) - portfolioValue(start)` using `v` field, not `hv`
- Hover reports portfolio_value-based gain
- Add a new callback `onRangeStats` that emits the resting (non-hover) range gain/loss values computed from the first and last `v` points
- Tooltip shows portfolio_value at hovered point and P/L vs range start

ChartPoint changes:
```
investedPL = p.v - baselineV   (was: p.hv - baselineHV)
portfolioValue = p.v           (was: p.hv)
```

Hover gain:
```
gain = point.portfolioValue - baselineV   (portfolio_value diff, not holdings diff)
```

New `onRangeStats` callback fires when data loads:
```
rangeGain = lastPoint.v - firstPoint.v
rangeGainPct = rangeGain / firstPoint.v
```

### 2. PortfolioDetail.tsx -- Use range stats from chart for header

- Add state for `rangeStats` (gain, gainPercent) populated by the new `onRangeStats` callback
- Non-hover `displayGain` and `displayGainPercent` use `rangeStats` instead of `metrics.unrealizedPL`
- Hover still overrides from `hoverState` as before
- Guard: if rangeStats are unavailable, show 0

Current (wrong):
```
displayGain = metrics.unrealizedPL   // all-time unrealized, not range-based
displayGainPercent = unrealizedPL / costBasis  // cost basis based
```

Fixed:
```
displayGain = rangeStats.gain        // end.v - start.v for selected range
displayGainPercent = rangeStats.pct  // gain / start.v
```

### 3. PerformanceSummary.tsx -- No changes needed

Already receives `rangeGain` and `rangeGainPercent` as props and displays them. Just needs correct values passed in.

## Files Modified

1. `src/components/PortfolioGrowthChart.tsx` -- switch from `hv` to `v`, add `onRangeStats` callback
2. `src/pages/PortfolioDetail.tsx` -- wire `onRangeStats`, use range-based gain/loss for header

## What This Fixes

- Buying $9,000 of stock shows gain = $0 (cash decreased, holdings increased, portfolio_value unchanged)
- Chart line stays flat when no market movement occurs
- Range gain/loss reflects actual market movement only
- Hover scrubbing shows correct portfolio_value and P/L vs range start
- All ranges (1D/1W/1M/ALL) correctly compute end - start of portfolio_value

