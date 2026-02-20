

# Fallback Baseline When day_reference_value Is Missing

## Problem

Portfolios without a snapshot yet have no `day_reference_value` in `value_history`, so `getTodayBaseline` returns `null`. This causes the Today card, 1D hero pill, and sidebar badge to all show "---" even during market hours.

## Solution

Create a single enhanced baseline function in `AppLayout` that:
1. Prefers `day_reference_value` from the database (existing behavior)
2. Falls back to `cash + sum(shares * previousClose)` from live quotes when the DB value is missing

This enhanced function replaces `getTodayBaseline` everywhere it's passed, so all three consumers (sidebar, hero pill, Today card) automatically get the fallback.

## Changes

### 1. AppLayout.tsx -- create enhanced baseline with fallback

- Destructure `getPortfolioWithQuotes` from `usePortfolioQuotes` (currently only `getMetrics` is used)
- Create `getEffectiveTodayBaseline` callback that:
  - Returns DB baseline if available (via existing `getTodayBaseline`)
  - Otherwise computes `cash + sum(shares * previousClose)` from the quoted portfolio
  - Returns `null` only if neither source is available

```typescript
const getEffectiveTodayBaseline = useCallback((portfolioId: string): number | null => {
  const dbBaseline = getTodayBaseline(portfolioId);
  if (typeof dbBaseline === 'number' && Number.isFinite(dbBaseline) && dbBaseline > 0) {
    return dbBaseline;
  }

  // Fallback: cash + sum(shares * previousClose) from live quotes
  const pwq = getPortfolioWithQuotes(portfolioId);
  const source = pwq?.portfolio ?? portfolios.find(p => p.id === portfolioId);
  if (!source || source.holdings.length === 0) return null;

  let allHavePrevClose = true;
  const prevCloseTotal = source.holdings.reduce((sum, h) => {
    if (typeof h.previousClose === 'number' && h.previousClose > 0) {
      return sum + h.shares * h.previousClose;
    }
    allHavePrevClose = false;
    return sum;
  }, 0);

  if (!allHavePrevClose) return null;
  const fallback = source.cash + prevCloseTotal;
  return fallback > 0 ? fallback : null;
}, [getTodayBaseline, getPortfolioWithQuotes, portfolios]);
```

- Pass `getEffectiveTodayBaseline` instead of `getTodayBaseline` to:
  - `AppSidebar` (prop)
  - `Outlet` context

### 2. No other files change

- `AppSidebar`, `PerformanceSummary`, `PortfolioGrowthChart`, and `PortfolioDetail` all already consume `getTodayBaseline` -- they receive the enhanced version automatically through props/context.

## What stays the same

- DB baseline is always preferred when available
- All three consumers (sidebar badge, hero pill, Today card) use the same function, guaranteeing they match
- 1W / 1M / ALL ranges unaffected
- Chart hover scrubbing unaffected
- `refetchBaselines` still works (refetches DB baselines; fallback is always recomputed from live quotes)

## Edge cases

- If `previousClose` is missing for any holding (quotes not yet loaded), fallback returns `null` and UI shows "---" (safe)
- Once quotes load, the fallback becomes available and UI updates
- Once a snapshot is taken, the DB baseline takes over permanently

## Files modified

| File | Change |
|------|--------|
| `src/layouts/AppLayout.tsx` | Destructure `getPortfolioWithQuotes`, create `getEffectiveTodayBaseline`, pass it instead of `getTodayBaseline` |

