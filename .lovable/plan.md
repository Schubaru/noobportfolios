

# Consolidate Profile + Settings into a Single Settings Menu

## What Changes

Merge the Profile popover contents (email display, sign out) into the Settings popover, then remove the Profile item entirely. The sidebar footer will have one entry: **Settings**.

## Settings Popover Contents (top to bottom)

1. **User email** -- muted, non-interactive, truncated
2. **Divider**
3. **Sign out** -- normal action, closes popover, signs out, navigates to `/`
4. **Delete account** -- destructive red, opens confirmation Dialog

## What Gets Removed

- `profileOpen` state
- `hoverTimeoutRef` ref
- All Profile hover helpers (`clearHoverTimeout`, `startCloseTimer`, `handleTriggerEnter/Leave`, `handleContentEnter/Leave`)
- The entire Profile `SidebarMenuItem` + `Popover` block (lines 203-236)
- `User` icon import (no longer used)

## What Gets Updated

- `handleLogout` updated to close `settingsOpen` instead of `profileOpen`
- Route-change `useEffect` simplified to only reset `settingsOpen`
- Cleanup `useEffect` simplified to only clear `settingsHoverRef`
- Settings popover content expanded to include email + sign out + divider + delete account

## Technical Details

**Single file changed**: `src/components/AppSidebar.tsx`

State after change:
- `settingsOpen` / `setSettingsOpen` -- controls the single Settings popover
- `deleteDialogOpen` / `setDeleteDialogOpen` -- controls the delete confirmation dialog
- `isDeleting` -- loading state for delete action
- `settingsHoverRef` -- hover delay ref for Settings

Settings popover content structure:
```
[email display - muted, select-none]
[divider]
[Sign out button - normal style with LogOut icon]
[Delete account button - destructive style with Trash2 icon]
```

No changes to the Delete Account dialog, edge function, or any other files.
