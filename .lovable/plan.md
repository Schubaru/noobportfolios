

# Add Profile Contextual Menu to Sidebar

## Overview

Replace the static "Profile" button in the sidebar footer with a controlled Popover that shows the user's email (disabled) and a Logout action. Desktop opens on hover, mobile toggles on tap. The Profile row never navigates anywhere.

## Changes

### AppSidebar.tsx (only file modified)

**New imports:**
- `useState`, `useRef`, `useEffect`, `useCallback` from React
- `useLocation` from `react-router-dom`
- `LogOut` from `lucide-react`
- `Popover`, `PopoverTrigger`, `PopoverContent` from `@/components/ui/popover`
- `useAuth` from `@/contexts/AuthContext`
- `useIsMobile` from `@/hooks/use-mobile`

**State and refs:**
- `profileOpen` / `setProfileOpen` -- controlled popover state
- `hoverTimeout` ref -- stores the delay timer so hovering from trigger to content doesn't flicker

**Profile row replacement (lines 120-125):**

The `SidebarMenuButton` becomes a `PopoverTrigger` wrapped in a `Popover`. It does NOT navigate anywhere -- it is purely a menu trigger.

```tsx
<Popover open={profileOpen} onOpenChange={setProfileOpen}>
  <PopoverTrigger asChild>
    <div
      className="flex items-center px-3 py-2 text-sm text-muted-foreground
                 hover:text-foreground rounded-lg cursor-pointer hover:bg-white/5
                 transition-colors"
      onMouseEnter={() => { /* desktop: open after clearing any pending close */ }}
      onMouseLeave={() => { /* desktop: start 150ms close timer */ }}
    >
      <User className="w-4 h-4 mr-2" />
      Profile
    </div>
  </PopoverTrigger>

  <PopoverContent
    side="right"
    align="end"
    className="w-56 p-2"
    onMouseEnter={() => { /* cancel close timer */ }}
    onMouseLeave={() => { /* start close timer */ }}
  >
    {/* Email -- non-interactive */}
    <div className="px-2 py-1.5 text-xs text-muted-foreground truncate select-none">
      {user?.email ?? 'Not signed in'}
    </div>
    <div className="h-px bg-border my-1" />
    {/* Logout */}
    <button
      onClick={handleLogout}
      className="flex items-center w-full px-2 py-1.5 text-sm rounded-md
                 hover:bg-destructive/10 text-destructive transition-colors"
    >
      <LogOut className="w-4 h-4 mr-2" />
      Log out
    </button>
  </PopoverContent>
</Popover>
```

**Hover logic (desktop only, guarded by `!isMobile`):**
- `onMouseEnter` on trigger: clear any pending close timeout, set `profileOpen = true`
- `onMouseLeave` on trigger: start a 150ms timeout to set `profileOpen = false`
- `onMouseEnter` on content: clear timeout (keeps menu open while cursor is inside)
- `onMouseLeave` on content: start 150ms close timeout

**Mobile:** Standard Popover tap behavior via `onOpenChange`. Hover handlers are no-ops.

**Logout handler:**
```tsx
const handleLogout = async () => {
  setProfileOpen(false);
  await signOut();
  navigate('/');
};
```

**Close on route change:**
```tsx
const location = useLocation();
useEffect(() => {
  setProfileOpen(false);
}, [location.pathname]);
```

**Cleanup on unmount:**
```tsx
useEffect(() => {
  return () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
  };
}, []);
```

## Safeguards confirmed

1. Profile row does NOT navigate -- it is a plain `div` acting as `PopoverTrigger`, no `onClick` navigation
2. Close behavior:
   - Outside click: Radix default
   - Escape key: Radix default
   - After Logout: explicit `setProfileOpen(false)`
   - On route change: `useEffect` on `location.pathname`
3. Settings and Membership rows are untouched

## Files modified

| File | Change |
|------|--------|
| `src/components/AppSidebar.tsx` | Replace Profile button with Popover menu (email + logout), add hover/tap logic, close on route change |

