
# Unify "Today" Calculation -- Logic-Only Refactor

## Problem

Three inconsistencies exist:

1. **Baseline fallback differs**: `AppLayout.getEffectiveTodayBaseline` uses a `previousClose` fallback that no other component shares. The chart uses `chartData[0]` as its 1D fallback. The user wants: `day_reference_value` first, then earliest-today DB snapshot, then null.

2. **`equityNow` source differs**: Sidebar uses `metrics.totalValue` (from `usePortfolioQuotes`, may be stale). `PerformanceDetails` also uses `metrics.totalValue`. The chart derives equity from edge-function data. These can diverge.

3. **No shared utility**: Each consumer computes its own delta/percent inline.

## Solution

### 1. New file: `src/lib/todayChange.ts`

Single utility with strict baseline priority and a unified result type:

```typescript
export interface TodayChangeResult {
  delta: number | null;
  percent: number | null;
  baseline: number | null;
}

export function computeTodayChange(
  currentValue: number | null | undefined,
  dayReferenceValue: number | null | undefined,
  earliestTodaySnapshot?: number | null
): TodayChangeResult

// Internal helper
function validPositive(v): number | null
```

- Priority: `dayReferenceValue` (DB) > `earliestTodaySnapshot` (DB) > null
- No `previousClose` fallback anywhere
- Returns all-nulls when no valid baseline or no currentValue

### 2. Expand hook: `src/hooks/usePortfolioTodaySummary.ts`

Add a second query to fetch the **earliest snapshot value from today** per portfolio as the fallback baseline. This data comes from `value_history.value` where `recorded_at >= today midnight ET`.

New return shape adds `getEarliestTodaySnapshot(portfolioId) => number | null`.

The hook will run both queries (day_reference_value + earliest today snapshot) in a single `fetchBaselines` call.

### 3. Simplify: `src/layouts/AppLayout.tsx`

**Remove** the entire `previousClose` fallback block in `getEffectiveTodayBaseline`. Replace with:

```typescript
const getEffectiveTodayBaseline = useCallback((portfolioId: string): number | null => {
  const { baseline } = computeTodayChange(null, getTodayBaseline(portfolioId), getEarliestTodaySnapshot(portfolioId));
  return baseline;
}, [getTodayBaseline, getEarliestTodaySnapshot]);
```

No more dependency on `getPortfolioWithQuotes` or `portfolios` for baseline computation.

Also expose `getPortfolioEquity(portfolioId)` via Outlet context so all children use the same live equity source (from `usePortfolioQuotes`). This is a thin wrapper:

```typescript
const getPortfolioEquity = useCallback((portfolioId: string): number | null => {
  const m = getLiveMetrics(portfolioId);
  return m ? m.totalValue : null;
}, [getLiveMetrics]);
```

Pass both `getPortfolioEquity` and `getEffectiveTodayBaseline` through Outlet context.

### 4. Update: `src/components/AppSidebar.tsx`

Import `computeTodayChange`. Replace the inline delta calculation:

```typescript
// Before (inline)
const equityNow = metrics?.totalValue ?? null;
const baseline = getTodayBaseline(portfolio.id);
const hasTodayData = equityNow !== null && baseline !== null && baseline > 0;
const todayDelta = hasTodayData ? equityNow! - baseline! : null;

// After (shared utility)
const today = computeTodayChange(metrics?.totalValue, getTodayBaseline(portfolio.id));
const todayDelta = today.delta;
const hasTodayData = todayDelta !== null;
```

The sidebar still gets `metrics.totalValue` from `getMetrics()` -- this is the same quote-refreshed value the layout computes. No change to the data source, just the calculation path.

### 5. Update: `src/components/PerformanceSummary.tsx` (PerformanceDetails)

Import `computeTodayChange`. Replace lines 125-131:

```typescript
// Before
const hasTodayBaseline = typeof todayBaseline === 'number' && ...
const todayDelta = hasTodayBaseline ? metrics.totalValue - todayBaseline! : null;
const todayPct = ...

// After
const today = computeTodayChange(metrics.totalValue, todayBaseline);
const todayDelta = today.delta;
const todayPct = today.percent;
const hasTodayData = todayDelta !== null;
const isTodayPositive = todayDelta !== null && todayDelta >= 0;
```

### 6. Update: `src/components/PortfolioGrowthChart.tsx`

For the 1D `startEquity` baseline, stop using `chartData[0]` as fallback. Instead use `dayReferenceValue` (already a prop) with a new prop `earliestTodaySnapshot` passed from `PortfolioDetail`:

```typescript
// Before
if (selectedRange === '1D' && dayReferenceValue > 0) return dayReferenceValue;
return chartData[0].equity;

// After
if (selectedRange === '1D') {
  const { baseline } = computeTodayChange(null, dayReferenceValue, earliestTodaySnapshot);
  return baseline ?? chartData[0].equity; // last resort: first chart point
}
return chartData[0].equity;
```

Add `earliestTodaySnapshot?: number | null` to the component props.

### 7. Update: `src/pages/PortfolioDetail.tsx`

- Pull `getEarliestTodaySnapshot` from Outlet context (new addition)
- Pass it to `PortfolioGrowthChart` as prop
- Pass it to `PerformanceDetails` as an additional prop for its fallback

Update Outlet context type to include `getEarliestTodaySnapshot`.

## Files Changed

| File | Change |
|------|--------|
| `src/lib/todayChange.ts` | **New** -- shared `computeTodayChange()` |
| `src/hooks/usePortfolioTodaySummary.ts` | Add earliest-today snapshot query |
| `src/layouts/AppLayout.tsx` | Remove previousClose fallback, add `getEarliestTodaySnapshot` + `getPortfolioEquity` to context |
| `src/components/AppSidebar.tsx` | Use `computeTodayChange()` |
| `src/components/PerformanceSummary.tsx` | Use `computeTodayChange()` |
| `src/components/PortfolioGrowthChart.tsx` | Add `earliestTodaySnapshot` prop, use `computeTodayChange()` for 1D baseline |
| `src/pages/PortfolioDetail.tsx` | Thread `getEarliestTodaySnapshot` to children |

## What Does NOT Change

- No UI/styling changes
- No database changes
- No edge function changes
- The `PortfolioMetrics.dailyPL` field remains but is unused for "Today" display
