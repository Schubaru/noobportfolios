
# Auth Screen Layout Redesign

## Overview

Updating the login and signup screens to match the reference designs, focusing purely on layout and structure changes while preserving existing typography tokens and colors.

## Current vs Target Comparison

| Element | Current Implementation | Target Design |
|---------|----------------------|---------------|
| Container | Card with glass effect + tabs | No card, clean centered stack |
| Navigation | Tabs to switch login/signup | Text links below CTA button |
| Logo | 64px height | Rounded square container (~80px) |
| Title | "N00B Portfolios" | "N00B Portfolios™" (with trademark) |
| Section header | None | "Sign in" / "Create account" label |
| Password toggle | Visible eye icon in input | Hidden (remove from view) |
| Login button text | "Log In" | "Login" |
| Signup button text | "Create Account" | "Create an account" |
| Secondary link | Part of tabs | Centered link below button |

## Changes Required

### File: `src/pages/Auth.tsx`

#### 1. Remove Card and Tabs wrapper

Replace the Card/Tabs structure with a simple centered flex container:
- Full viewport height, centered both axes
- Max-width constraint (~350px based on input widths)
- Consistent padding for mobile

#### 2. Update header section

```text
[Logo in rounded container]
        ↓ (spacing)
"N00B Portfolios™" (title with trademark)
        ↓ (small spacing)  
"Practice trading..." (tagline)
        ↓ (spacing)
"Sign in" or "Create account" (section header)
```

#### 3. Restructure form layout

**Login form:**
- Email address input (full width)
- Password input (full width, hide eye toggle)
- "Login" button (cyan, full width)
- "Create new account" link (centered, cyan text)

**Signup form:**
- Email address input
- Create password input
- Confirm password input
- "Create an account" button
- "Sign in" link

#### 4. State-based view switching

Replace tabs with a simple `isLogin` state boolean:
- When `isLogin === true`: Show login form
- When `isLogin === false`: Show signup form
- Toggle via the text links at bottom

#### 5. Input placeholder updates

| Field | Current | Target |
|-------|---------|--------|
| Login email | "you@example.com" | "Email address" |
| Login password | "••••••••" | "Password" |
| Signup email | "you@example.com" | "Email address" |
| Signup password | "At least 6 characters" | "Create password" |
| Signup confirm | "Confirm your password" | "Confirm password" |

#### 6. Hide password visibility toggle

Remove the eye/eye-off button from password inputs (or hide with CSS) to match the clean input design in reference.

---

## Layout Structure (Simplified JSX)

```text
<div className="min-h-screen bg-background flex items-center justify-center p-4">
  <div className="w-full max-w-[350px] flex flex-col items-center">
    
    {/* Logo container */}
    <div className="w-20 h-20 rounded-2xl bg-card flex items-center justify-center mb-6">
      <img src={logo} className="h-12 w-auto" />
    </div>
    
    {/* Title + tagline */}
    <h1 className="text-2xl font-bold text-center mb-2">N00B Portfolios™</h1>
    <p className="text-muted-foreground text-center mb-6">
      Practice trading with virtual money. No risk, real learning.
    </p>
    
    {/* Section header */}
    <h2 className="font-semibold text-center mb-6">
      {isLogin ? 'Sign in' : 'Create account'}
    </h2>
    
    {/* Form */}
    <form className="w-full space-y-4">
      {/* Inputs */}
      {/* CTA Button */}
    </form>
    
    {/* Secondary link */}
    <button className="text-primary mt-4">
      {isLogin ? 'Create new account' : 'Sign in'}
    </button>
    
  </div>
</div>
```

---

## Spacing Details (from reference)

- Logo to title: ~24px (mb-6)
- Title to tagline: ~8px (mb-2)
- Tagline to section header: ~24px (mb-6)
- Section header to first input: ~24px (mb-6)
- Between inputs: ~16px (space-y-4)
- Last input to button: ~16px
- Button to secondary link: ~16px (mt-4)

---

## Preserved Elements (No Changes)

- All color tokens (bg-background, text-primary, text-muted-foreground, etc.)
- Font family (Outfit)
- Font sizes and weights (existing classes)
- Input component styling (border, focus states)
- Button component styling (primary variant)
- Form validation logic
- Auth functions (signIn, signUp)
- Loading states and error handling
- Navigation after successful auth
- Redirect logic for already-authenticated users

---

## Edge Cases Handled

| Scenario | Handling |
|----------|----------|
| Mobile viewport | max-w-[350px] + p-4 padding keeps form comfortable |
| Loading state | Button shows spinner, inputs disabled (unchanged) |
| Error messages | Toast notifications continue working |
| Form validation | All existing validation preserved |
| Already logged in | useEffect redirect to "/" unchanged |

---

## Summary of Changes

1. **Remove**: Card wrapper, Tabs component, Label components, password visibility toggle
2. **Add**: Rounded logo container, section header ("Sign in"/"Create account"), trademark symbol
3. **Change**: Tab navigation → text link toggle, placeholder text, button labels
4. **Preserve**: All auth logic, validation, error handling, colors, fonts
