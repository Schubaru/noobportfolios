
# Fix Chart Percentage Bug, Sidebar Navigation, and Design

## Bug Fixes

### 1. Range Gain Percentage Shows ~0.00% (Critical)
In `PortfolioGrowthChart.tsx`, the percentage calculation returns a decimal (e.g., 0.003) instead of a percentage (e.g., 0.3). The `formatPercent()` function expects values already in percentage form.

**File**: `src/components/PortfolioGrowthChart.tsx`
- Line 189: Change `const pct = baselineCB > 0 ? gain / baselineCB : 0;` to `const pct = baselineCB > 0 ? (gain / baselineCB) * 100 : 0;`
- Line 237 (hover handler): Change `const pct = baselineCB > 0 ? gain / baselineCB : 0;` to `const pct = baselineCB > 0 ? (gain / baselineCB) * 100 : 0;`

### 2. Sidebar Navigation Not Working
The `SidebarMenuButton` component has built-in `data-active` styling and click behavior that conflicts with custom overrides.

**File**: `src/components/AppSidebar.tsx`
- Replace `SidebarMenuButton` for portfolio items with plain `div` elements that have direct `onClick` handlers
- This gives full control over click handling and active styling

### 3. Sidebar Design Updates

**File**: `src/components/AppSidebar.tsx`
- Convert "New portfolio" from a blue button to a plain nav-level item with "+" icon (matching "Search assets" style)
- Style active portfolio item with cream/white background and dark text
- Inactive items get subtle hover effect

**File**: `src/index.css`
- Add subtle blue radial gradient glow from top-left corner to `.glass-sidebar`:
  `background: radial-gradient(ellipse at 0% 0%, rgba(0, 200, 255, 0.07) 0%, transparent 60%), var(--sidebar-glass-bg);`

## Technical Details

### Percentage Fix
The `formatPercent` function does `value.toFixed(2)%`, so it expects input like `2.5` to produce `+2.50%`. The chart was passing `0.025` which displayed as `+0.03%`. Multiplying by 100 in both the range stats emitter and the hover handler fixes both the gain/loss pill and the hover tooltip.

### Navigation Fix
Portfolio items will use:
```
<div onClick={() => navigate(`/portfolio/${portfolio.id}`)} className={cn("cursor-pointer ...", isActive && "bg-[#f5f5f0] text-[#1a1a1a]")} />
```
This bypasses the `SidebarMenuButton` component entirely for portfolio list items only. Footer items (Profile, Settings, Membership) remain as `SidebarMenuButton` since they don't need active state management.

### Files Changed
- `src/components/PortfolioGrowthChart.tsx` -- fix percentage calculations (2 lines)
- `src/components/AppSidebar.tsx` -- fix navigation + redesign
- `src/index.css` -- add blue glow to glass-sidebar
