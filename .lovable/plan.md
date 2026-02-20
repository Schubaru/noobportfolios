

# Fix Sidebar Navigation + Show Today Performance

## Overview
Three changes: key-based remount for portfolio switching, new lightweight hook for today baselines, and sidebar badge update. Includes the two additions: scoped baseline query and explicit refetchBaselines after trades.

## File 1: `src/App.tsx`
- Import `useParams` from react-router-dom
- Add `PortfolioDetailKeyed` wrapper component that reads `useParams` and renders `<PortfolioDetail key={id} />`
- Change route line 63 from `<Route path=":id" element={<PortfolioDetail />} />` to `<Route path=":id" element={<PortfolioDetailKeyed />} />`

## File 2: `src/hooks/usePortfolioTodaySummary.ts` (NEW)
Lightweight hook that fetches latest `day_reference_value` per portfolio from `value_history`:
- Query scoped to last 3 days: `.gte('recorded_at', threeDaysAgo.toISOString())`
- Limited to `portfolioIds.length * 10` rows via `.limit()`
- Ordered by `portfolio_id, recorded_at DESC`
- Dedupes in JS (first row per portfolio_id = most recent)
- Exposes `getTodayBaseline(id) => number | null` and `refetchBaselines()`

## File 3: `src/layouts/AppLayout.tsx`
- Import and call `usePortfolioTodaySummary(portfolios.map(p => p.id))`
- Pass `getTodayBaseline` to `AppSidebar`
- Pass `refetchBaselines` down to `PortfolioDetail` via React Router `Outlet` context (or a simpler approach: make `AppLayout` accept a trade-complete callback that also calls `refetchBaselines`)

Since `Outlet` doesn't easily pass props, the cleanest approach: create a React context or use `Outlet context`. Use `<Outlet context={{ refetchBaselines }} />` and consume it in `PortfolioDetail` via `useOutletContext`.

## File 4: `src/pages/PortfolioDetail.tsx`
- Import `useOutletContext` from react-router-dom
- In `handleTradeComplete`, after existing refresh logic, call `refetchBaselines()` from outlet context

## File 5: `src/components/AppSidebar.tsx`
- Add `getTodayBaseline` prop to interface
- For each portfolio row: compute `equityNow = metrics?.totalValue`, `baseline = getTodayBaseline(portfolio.id)`, `todayDelta = equityNow - baseline` if both available
- Show green/red todayDelta or neutral dash when baseline unavailable

---

## Technical Details

### App.tsx changes (lines 5, 33-63)

Add `useParams` to import. Add wrapper before `App`:

```typescript
const PortfolioDetailKeyed = () => {
  const { id } = useParams<{ id: string }>();
  return <PortfolioDetail key={id} />;
};
```

Route line 63 becomes:
```typescript
<Route path=":id" element={<PortfolioDetailKeyed />} />
```

### usePortfolioTodaySummary.ts (new file)

```typescript
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const usePortfolioTodaySummary = (portfolioIds: string[]) => {
  const [baselines, setBaselines] = useState<Map<string, number>>(new Map());

  const fetchBaselines = useCallback(async () => {
    if (portfolioIds.length === 0) return;

    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const { data, error } = await supabase
      .from('value_history')
      .select('portfolio_id, day_reference_value, recorded_at')
      .in('portfolio_id', portfolioIds)
      .not('day_reference_value', 'is', null)
      .gte('recorded_at', threeDaysAgo.toISOString())
      .order('portfolio_id')
      .order('recorded_at', { ascending: false })
      .limit(portfolioIds.length * 10);

    if (error || !data) return;

    const map = new Map<string, number>();
    const seen = new Set<string>();
    for (const row of data) {
      if (!seen.has(row.portfolio_id)) {
        seen.add(row.portfolio_id);
        map.set(row.portfolio_id, Number(row.day_reference_value));
      }
    }
    setBaselines(map);
  }, [portfolioIds.join(',')]);

  useEffect(() => { fetchBaselines(); }, [fetchBaselines]);

  const getTodayBaseline = useCallback(
    (portfolioId: string): number | null => baselines.get(portfolioId) ?? null,
    [baselines]
  );

  return { getTodayBaseline, refetchBaselines: fetchBaselines };
};
```

### AppLayout.tsx changes

Add import, call hook, pass to sidebar and outlet context:

```typescript
import { usePortfolioTodaySummary } from '@/hooks/usePortfolioTodaySummary';
// ... in component body:
const { getTodayBaseline, refetchBaselines } = usePortfolioTodaySummary(portfolios.map(p => p.id));

// Sidebar gets getTodayBaseline prop
<AppSidebar
  portfolios={portfolios}
  getMetrics={getMetrics}
  getTodayBaseline={getTodayBaseline}
  onCreateClick={() => setIsCreateModalOpen(true)}
/>

// Outlet passes refetchBaselines
<Outlet context={{ refetchBaselines }} />
```

Import `Outlet` is already used (from react-router-dom).

### PortfolioDetail.tsx changes

```typescript
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';

// In component:
const { refetchBaselines } = useOutletContext<{ refetchBaselines: () => Promise<void> }>();

// In handleTradeComplete, add after existing lines:
const handleTradeComplete = async () => {
  const freshPortfolios = await fetchPortfolios();
  const freshPortfolio = freshPortfolios.find(p => p.id === id);
  await loadPortfolioData(true, freshPortfolio);
  setRefreshKey(k => k + 1);
  refetchBaselines(); // Update sidebar today badges
};
```

### AppSidebar.tsx changes

Update interface and badge logic:

```typescript
interface AppSidebarProps {
  portfolios: Portfolio[];
  getMetrics: (portfolioId: string) => PortfolioMetrics | undefined;
  getTodayBaseline: (portfolioId: string) => number | null;
  onCreateClick: () => void;
}

// In each portfolio row:
const metrics = getMetrics(portfolio.id);
const equityNow = metrics?.totalValue ?? null;
const baseline = getTodayBaseline(portfolio.id);
const hasTodayData = equityNow !== null && baseline !== null && baseline > 0;
const todayDelta = hasTodayData ? equityNow! - baseline! : null;
const isPositive = todayDelta !== null ? todayDelta >= 0 : true;

// Badge shows todayDelta or neutral dash
{hasTodayData && todayDelta !== null ? (
  <span className={cn(...)}>
    {isPositive ? <TrendingUp /> : <TrendingDown />}
    {isPositive ? '+' : ''}{formatCurrency(todayDelta)}
  </span>
) : (
  <span className="text-xs text-muted-foreground shrink-0 ml-2">—</span>
)}
```

## Files Summary

| File | Change |
|------|--------|
| `src/App.tsx` | Add `PortfolioDetailKeyed` with `key={id}` |
| `src/hooks/usePortfolioTodaySummary.ts` | New hook: scoped baseline query (last 3 days, limited rows) |
| `src/layouts/AppLayout.tsx` | Wire hook, pass to sidebar + outlet context |
| `src/pages/PortfolioDetail.tsx` | Call `refetchBaselines()` after trade |
| `src/components/AppSidebar.tsx` | Badge shows equity-based todayDelta |

