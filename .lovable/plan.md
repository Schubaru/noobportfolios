
## Update "Follow on X" link to open in new tab

The user wants the "Follow on X" link to open in a new tab since it leads to an external site. I will update the link in the authentication page footer.

### Changes

**1. Update `src/pages/Auth.tsx`**
- Find the "Follow on X" anchor tag in the footer.
- Add `target="_blank"` to open in a new tab.
- Add `rel="noopener noreferrer"` for security best practices when using `target="_blank"`.

### Technical Details
- File: `src/pages/Auth.tsx`
- Component: `Auth`
- Location: Footer section, line 239.
- Attributes to add: `target="_blank"`, `rel="noopener noreferrer"`.
