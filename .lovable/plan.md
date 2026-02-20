

# Switch to Equity as Single Source of Truth

## Overview
Rewire the chart, hero number, and gain/loss pill to use **equity** (holdings + cash) instead of the current unrealized P/L delta logic. The backend already returns `v = hv + cash` on every point -- no backend changes needed.

All three tweaks from the approval are incorporated below.

---

## File 1: `src/components/PortfolioGrowthChart.tsx`

### Interface changes
- **`ChartPoint`**: Replace `unrealizedPLDelta` and `portfolioValue` with a single `equity` field.
- **`ChartHoverState`**: Rename `portfolioValue` to `equity`. Keep `gain`, `gainPercent`, `isHovering`.

### Chart data transformation (`chartData` useMemo)
- Map each backend point to `{ timestamp, equity: p.v }`.
- Remove all UPL baseline logic (`baselineUPL`, `firstWithHoldings`, cost-basis subtraction).

### `startEquity` (new useMemo)
- Derived from `chartData[0].equity` -- always the **earliest point returned by the API** for the selected range.
- Since `rangeConfig` already clamps the query window to `[rangeStart, now]`, the first returned point is guaranteed to be at or after rangeStart. No additional filtering needed, but guard against empty arrays.

### Range stats emitter (`onRangeStats` useEffect)
```
startEquity = chartData[0].equity
lastEquity  = chartData[chartData.length - 1].equity
gain = lastEquity - startEquity
pct  = startEquity > 0 ? (gain / startEquity) * 100 : 0
```

### Hover handler (`handleMouseMove`)
```
hoveredEquity = point.equity
gain = hoveredEquity - startEquity
pct  = startEquity > 0 ? (gain / startEquity) * 100 : 0
onHoverChange({ equity: hoveredEquity, gain, gainPercent: pct, isHovering: true })
```
Remove the special-case for `portfolioValue <= 0` (equity is always meaningful since cash exists from day one).

### Y-axis domain
Compute from `equity` values instead of UPL deltas.

### Area chart
- `dataKey` changes from `unrealizedPLDelta` to `equity`.
- Line color: positive if `lastEquity >= startEquity`, negative otherwise.

### Tooltip
Show equity value at the hovered point and the delta from `startEquity`.

### Cleanup
Remove `baselineUPL` useMemo, `firstHoldingsIndex` useMemo, and all cost-basis references.

---

## File 2: `src/components/PerformanceSummary.tsx`

### `PerformanceHeader`
- Rename prop `displayHoldingsValue` to `displayEquity`.
- Default big number (`shownValue`): use `displayEquity ?? metrics.totalValue` (single-source; `metrics.totalValue` already equals `holdingsValue + cash`).
- The `hasHoldings` guard stays (controls "no investments yet" message).

### `PerformanceDetails` (all-time cards)
- Rename "Invested" label to **"Holdings"** and show `metrics.holdingsValue` (current market value of positions) instead of `metrics.costBasis`.
- "Gain/Loss" card: show `metrics.totalValue - startingCash` (equity minus the fixed $10,000). This is the true all-time equity change.
- "Cash" and "Today" cards remain unchanged.

### Interface updates
- `PerformanceHeaderProps`: rename `displayHoldingsValue?: number` to `displayEquity?: number`.

---

## File 3: `src/pages/PortfolioDetail.tsx`

### State/type updates
- `ChartHoverState` import: uses the renamed `equity` field.
- `displayHoldingsValue` renamed to `displayEquity`:
  - When NOT hovering: `metrics.totalValue` (already = holdingsValue + cash, single source, recalculated immediately after trades via the existing forced-refresh flow).
  - When hovering: `hoverState.equity`.

### Props passed to `PerformanceHeader`
- `displayEquity` instead of `displayHoldingsValue`.

### `displayGain` / `displayGainPercent`
- No logic change needed -- these already come from `hoverState.gain` / `rangeStats.gain` which will now be equity-based thanks to the chart changes.

---

## What does NOT change
- Backend edge function (already returns `v = hv + cash`).
- `PerformanceDetails` timeframe scope (stays all-time).
- Trade flow / refresh logic.
- Auto-refresh intervals.

## Summary of the three requested tweaks

1. **Single-source equity**: Hero uses `metrics.totalValue` (computed once in `calculatePortfolioMetrics` as `cash + holdingsValue`). No manual addition of `portfolio.cash` anywhere. After trades, the existing forced-refresh flow recalculates `metrics` immediately.

2. **`startEquity` is earliest in-range point**: Defined as `chartData[0].equity` where `chartData` only contains points returned by the API (already range-clamped by `rangeConfig`).

3. **Rename fields to `equity`**: `ChartPoint.portfolioValue` and `ChartHoverState.portfolioValue` both become `equity`. No old-name compatibility aliases.

