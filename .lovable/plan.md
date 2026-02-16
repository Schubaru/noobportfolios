

# Remove Refresh Button from My Portfolios Page

## What Changes

Remove the manual refresh button (the spinning arrows icon) from the top-right of the "My portfolios" page. The auto-refresh system (30s interval) already handles price updates automatically, so the manual button is unnecessary.

## Technical Details

**File: `src/pages/Index.tsx`**

- Remove the `RefreshCw` icon import (line 1 area)
- Remove the refresh button block (lines 71-80)
- Remove the "Updated ..." timestamp display (lines 64-68) since it was tied to the manual refresh UX
- Clean up unused destructured values from `usePortfolioQuotes`: remove `isRefreshing`, `lastUpdated`, and `refresh` if no longer referenced

