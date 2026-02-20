
# Wire "Search Assets" to the Existing Trade Modal

## Overview

Make the sidebar's "Search assets" button open the same TradeModal used elsewhere, starting at the asset search step, scoped to the currently active portfolio. One shared modal instance, no sidebar UI changes.

## Changes

### 1. AppSidebar.tsx -- add `onSearchClick` callback

- Add `onSearchClick: () => void` to the props interface
- Attach it as `onClick` on the existing "Search assets" div (line 56)
- No visual or layout changes

### 2. TradeModal.tsx -- add optional `initialStep` prop

- Add `initialStep?: TradeStep` to `TradeModalProps`
- In the `useEffect` that runs when `isOpen` changes (line 923-928), use `initialStep` to set the starting step:
  - If `initialSymbol` is provided: jump to details (existing behavior)
  - Else if `initialStep` is provided: use it (will be `'search'` for search assets)
  - Else: default to `'search'` (existing behavior)
- In `resetState`, reset step to `initialStep ?? 'search'`
- This is a no-op change for existing callers since the default is already `'search'`

### 3. AppLayout.tsx -- single shared TradeModal + state

- Add state: `tradeModalOpen: boolean` and `tradeInitialStep: TradeStep` (default `'search'`)
- Extract `fetchPortfolios` from `usePortfolios`
- Derive `activePortfolio = portfolios.find(p => p.id === id)`
- Pass `onSearchClick` to AppSidebar:
  - If `activePortfolio` exists: set `tradeInitialStep = 'search'`, open modal
  - If not: show toast "Open a portfolio to search and trade."
- Render ONE TradeModal (only when `activePortfolio` exists):
  - `isOpen={tradeModalOpen}`
  - `portfolio={activePortfolio}`
  - `initialStep={tradeInitialStep}`
  - `onTradeComplete`: calls `fetchPortfolios()` + `refetchBaselines()`, then closes modal
  - `onClose`: sets `tradeModalOpen = false`
- Pass `fetchPortfolios` + a `openTradeModal` callback through `Outlet context` so PortfolioDetail can also use the same modal instance (or keep its own -- both work since only one is open at a time)

### 4. PortfolioDetail -- no changes needed

PortfolioDetail already renders its own TradeModal. Since only one modal is open at a time, there's no conflict. After a sidebar-initiated trade, `fetchPortfolios()` updates the shared hook state, and PortfolioDetail picks up the refreshed data on next render.

## Edge Cases

- **No portfolio selected** (bare `/portfolio` route): toast message, no modal opens
- **Trade completion from search flow**: `fetchPortfolios()` + `refetchBaselines()` refresh sidebar totals and active portfolio view

## Files modified

| File | Change |
|------|--------|
| `src/components/AppSidebar.tsx` | Add `onSearchClick` prop, wire to "Search assets" onClick |
| `src/components/TradeModal.tsx` | Add optional `initialStep` prop, use in open/reset logic |
| `src/layouts/AppLayout.tsx` | Add trade modal state, derive active portfolio, render shared TradeModal, pass onSearchClick |
