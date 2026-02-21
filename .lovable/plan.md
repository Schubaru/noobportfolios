

# Settings Contextual Menu + Delete Account + Remove Membership

## Overview

Three changes: remove Membership from sidebar, convert Settings to a hover/tap Popover with "Delete account", and implement safe server-side account deletion via an edge function backed by CASCADE foreign keys.

## 1. Database Migration: Add Foreign Keys with ON DELETE CASCADE

Currently there are **no foreign keys** between tables. We'll add them so deleting portfolios automatically cascades to all child data, and deleting profiles is clean.

```sql
-- Portfolio-owned tables: cascade when portfolio is deleted
ALTER TABLE holdings
  ADD CONSTRAINT holdings_portfolio_id_fkey
  FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE;

ALTER TABLE holdings_history
  ADD CONSTRAINT holdings_history_portfolio_id_fkey
  FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE;

ALTER TABLE cash_history
  ADD CONSTRAINT cash_history_portfolio_id_fkey
  FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_portfolio_id_fkey
  FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE;

ALTER TABLE value_history
  ADD CONSTRAINT value_history_portfolio_id_fkey
  FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE;

ALTER TABLE income
  ADD CONSTRAINT income_portfolio_id_fkey
  FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE;

ALTER TABLE dividend_history
  ADD CONSTRAINT dividend_history_portfolio_id_fkey
  FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE;
```

This means the edge function only needs to delete `portfolios` (cascades all child data) and `profiles`, then delete the auth user.

## 2. New Edge Function: `supabase/functions/delete-account/index.ts`

**Security**: `verify_jwt = false` in config.toml (required by signing-keys system), but JWT is validated in code via `getClaims()`.

The function will:
1. Extract and validate JWT from Authorization header using `getClaims()`
2. Get `userId` from claims
3. Use a service-role client to:
   - `DELETE FROM portfolios WHERE user_id = userId` (cascades all child tables)
   - `DELETE FROM profiles WHERE user_id = userId`
   - `supabase.auth.admin.deleteUser(userId)`
4. Return `{ success: true }` or error

## 3. Config Update: `supabase/config.toml`

Add entry:
```toml
[functions.delete-account]
verify_jwt = false
```

## 4. Sidebar Changes: `src/components/AppSidebar.tsx`

**Remove**: Membership `SidebarMenuItem` (lines 218-223) and `CreditCard` import.

**Settings Popover** (same pattern as Profile):
- New state: `settingsOpen`, ref: `settingsHoverRef`
- Hover handlers (desktop only, guarded by `!isMobile`): identical pattern to Profile
- Close on route change (added to existing `useEffect`)
- Cleanup ref on unmount (added to existing `useEffect`)
- Popover content: single "Delete account" button in destructive red
- Positioning: `side={isMobile ? "top" : "right"}`

**Delete Account Dialog**:
- State: `deleteDialogOpen`, `isDeleting`
- Clicking "Delete account" in popover: closes popover, opens Dialog
- Dialog content:
  - Title: "Are you sure you want to delete your account?"
  - Description: "Deleting your account will erase all of your portfolio history."
  - Cancel button (outline) -- closes dialog
  - Delete account button (destructive) -- disabled + Loader2 spinner while deleting
- On confirm:
  1. `setIsDeleting(true)`
  2. `await supabase.functions.invoke('delete-account')`
  3. Close dialog + popover
  4. `await signOut()`
  5. `navigate('/')`

**New imports needed**:
- `Loader2, Trash2` from lucide-react
- `Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter` from `@/components/ui/dialog`
- `Button` from `@/components/ui/button`
- `supabase` from `@/integrations/supabase/client`
- `toast` from sonner

## Files Modified

| File | Change |
|------|--------|
| Database migration | Add ON DELETE CASCADE foreign keys on 7 portfolio-child tables |
| `supabase/functions/delete-account/index.ts` | New edge function for authenticated account deletion |
| `supabase/config.toml` | Add `[functions.delete-account]` entry |
| `src/components/AppSidebar.tsx` | Remove Membership, add Settings Popover + Delete Account dialog |

