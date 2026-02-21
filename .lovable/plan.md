

# Fix: Unify equityNow + todayBaseline Inputs for "Today"

## Root Cause

The baseline source (`getEffectiveTodayBaseline`) is already shared correctly. The problem is the **equity input**:

- **Sidebar** uses `metrics.totalValue` from `usePortfolioQuotes` (AppLayout hook)
- **Card** uses `metrics.totalValue` from PortfolioDetail's **own** local `fetchMultipleQuotes` call -- a completely separate quote fetch that can return different prices
- These two equity values diverge, causing `computeTodayChange()` to return different results (or null vs a value)

## Fix (3 files, logic-only)

### 1. `src/pages/PortfolioDetail.tsx`

- Read `getPortfolioEquity` from Outlet context (already exposed by AppLayout)
- Compute `equityNow = getPortfolioEquity(portfolio.id)` once
- Pass `equityNow` to `PerformanceDetails` as a new prop
- Pass `equityNow` to the chart's `onRangeStats` calculation baseline (for 1D hero consistency)
- Add debug log: `console.log('[Hero] equityNow:', equityNow, 'todayBaseline:', getTodayBaseline(portfolio.id))`

### 2. `src/components/PerformanceSummary.tsx`

- Add optional `equityNow?: number | null` prop to `PerformanceSummaryProps`
- In `PerformanceDetails`, use `equityNow ?? metrics.totalValue` as the value passed to `computeTodayChange()`
- This way the card uses the same quote-refreshed equity as the sidebar
- Add debug log: `console.log('[Card] equityNow:', effectiveEquity, 'todayBaseline:', todayBaseline, 'delta:', today.delta)`

### 3. `src/components/AppSidebar.tsx`

- Add debug log (already partially there from previous work): `console.log('[Sidebar]', portfolio.name, 'equityNow:', metrics?.totalValue, 'todayBaseline:', getTodayBaseline(portfolio.id), 'delta:', today.delta)`
- No logic change needed -- sidebar already uses `metrics?.totalValue` from the shared `getMetrics()` which sources from `usePortfolioQuotes`

## Data Flow After Fix

```text
AppLayout
  usePortfolioQuotes -> getLiveMetrics(id).totalValue
                          |
          +---------------+---------------+
          |               |               |
      getMetrics()   getPortfolioEquity() |
          |               |               |
      Sidebar         PortfolioDetail     |
      (badge)         passes to:          |
                        - PerformanceDetails (card)
                        - debug log (hero)
```

All three consumers now use the same `usePortfolioQuotes`-derived equity value.

## What Does NOT Change

- No UI / styling changes
- No database or edge function changes
- Sidebar logic unchanged (already correct)
- Chart's own internal gain/loss calculation unchanged
- `computeTodayChange()` utility unchanged
- Baseline source unchanged

