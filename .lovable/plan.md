

## Add Privacy Policy Page

### Changes

**1. New file: `src/pages/Privacy.tsx`**

A standalone page mirroring the structure of `src/pages/Terms.tsx`. Same centered container (`max-w-[720px]`), same heading/section styling, same back link to `/auth`. Contains all 9 sections of the provided privacy policy text. Effective date set to February 23, 2026.

**2. Update: `src/App.tsx`**

Add a single public route `/privacy` next to the existing `/terms` route, importing the new Privacy component.

**3. Update: `src/pages/Auth.tsx`**

Change the footer "Privacy" link from `<a href="#">` to `<Link to="/privacy">` for in-app navigation.

### Technical Details

- Route `/privacy` is public (no `ProtectedRoute` wrapper), same as `/terms`
- Page component follows the exact same pattern as `Terms.tsx`: `min-h-screen bg-background text-foreground`, `max-w-[720px]` container, `space-y-8` sections, `ArrowLeft` back link
- Footer update: swap `<a href="#">Privacy</a>` to `<Link to="/privacy">Privacy</Link>` (Link is already imported in Auth.tsx)
- No new dependencies, no layout or state changes

