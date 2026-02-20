

# Unify Today Card with day_reference_value Baseline

## Overview

Replace the quote-based `metrics.dailyPL` logic in the Today card with the same `day_reference_value` baseline used by the 1D hero pill, guaranteeing an exact match.

## Changes

### 1. PerformanceSummary.tsx

**Add `todayBaseline` prop** to `PerformanceSummaryProps`:
```typescript
interface PerformanceSummaryProps {
  metrics: PortfolioMetrics;
  cash: number;
  startingCash: number;
  todayBaseline?: number | null;
}
```

**Replace daily PL variables** in `PerformanceDetails` (lines 90-96):
```typescript
export const PerformanceDetails = ({
  metrics, cash, startingCash, todayBaseline
}: PerformanceSummaryProps) => {
  const hasTodayBaseline = typeof todayBaseline === 'number'
    && Number.isFinite(todayBaseline) && todayBaseline > 0;
  const todayDelta = hasTodayBaseline ? metrics.totalValue - todayBaseline : null;
  const todayPct = hasTodayBaseline && todayBaseline! > 0
    ? (todayDelta! / todayBaseline!) * 100 : null;
  const hasTodayData = todayDelta !== null;
  const isTodayPositive = todayDelta !== null && todayDelta >= 0;
```

**Update the Today card** (lines 136-153) to use `todayDelta`, `todayPct`, `hasTodayData`, `isTodayPositive` instead of `metrics.dailyPL`, `metrics.dailyPLPercent`, `hasDailyData`, `isPositiveDaily`.

### 2. PortfolioDetail.tsx

Pass the baseline to PerformanceDetails (line 220):
```tsx
<PerformanceDetails
  metrics={metrics}
  cash={portfolio.cash}
  startingCash={portfolio.startingCash}
  todayBaseline={getTodayBaseline(portfolio.id)}
/>
```

`getTodayBaseline` is already available from the outlet context.

## What stays the same

- Hero pill 1D logic (already unified)
- Sidebar badges (already use day_reference_value)
- 1W / 1M / ALL ranges
- Chart hover scrubbing
- Old `calculateDailyPL` and `PortfolioMetrics` daily fields remain in code for now (cleanup deferred per request)

## Result

Hero pill (1D) and Today card both compute: `equity(now) - day_reference_value`. Exact match guaranteed.

## Files modified

| File | Change |
|------|--------|
| `src/components/PerformanceSummary.tsx` | Add `todayBaseline` prop, derive today delta from it instead of `metrics.dailyPL` |
| `src/pages/PortfolioDetail.tsx` | Pass `getTodayBaseline(portfolio.id)` to `PerformanceDetails` |

