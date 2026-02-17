
# Fix Sidebar Navigation + Match Reference Design

## Problem 1: Navigation Not Working
The `SidebarMenuButton` component has built-in click handling and styling via `data-active`. The current code passes `onClick` and custom className overrides that conflict with the component's internal behavior. The fix is to stop using `SidebarMenuButton` for portfolio items and use plain `div` elements instead, giving full control over click handling and styling.

## Problem 2: Design Mismatch
The sidebar needs to match the reference image more closely:
- "New portfolio" should be a nav-level text item with a "+" icon (not a blue button)
- Floating sidebar with rounded corners and subtle blue glow from top-left corner
- Active portfolio item has a white/cream background with dark text and rounded corners
- Clean, minimal spacing

## Files to Modify

### `src/components/AppSidebar.tsx`
- Replace `SidebarMenuButton` for portfolio items with plain clickable `div` elements to fix navigation
- Change "New portfolio" from a blue button to a plain nav-level item (just text with "+" icon, like "Search assets")
- Style active portfolio item: white/cream background, dark text, rounded-lg
- Inactive items: transparent with subtle hover

### `src/index.css`
- Update `.glass-sidebar` to add a subtle blue radial gradient glow from the top-left corner
- Use a pseudo-element or background gradient overlay for the glow effect:
  - `background: radial-gradient(ellipse at top left, rgba(0, 200, 255, 0.06) 0%, transparent 50%), var(--sidebar-glass-bg)`

### `src/components/ui/sidebar.tsx`
- Ensure the floating sidebar variant applies proper margin/padding so it looks truly "floating" with space around it

## Detailed Changes

### AppSidebar.tsx
- "New portfolio" becomes: `<div onClick={onCreateClick} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-white/5 rounded-lg"><Plus /> New portfolio</div>`
- Portfolio items become plain divs with direct onClick handlers instead of SidebarMenuButton
- Active item: `bg-[#f5f5f0] text-[#1a1a1a] font-semibold rounded-lg` (cream/white pill matching reference)
- Gain/loss text on active items uses darker green/red for contrast against white background

### index.css - glass-sidebar update
- Add blue glow gradient: `radial-gradient(ellipse at 0% 0%, rgba(0, 200, 255, 0.07) 0%, transparent 60%)`
- Keep existing blur and border properties
