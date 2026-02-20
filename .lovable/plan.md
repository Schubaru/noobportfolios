
# Unify 1D Performance with day_reference_value

## Overview

When the 1D range is selected, the hero performance pill will use `day_reference_value` (previous close equity) as its baseline instead of the first chart point. This makes the 1D pill match brokerage-standard "change since previous close" and aligns with the sidebar badges.

## Baseline source confirmation

Both the **sidebar badges** and this new **1D chart baseline** will use the exact same origin: `value_history.day_reference_value`, fetched by `usePortfolioTodaySummary`. This column is computed in `snapshot-portfolio` as `sum(shares * prevClose) + cash`.

The **Today card** in Portfolio Position uses `calculateDailyPL(holdings)` which computes `sum((currentPrice - previousClose) * shares)` -- a holdings-only delta. Mathematically, `equity(now) - day_reference_value = (holdingsValue + cash) - (prevCloseHoldings + cash) = holdingsValue - prevCloseHoldings`, which equals `calculateDailyPL` when cash hasn't changed since the snapshot. After intraday trades, a small divergence is possible since cash shifts between the snapshot baseline and current state. Both approaches are valid; they simply measure from slightly different reference points. The 1D pill and sidebar badge will be guaranteed identical since they share the same `day_reference_value` origin.

## Changes

### 1. PortfolioGrowthChart.tsx -- add `dayReferenceValue` prop with strict check

- Add optional prop `dayReferenceValue?: number | null`
- Destructure it in the component params
- Update the `startEquity` memo:

```typescript
const startEquity = useMemo(() => {
  if (chartData.length === 0) return 0;
  if (
    selectedRange === '1D' &&
    typeof dayReferenceValue === 'number' &&
    Number.isFinite(dayReferenceValue) &&
    dayReferenceValue > 0
  ) {
    return dayReferenceValue;
  }
  return chartData[0].equity;
}, [chartData, selectedRange, dayReferenceValue]);
```

- All downstream (rangeStats, hover gain, tooltip delta, line color) already reference `startEquity`, so they pick up the corrected baseline automatically
- 1W, 1M, ALL are completely unaffected

### 2. AppLayout.tsx -- pass `getTodayBaseline` through Outlet context

- Line 125: add `getTodayBaseline` to the context object:
  ```
  <Outlet context={{ refetchBaselines, fetchPortfolios, getTodayBaseline }} />
  ```

### 3. PortfolioDetail.tsx -- wire it up

- Update the `useOutletContext` type and destructuring to include `getTodayBaseline`:
  ```typescript
  const { refetchBaselines, getTodayBaseline } = useOutletContext<{
    refetchBaselines: () => Promise<void>;
    getTodayBaseline: (portfolioId: string) => number | null;
  }>();
  ```
- Pass the baseline to the chart:
  ```tsx
  <PortfolioGrowthChart
    portfolioId={portfolio.id}
    refreshKey={refreshKey}
    selectedRange={selectedRange}
    onHoverChange={handleHoverChange}
    onRangeStats={setRangeStats}
    dayReferenceValue={getTodayBaseline(portfolio.id)}
  />
  ```

## What stays the same

- 1W, 1M, ALL ranges use first chart point (unchanged)
- Today card in Portfolio Position (unchanged -- uses `calculateDailyPL`)
- Sidebar badges (unchanged -- already use `day_reference_value`)
- Chart rendering, hover, tooltip layout (unchanged)
- If `day_reference_value` is missing/invalid, falls back to `chartData[0].equity`

## Files modified

| File | Change |
|------|--------|
| `src/components/PortfolioGrowthChart.tsx` | Add `dayReferenceValue` prop, strict numeric check in `startEquity` memo |
| `src/layouts/AppLayout.tsx` | Add `getTodayBaseline` to Outlet context |
| `src/pages/PortfolioDetail.tsx` | Destructure `getTodayBaseline` from context, pass to chart |
