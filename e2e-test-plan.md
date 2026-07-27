# E2E Test Plan — Real-Time Convoy Navigation & Communication Platform

**Project:** Real-Time Convoy Navigation & Communication Platform
**Scope:** Full-stack end-to-end verification post-Sprint 5
**Environment:** Local development (Docker + Vite dev server)
**Created:** 2026-07-26
**Last Updated:** 2026-07-27

---

## Test Board

**Dashboard:** [e2e-test-board.html](https://ragavellur.github.io/convoy-navigation-platform/e2e-test-board.html)

### Current Status

| Category                 | Total  | Passed | Failed | Pending |
| ------------------------ | ------ | ------ | ------ | ------- |
| Infrastructure Smoke     | 6      | 6      | 0      | 0       |
| Authentication Flow      | 6      | 6      | 0      | 0       |
| Map & Search             | 10     | 10     | 0      | 0       |
| Convoy Lifecycle         | 10     | 10     | 0      | 0       |
| Real-Time Position       | 8      | 8      | 0      | 0       |
| Roster & UI              | 11     | 11     | 0      | 0       |
| Voice & Chat             | 10     | 0      | 0      | 10      |
| Multi-Browser Concurrent | 3      | 3      | 0      | 0       |
| Edge Cases               | 6      | 6      | 0      | 0       |
| Browser Support          | 5      | 0      | 0      | 5       |
| **Total**                | **75** | **60** | **0**  | **15**  |

---

## 1. Infrastructure Smoke Tests

| ID  | Test                             | Steps                                     | Expected Result        | Sprint    |
| --- | -------------------------------- | ----------------------------------------- | ---------------------- | --------- |
| I-1 | All Docker containers running    | `docker-compose ps`                       | All 4 services healthy | TASK-005  |
| I-2 | PocketBase admin accessible      | `curl http://localhost:8090/_/`           | HTTP 200               | TASK-004  |
| I-3 | OSRM responds                    | `curl http://localhost:5001/health`       | HTTP 200               | TASK-012  |
| I-4 | Nominatim responds               | `curl http://localhost:8080/status`       | Status: ready          | TASK-011  |
| I-5 | Redis responds                   | `docker exec convoy-redis redis-cli ping` | PONG                   | TASK-005D |
| I-6 | All PocketBase collections exist | Admin API: list collections               | 7+ collections         | TASK-006  |

---

## 2. Authentication Flow

| ID  | Test                     | Steps                                  | Expected Result                           | Sprint   |
| --- | ------------------------ | -------------------------------------- | ----------------------------------------- | -------- |
| A-1 | Register new user        | Fill name/email/password form → Submit | Redirects to `/map`, user appears in nav  | TASK-007 |
| A-2 | Login existing user      | Enter credentials → Submit             | Redirects to `/map`, session created      | TASK-008 |
| A-3 | Logout                   | Click Logout button                    | Returns to `/`, nav shows Login/Register  | TASK-008 |
| A-4 | Protected route redirect | Visit `/map` unauthenticated           | Redirects to `/login?redirect=/map`       | TASK-003 |
| A-5 | Session persistence      | Login → Refresh page                   | Still authenticated (JWT in localStorage) | TASK-009 |
| A-6 | Duplicate registration   | Register with existing email           | Error message displayed                   | TASK-007 |

---

## 3. Map & Search

| ID   | Test                       | Steps                                     | Expected Result                                        | Sprint   |
| ---- | -------------------------- | ----------------------------------------- | ------------------------------------------------------ | -------- |
| M-1  | Map renders                | Navigate to `/map`                        | MapLibre GL canvas visible, zoom controls present      | TASK-013 |
| M-2  | GPS centering              | Grant location permission                 | Map flies to user's current location                   | TASK-040 |
| M-3  | Place search               | Type in search box                        | Dropdown shows Nominatim autocomplete results          | TASK-027 |
| M-4  | Route calculation          | Click a search result                     | Route line drawn on map, panel shows distance/duration | TASK-028 |
| M-5  | Route caching              | Search same route twice                   | Second load served from PocketBase cache               | TASK-030 |
| M-6  | Alternative routes         | Calculate route with alternatives enabled | Route selector shows multiple options                  | TASK-029 |
| M-7  | Traffic segments           | Calculate any route                       | Color-coded traffic overlay (green→red)                | TASK-029 |
| M-8  | Off-route detection        | Move position 50m+ from route             | Warning banner appears, route recalculates             | TASK-029 |
| M-9  | Location permission denied | Deny location access                      | Permission prompt shown with retry button              | TASK-048 |
| M-10 | Console clean              | Open browser console on `/map`            | Zero errors or warnings                                | TASK-042 |

---

## 4. Convoy Lifecycle

| ID   | Test                      | Steps                                     | Expected Result                                | Sprint   |
| ---- | ------------------------- | ----------------------------------------- | ---------------------------------------------- | -------- |
| C-1  | Create convoy             | Go to `/convoy` → Create                  | Convoy listed with 6-char code                 | TASK-031 |
| C-2  | Join by code              | Enter code in Join field → Submit         | Navigated to convoy detail, member listed      | TASK-031 |
| C-3  | Deep link generation      | Open convoy detail → Copy Link            | URL contains code and trip_id params           | TASK-029 |
| C-4  | Deep link join (auth'd)   | Open deep link in new tab while logged in | Auto-joins convoy, redirects to map            | TASK-031 |
| C-5  | Deep link join (unauth'd) | Open deep link while logged out           | Redirects to `/login?redirect=/join?code=...`  | TASK-031 |
| C-6  | Vehicle registration      | Open convoy detail → Add Vehicle          | Select type → Submit → Vehicle shown on member | TASK-032 |
| C-7  | Host remove member        | Host clicks remove on a member            | Member status changes to "kicked"              | TASK-034 |
| C-8  | End session               | Host clicks End Session                   | Convoy status → "ended", all members inactive  | TASK-035 |
| C-9  | Share via WhatsApp        | Click WhatsApp share button               | Opens WhatsApp with pre-filled invite link     | TASK-037 |
| C-10 | Share via email           | Click Email share button                  | Opens email client with convoy details         | TASK-037 |

---

## 5. Real-Time Position Tracking

| ID  | Test                    | Steps                                | Expected Result                                              | Sprint   |
| --- | ----------------------- | ------------------------------------ | ------------------------------------------------------------ | -------- |
| P-1 | Position publish        | Join convoy → Open map → Grant GPS   | Position record created in PocketBase `positions` collection | TASK-039 |
| P-2 | Position subscribe      | Second browser joins same convoy     | First browser sees second member's marker appear             | TASK-039 |
| P-3 | Marker animation        | Member moves position                | Marker smoothly transitions (LERP) to new position           | TASK-043 |
| P-4 | Marker rotation         | Member has heading data              | Marker icon rotates to match heading                         | TASK-045 |
| P-5 | Velocity vector         | Member moving > 0.5 m/s with heading | Directional line extends from marker in heading direction    | TASK-045 |
| P-6 | Heartbeat broadcast     | Stay idle for 10s in convoy mode     | New position records every 5 seconds                         | TASK-046 |
| P-7 | Position fetch on join  | Join convoy with existing members    | All member markers appear immediately                        | TASK-046 |
| P-8 | Multiple convoy members | 3 browsers join same convoy          | All 3 markers visible, all animate independently             | TASK-044 |

---

## 6. Roster & UI (Sprint 5)

| ID   | Test                          | Steps                                          | Expected Result                                       | Sprint   |
| ---- | ----------------------------- | ---------------------------------------------- | ----------------------------------------------------- | -------- |
| R-1  | Roster sidebar renders        | Join convoy → Navigate to /map → Check sidebar | Sidebar shows convoy members with avatars             | TASK-049 |
| R-2  | Roster drawer expand/collapse | Click expand button on roster sidebar          | Sidebar expands to show full member details           | TASK-050 |
| R-3  | Vehicle type icon in roster   | Check roster member with vehicle               | Correct vehicle icon (car/truck/motorcycle) displayed | TASK-051 |
| R-4  | Status indicators             | Check roster members with different positions  | Green=In-Transit, Yellow=Stopped, Gray=Offline        | TASK-052 |
| R-5  | Speed & ETA display           | Check roster with active position data         | Speed (km/h) and ETA shown for each member            | TASK-053 |
| R-6  | Focus on member interaction   | Click a member in roster sidebar               | Map flies to that member's marker position            | TASK-054 |
| R-7  | Member avatar & info cards    | Check roster member cards                      | Avatar with name, role, vehicle info displayed        | TASK-055 |
| R-8  | Member count badge            | Check roster toggle button                     | Badge shows number of active members                  | TASK-056 |
| R-9  | Real-time roster updates      | User B joins convoy while User A views roster  | Roster updates instantly without page refresh         | TASK-057 |
| R-10 | Touch-optimized gestures      | Swipe left/right on roster on mobile           | Drawer opens/closes with swipe gesture                | TASK-058 |
| R-11 | Dark mode toggle              | Click dark mode toggle                         | Map style switches to dark, UI theme inverts          | TASK-059 |

---

## 7. Multi-Browser Concurrent Test

| ID  | Test                     | Steps                                                  | Expected Result                        | Sprint   |
| --- | ------------------------ | ------------------------------------------------------ | -------------------------------------- | -------- |
| X-1 | Two users create convoys | User A creates convoy, User B creates convoy           | Both see only their own convoy members | TASK-031 |
| X-2 | Cross-convoy isolation   | User A and B in different convoys                      | Neither sees the other's markers       | TASK-039 |
| X-3 | Real-time sync           | User A searches route, User B searches different route | Both routes render independently       | TASK-040 |

---

## 7. Edge Cases

| ID  | Test                   | Steps                           | Expected Result                              | Sprint   |
| --- | ---------------------- | ------------------------------- | -------------------------------------------- | -------- |
| E-1 | GPS unavailable        | Desktop without GPS sensor      | Permission prompt → Map stays at world view  | TASK-048 |
| E-2 | PocketBase offline     | Stop PocketBase container       | Graceful error handling, no crash            | TASK-004 |
| E-3 | OSRM offline           | Stop OSRM container             | Route calculation shows error message        | TASK-012 |
| E-4 | Stale convoy cleanup   | Create convoy, wait 30+ minutes | Convoy auto-ended by session cleanup         | TASK-035 |
| E-5 | Rapid position updates | Simulate high-speed movement    | Markers don't jump, animation smooth         | TASK-043 |
| E-6 | Mobile responsive      | Open on mobile viewport (375px) | Bottom nav, hamburger menu, map fills screen | TASK-016 |

---

## 8. Browser Support

| ID  | Browser                 | Priority | Sprint |
| --- | ----------------------- | -------- | ------ |
| B-1 | Chrome latest (macOS)   | P0       | —      |
| B-2 | Safari latest (macOS)   | P1       | —      |
| B-3 | Firefox latest (macOS)  | P1       | —      |
| B-4 | Chrome Mobile (Android) | P2       | —      |
| B-5 | Safari Mobile (iOS)     | P2       | —      |

---

## Sprint Traceability

Each test maps to specific sprint tasks:

- **Sprint 1 (TASK-000–017):** Infrastructure, Auth, Map basics → Tests I-1–6, A-1–6, M-1
- **Sprint 2 (TASK-018–026):** Search, Routing, Traffic → Tests M-3–8
- **Sprint 3 (TASK-027–038):** Convoy CRUD, Deep links, Sharing → Tests C-1–10
- **Sprint 4 (TASK-039–048):** GPS, Realtime, Markers, Vectors → Tests M-2, M-9–10, P-1–8, X-1–3, E-1–6
- **Sprint 5 (TASK-049–059):** Roster, UI, Dark Mode → Tests R-1–11
