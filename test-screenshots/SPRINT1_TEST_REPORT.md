# Sprint 1 Test Report

**Date:** 2026-07-24
**Tester:** Automated via Chrome DevTools
**User:** QA Tester (qa-tester@convoy.com)
**App URL:** http://localhost:5173

---

## Summary

| #   | Test Case                                  | Result  |
| --- | ------------------------------------------ | ------- |
| 1   | Home Page loads correctly                  | ✅ PASS |
| 2   | User Registration with validation          | ✅ PASS |
| 3   | User Login with validation                 | ✅ PASS |
| 4   | Session persistence across page reload     | ✅ PASS |
| 5   | Protected routes block unauthorized access | ✅ PASS |
| 6   | Map page with MapLibre GL JS               | ✅ PASS |
| 7   | Navigation between protected pages         | ✅ PASS |
| 8   | 404 page for invalid routes                | ✅ PASS |
| 9   | Responsive layout (mobile viewport)        | ✅ PASS |
| 10  | Logout clears session completely           | ✅ PASS |

**Overall: 10/10 PASS**

---

## Detailed Results

### 1. Home Page loads correctly ✅

- **URL:** `/`
- **Nav:** Convoy logo, Home, Login, Register (no authenticated links)
- **Content:** "Convoy Navigation Platform" heading, description text, "Get Started" → `/register`, "Sign In" → `/login`

### 2. User Registration with validation ✅

- **2a: Empty form** → HTML5 validation "Please fill in this field."
- **2b: Weak password** (no uppercase/number) → "Password must contain at least one uppercase letter"
- **2c: Password mismatch** → "Passwords do not match"
- **2d: Successful registration** → Created "QA Tester", auto-login, redirected to `/map`
- **2e: Duplicate email** → "Failed to create record." error shown

### 3. User Login with validation ✅

- **3a: Wrong credentials** → "Invalid email or password"
- **3b: Successful login** → Redirected to `/map`, "QA Tester" in nav

### 4. Session persistence across page reload ✅

- Hard reload (cache bypass) on `/map` → Still authenticated as "QA Tester"
- PocketBase auth token persisted in localStorage (`pocketbase_auth`)

### 5. Protected routes block unauthorized access ✅

- **Logout → /map** → Redirected to `/login`
- **Logout → /convoy** → Redirected to `/login`
- **Logout → /profile** → Redirected to `/login`
- localStorage confirmed cleared after logout

### 6. Map page with MapLibre GL JS ✅

- Map renders with OpenFreeMap tiles (OSM-based)
- Controls present: Zoom in/out, Reset bearing to north, Enter fullscreen
- Scale bar: "500 m"
- Attribution: MapLibre, OpenFreeMap, OpenMapTiles, OpenStreetMap

### 7. Navigation between protected pages ✅

- Map → Convoy → Profile: All pages load correctly within Layout shell
- Active page highlighting in nav bar (indigo underline for desktop)
- "QA Tester" name displayed in nav

### 8. 404 page for invalid routes ✅

- **URL:** `/nonexistent-page`
- Displays "404", "Page not found", description text, "Go back home" link → `/`

### 9. Responsive layout (mobile viewport) ✅

- **Mobile (375x667):** Hamburger menu replaces desktop nav
- Hamburger opens: Home, Map, Convoy, Profile + user name + Logout
- Bottom nav bar: Map, Convoy, Profile icons (fixed bottom)
- **Desktop (1280x720):** Full nav links, no hamburger, no bottom nav

### 10. Logout clears session completely ✅

- Click Logout → Redirected to `/login`
- `localStorage.getItem('pocketbase_auth')` → null (confirmed cleared)
- Direct navigation to `/map` → Blocked, redirected to `/login`
- Direct navigation to `/convoy` → Blocked, redirected to `/login`
- Direct navigation to `/profile` → Blocked, redirected to `/login`

---

## Bug Fixed During Testing

### Auth Guard: Logout not clearing localStorage

- **Root cause:** `pb.authStore.onChange()` was overriding the PocketBase SDK's built-in localStorage persistence handler
- **Fix:** Removed `pb.authStore.onChange()` listener; added explicit `localStorage.removeItem('pocketbase_auth')` in `logout()` and `refreshSession()` catch
- **Files:** `AuthProvider.tsx`, `ProtectedRoute.tsx`
