

## Add Terms of Service Page

### Changes

**1. New file: `src/pages/Terms.tsx`**

A standalone page with the full Terms of Service content. Styled with a centered container (max-w-3xl), matching the site's dark theme typography. Includes a back link to `/auth`. No auth required, no layout wrapper.

**2. Update: `src/App.tsx`**

Add a single public route `/terms` above the catch-all, importing the new Terms page.

**3. Update: `src/pages/Auth.tsx`**

Change the footer "Terms" link from `href="#"` to a React Router `<Link to="/terms">` so it navigates within the app. This requires importing `Link` from `react-router-dom` (already imported in the file via `useNavigate`).

### Technical Details

- **Route**: `/terms` -- public, no `ProtectedRoute` wrapper
- **Footer link**: Replace `<a href="#">Terms</a>` with `<Link to="/terms">Terms</Link>` using React Router
- **Page styling**: `min-h-screen bg-background text-foreground`, centered content column with `max-w-[720px]`, prose-like spacing using Tailwind classes (`space-y-6`, `leading-relaxed`)
- **Effective date**: Set to February 23, 2026 (current date)
- No new dependencies, global state, or layout changes

