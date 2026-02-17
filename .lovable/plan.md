

# UI Redesign: Sidebar Navigation + Portfolio Detail Layout

## Overview
Replace the current "My Portfolios" grid page with a persistent left sidebar navigation. The sidebar lists all portfolios with at-a-glance gain/loss. Selecting a portfolio loads its detail view in the main content area. The AllocationChart component is removed entirely.

## Architecture Change

```text
BEFORE:
  / (Index) -> Grid of PortfolioCards -> /portfolio/:id (Detail page)

AFTER:
  / -> Redirect to first portfolio
  /portfolio/:id -> Sidebar + Detail (single layout)
```

## Files to Create

### 1. `src/components/AppSidebar.tsx`
New sidebar component matching the reference image:
- Top: N00B Portfolios logo + "Paper trading" subtitle
- "+ New portfolio" button (opens CreatePortfolioModal)
- "Search assets" button (placeholder for now)
- "Your portfolios" section: lists each portfolio as a nav item
  - Name on left, gain/loss badge on right (green/red)
  - Active portfolio highlighted with a border/background
  - Gain/loss calculated from `usePortfolioQuotes` metrics (unrealizedPL)
- "Account management" section: Profile, Settings, Membership links (non-functional placeholders)

### 2. `src/layouts/AppLayout.tsx`
New layout wrapper that renders:
- `SidebarProvider` wrapping the sidebar + main content
- `AppSidebar` on the left
- `<Outlet />` or children on the right
- Handles the CreatePortfolioModal state
- Provides portfolios data context to both sidebar and detail view

## Files to Modify

### 3. `src/App.tsx`
- Remove the `/` Index route
- Add redirect: `/` navigates to `/portfolio/:firstPortfolioId` (or a loading/empty state)
- Wrap `/portfolio/:id` route with `AppLayout`
- Remove Index page import

### 4. `src/pages/PortfolioDetail.tsx`
- Remove `Header` component usage (header is now in sidebar)
- Remove `AllocationChart` import and usage
- Remove the grid container that held AllocationChart alongside PerformanceDetails
- Make PerformanceDetails span full width
- Keep all existing logic (refresh, trade modal, delete, etc.) exactly the same
- Remove the back arrow link (no longer navigating "back" -- sidebar handles navigation)

### 5. `src/components/Header.tsx`
- Keep the component but simplify: remove the nav/create button since sidebar handles that
- Or remove entirely if the sidebar replaces all header functionality
- The reference image shows no top header bar -- the sidebar contains the branding

## Files to Delete

### 6. `src/components/AllocationChart.tsx`
- Delete entirely (per requirement)

### 7. `src/pages/Index.tsx`
- Delete entirely (replaced by sidebar navigation)

### 8. `src/components/PortfolioCard.tsx`
- Delete entirely (no longer used -- portfolios are listed in sidebar)

## Key Implementation Details

### Sidebar Portfolio Items
Each portfolio nav item will show:
- Portfolio name (left-aligned, truncated if long)
- Gain/loss pill (right-aligned): uses `unrealizedPL` from `usePortfolioQuotes`
- Format: arrow icon + dollar amount in green/red
- Active item gets a highlighted background (matching reference: subtle border/glow)

### Portfolio Data Flow
- `AppLayout` owns the `usePortfolios()` and `usePortfolioQuotes()` hooks
- Passes portfolios list to `AppSidebar` for rendering nav items
- `PortfolioDetail` continues to independently fetch its own detailed data (quotes, chart, etc.)
- No duplicate data fetching -- sidebar only needs summary metrics

### Routing
- `/` redirects to `/portfolio/:firstId` after portfolios load
- If no portfolios exist, show empty state with "Create Your First Portfolio" in main content
- Portfolio creation from sidebar navigates to the new portfolio's detail page

### Mobile Responsiveness
- Sidebar collapses on mobile (uses Shadcn sidebar collapsible behavior)
- A hamburger/trigger button appears in the top-left on mobile to open sidebar

### What Does NOT Change
- All backend logic, API calls, refresh intervals
- Trade modal, asset detail modal, dividend breakdown
- Chart component and its refresh behavior
- Performance calculations and metrics
- Holdings table structure and data formatting
- Recent transactions display
- Authentication flow

