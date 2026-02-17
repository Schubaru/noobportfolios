
# Glassmorphism Sidebar Redesign

## Overview
Apply a glassmorphism effect to the sidebar to match the reference image: frosted glass background with subtle transparency, a soft border glow, and rounded corners creating a floating card appearance against the dark background.

## Visual Changes

### Sidebar Container
- Semi-transparent dark background with backdrop blur (frosted glass effect)
- Subtle border with slight opacity (appears as a soft glow)
- Rounded corners on the sidebar panel
- Remove the hard `border-r` in favor of the glass border effect

### CSS Variables Update
- Update `--sidebar-background` to use a semi-transparent value
- Add a custom glassmorphism utility class in `index.css`

### Active Portfolio Item
- White/light background with dark text (matching the reference where "new portfolio name" has a white pill)
- Rounded corners on the active item

## Technical Details

### Files Modified

**`src/index.css`**
- Update `--sidebar-background` CSS variable to a semi-transparent dark color
- Add a `.glass-sidebar` utility class with `backdrop-filter: blur(16px)`, semi-transparent background, and subtle border

**`src/components/AppSidebar.tsx`**
- Apply glassmorphism classes to the `Sidebar` component
- Update active portfolio item styling: white background with dark text (matching reference)
- Ensure the sidebar has rounded corners and the floating glass panel appearance

**`src/layouts/AppLayout.tsx`**
- Minor adjustment: ensure the sidebar trigger icon matches the reference (the collapse icon shown top-right of the sidebar header)

**`src/components/ui/sidebar.tsx`**
- Update the inner sidebar `div` to support the glassmorphism background (the `data-sidebar="sidebar"` element needs to allow transparent/blur backgrounds instead of opaque `bg-sidebar`)

### Specific Styling Values (matching reference)
- Background: `rgba(15, 17, 21, 0.75)` (dark with ~75% opacity)
- Backdrop blur: `blur(16px)`
- Border: `1px solid rgba(255, 255, 255, 0.08)` (subtle white glow)
- Border radius: `1rem` on the sidebar panel
- Active item: white background, dark text, rounded-lg
- Overall effect: sidebar appears as a floating frosted glass card
