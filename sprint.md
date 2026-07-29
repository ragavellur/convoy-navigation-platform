# Sprint Board: Convoy Navigation & Communication Platform

**Project:** Real-Time Convoy Navigation & Communication Platform
**Mapping Stack:** OpenStreetMap (OSM) Ecosystem
**Platform Order:** Web (PWA) → Android → iOS
**Backend:** PocketBase (Auth + Database + Realtime)
**Infrastructure:** Docker-First (All services in containers)
**Created:** 2026-07-24

---

## Sprint 1: Web Foundation & Core (Week 1-2)

### ✅ Done

- [x] [TASK-000] Copy PRD document to project folder
- [x] [TASK-000A] Create comprehensive project plan (PRD_analysis.md)
- [x] [TASK-000B] Initialize git repository and configure user
- [x] [TASK-000C] Create GitHub repository (public) and push code
- [x] [TASK-000D] Enable GitHub Pages for sprint board
- [x] [TASK-000E] Create sprint-board.html and sprint-data.json
- [x] [TASK-000F] Update Agents.md with sprint tracking rules
- [x] [TASK-001] Initialize monorepo structure (Turborepo)
- [x] [TASK-002] Set up React + Vite + TypeScript web project (FR-WEB-01)
- [x] [TASK-003] Configure ESLint, Prettier, Husky (shared config)
- [x] [TASK-004] Set up PocketBase instance (auth + database + realtime)
- [x] [TASK-005] Configure Docker Compose for all backend services
- [x] [TASK-005A] Set up PocketBase Docker container with persistent volume
- [x] [TASK-005B] Set up OSRM Docker container with map data volume
- [x] [TASK-005C] Set up Nominatim Docker container with geocoding data
- [x] [TASK-005D] Set up Redis Docker container for session caching
- [x] [TASK-005E] Configure Docker network isolation and health checks
- [x] [TASK-005F] Create .env file with all environment variables
- [x] [TASK-006] Design database schema in PocketBase
- [x] [TASK-007] Implement user registration (PocketBase auth) (FR-AUTH-01)
- [x] [TASK-008] Implement user login with session management (FR-AUTH-02)
- [x] [TASK-009] JWT token management & secure storage (FR-AUTH-04)
- [x] [TASK-010] Integrate MapLibre GL JS into web project (FR-WEB-04)
- [x] [TASK-011] Self-host Nominatim geocoder via Docker
- [x] [TASK-012] Self-host OSRM routing engine via Docker
- [x] [TASK-013] Create basic map page with zoom/pan controls
- [x] [TASK-014] Create PWA manifest.json with icons (FR-WEB-02)
- [x] [TASK-015] Set up shared API client library (packages/shared)
- [x] [TASK-016] Create responsive layout shell (desktop/tablet/mobile)
- [x] [TASK-016A] Fix auth guard - pb.authStore.onChange overriding localStorage
- [x] [TASK-017] Sprint 1 Review - all acceptance criteria met

---

## Sprint 2: Web Navigation & Search (Week 3-4)

### ✅ Done

- [x] [TASK-017] Implement place autocomplete search using Nominatim (FR-MAP-02)
- [x] [TASK-018] Build search UI with auto-suggest dropdown
- [x] [TASK-019] Implement route calculation via OSRM API (FR-MAP-03)
- [x] [TASK-020] Build route polyline renderer on MapLibre (FR-MAP-04)
- [x] [TASK-021] Add traffic condition visual overlay to route segments (FR-MAP-07)
- [x] [TASK-022] Build off-route detection and recalculation logic (FR-MAP-06)
- [x] [TASK-023] Add route summary panel (distance, ETA, time)
- [x] [TASK-024] Implement route alternatives selection
- [x] [TASK-025] Cache frequently used routes in PocketBase
- [x] [TASK-026] Build desktop sidebar layout (map + roster side-by-side)

---

## Sprint 3: Web Convoy Sessions (Week 5-6)

### ✅ Done

- [x] [TASK-027] Implement Create Convoy API (PocketBase collection) (FR-CNV-01)
- [x] [TASK-028] Generate unique trip_id with security tokens
- [x] [TASK-029] Build deep link generation system (FR-CNV-02)
- [x] [TASK-030] Implement deep link parsing & validation (FR-CNV-03)
- [x] [TASK-031] Build convoy join flow - web redirect
- [x] [TASK-032] Implement vehicle type selection UI (FR-CNV-04)
- [x] [TASK-033] Build convoy host dashboard (FR-CNV-05)
- [x] [TASK-034] Implement host controls (remove member, end session)
- [x] [TASK-035] Build session state management (active/inactive/cleanup)
- [x] [TASK-036] Implement convoy roster data model
- [x] [TASK-037] Add deep link sharing via WhatsApp/SMS/Email
- [x] [TASK-038] Build convoy invite notification system

---

## Sprint 4: Web Real-Time Tracking (Week 7-8)

### ✅ Done

- [x] [TASK-039] Set up PocketBase Realtime subscriptions
- [x] [TASK-040] Implement browser Geolocation API streaming (FR-GPS-01)
- [x] [TASK-041] Build adaptive polling logic (FR-GPS-02)
- [x] [TASK-042] Create custom map markers for vehicle types (FR-GPS-03)
- [x] [TASK-043] Implement marker LERP interpolation (FR-GPS-04)
- [x] [TASK-044] Add dead-reckoning for smooth transitions
- [x] [TASK-045] Build heading & velocity vector display (FR-GPS-05)
- [x] [TASK-046] Implement PocketBase Realtime for position broadcast (FR-GPS-06)
- [x] [TASK-047] Add position update throttling & debouncing
- [x] [TASK-048] Build location permission handling flow (browser prompt)

---

## Sprint 5: Web UI & Roster (Week 9-10)

### ✅ Done

- [x] [TASK-049] Build vehicle roster sidebar component (FR-ROS-01)
- [x] [TASK-050] Implement expandable/collapsible drawer UI
- [x] [TASK-051] Add vehicle type classification display (FR-ROS-02)
- [x] [TASK-052] Build status indicators (In-Transit/Stopped/Offline) (FR-ROS-03)
- [x] [TASK-053] Add speed & ETA display per member (FR-ROS-04)
- [x] [TASK-054] Implement Focus on Member map interaction (FR-ROS-05)
- [x] [TASK-055] Build convoy member avatar & info cards
- [x] [TASK-056] Add member count badge on roster toggle
- [x] [TASK-057] Implement real-time roster updates via PocketBase Realtime
- [x] [TASK-058] Touch-optimized gestures for tablet/mobile web (FR-WEB-10)
- [x] [TASK-059] Add dark mode support for map & UI

---

## Sprint 6: Web Communication Module (Week 11-12)

### ✅ Done

- [x] [TASK-060] Set up mediasoup SFU server
- [x] [TASK-061] Implement WebRTC voice channel (FR-VCE-01)
- [x] [TASK-062] Build voice room join/leave logic
- [x] [TASK-063] Implement Push-to-Talk broadcast system (FR-VCE-02)
- [x] [TASK-064] Build PTT UI button with hold-to-talk
- [x] [TASK-065] Implement volume reduction (80%) for non-speakers
- [x] [TASK-066] Add Opus codec with adaptive bitrate (FR-VCE-03)
- [x] [TASK-067] Implement voice priority flag signaling (FR-VCE-04)
- [x] [TASK-068] Build 1-on-1 text chat (FR-CHT-01)
- [x] [TASK-069] Build group text chat room (FR-CHT-02)
- [x] [TASK-070] Add chat message persistence to PocketBase
- [x] [TASK-071] Build chat UI with message bubbles & timestamps
- [x] [TASK-072] Add typing indicators & read receipts
- [x] [TASK-073] Implement chat notification sounds

---

## Sprint 7: Critical Convoy Flow Fixes (Week 13-14)

**DB cleaned — fresh start. 7 critical issues (high priority, work first):**

1. Vehicle ownership model → user-global, not convoy-scoped
2. Source & destination for convoys
3. Vehicle selection at convoy join
4. Deep link fix (GitHub Pages SPA routing)
5. One active convoy at a time
6. Vehicle identity on map (own vs. others)
7. Search improvements (keyboard nav, Nominatim fallback, pin preview)

### 📌 Backlog

### 🔄 In Progress

### ✅ Done

- [x] [TASK-074] Restructure vehicles collection: user-owned, remove convoy FK
- [x] [TASK-075] Add source/destination fields to convoys collection
- [x] [TASK-076] Make convoy_members.vehicle required
- [x] [TASK-077] One-active-convoy constraint (server-side check)
- [x] [TASK-078] Update shared API types for new schema
- [x] [TASK-079] Vehicle management in ProfilePage
- [x] [TASK-080] Source/destination in convoy creation UI
- [x] [TASK-081] Vehicle selection at join + one-convoy warning
- [x] [TASK-082] Fix deep link param preservation + token validation
- [x] [TASK-083] Fix position publishing vehicle identity + own-vehicle marker
- [x] [TASK-084] Search: keyboard nav + public Nominatim fallback + pin preview
- [x] [TASK-085] Configure Service Worker with Workbox (FR-WEB-03)

---

## Sprint 8: PWA Polish & Trekker Support (Week 15-16)

### 📌 Backlog

- [ ] [TASK-094] Test PWA on Chrome, Safari, Firefox, Edge
- [x] [TASK-097T] DB schema: add convoy_type to convoys, make license_plate optional, add trekker to vehicle types
- [x] [TASK-098T] TypeScript types + VehicleMarker trekker icon (walking person SVG)
- [x] [TASK-099T] Convoy creation form - add convoy type selector (Vehicle/Trekker)
- [x] [TASK-100T] Join flow - conditionally require vehicle based on convoy type
- [x] [TASK-101T] Auto-create synthetic trekker vehicle on join for trekker convoys
- [x] [TASK-102T] Convoy list + detail page - trekker-aware display (type badges, no vehicle info for trekkers)
- [x] [TASK-103T] ProfilePage - license plate optional when vehicle type is trekker
- [x] [TASK-104T] Update setup-collections.sh and setup-collections.py for new schema

### 🔄 In Progress

- [ ] [TASK-105T] Complete light & dark theme support across entire application

### ✅ Done

- [x] [TASK-086] Implement map tile caching strategy (IndexedDB + SW) (FR-WEB-08)
- [x] [TASK-087] Implement offline mode - view cached convoy state (FR-WEB-08)
- [x] [TASK-088] Implement background sync for location updates (FR-WEB-03)
- [x] [TASK-089] Set up Web Push Notifications (FR-WEB-07)
- [x] [TASK-090] Implement push notification permission flow
- [x] [TASK-091] Create PWA install prompt UI (beforeinstallprompt)
- [x] [TASK-092] Add service worker update notification
- [x] [TASK-093] Optimize PWA Lighthouse score (>90 target)
- [x] [TASK-095] Implement web app caching for static assets
- [x] [TASK-096] Add PWA meta tags and Open Graph tags
- [x] [TASK-096P] Server-side push notification sender with 7 event triggers

---

## Sprint 9: CSS Refactoring - Variables & Utility Classes (Week 17-18)

### ✅ Done

- [x] [TASK-112] Add missing CSS variables to index.css (info, border-light, subtle-bg, primary-border, primary-faint-bg) — dark + light modes
- [x] [TASK-113] Create utility CSS classes: .input-field, .card, .error-banner, .success-banner in index.css
- [x] [TASK-114] Refactor ConvoyDetailPage.tsx — replace ~30 hardcoded inline styles + Tailwind colors
- [x] [TASK-115] Refactor MapPage.tsx — replace ~25 hardcoded inline styles + Tailwind colors
- [x] [TASK-116] Refactor RosterSidebar.tsx — replace ~21 hardcoded inline styles + Tailwind colors

---

## Sprint 10: CSS Refactoring - Remaining Files & Component Extraction (Week 19-20)

### ✅ Done

- [x] [TASK-117] Refactor ConvoyPage.tsx — replace ~12 hardcoded inline styles + Tailwind colors
- [x] [TASK-118] Refactor ProfilePage.tsx — replace ~13 hardcoded inline styles + Tailwind colors
- [x] [TASK-119] Refactor Layout.tsx — replace ~10 hardcoded inline styles + Tailwind colors, use .glass/.glass-strong classes
- [x] [TASK-120] Refactor VoicePanel.tsx — replace ~10 hardcoded inline styles + Tailwind colors
- [x] [TASK-121] Refactor ChatPanel.tsx — replace hardcoded Tailwind colors with CSS variables
- [x] [TASK-122] Refactor SearchBar.tsx, LocationPermissionPrompt.tsx, ProtectedRoute.tsx, VehicleTypeSelector.tsx, NotFoundPage.tsx
- [x] [TASK-123] Refactor LoginPage.tsx & RegisterPage.tsx — replace inline styles with .input-field class + CSS variables
- [x] [TASK-124] Extract shared components: StatusBadge, MemberCard, SimulationControls from large pages

---

## Sprint 11: Polish & Testing (Week 21-22)

### ✅ Done

- [x] [TASK-151] Add error boundaries & crash reporting (Sentry)
- [x] [TASK-144] Optimize battery consumption across all states
- [x] [TASK-148] Write E2E tests for web (Playwright)
- [x] [TASK-154] Security audit (OWASP Mobile + Web)

### ✅ Done

- [x] [TASK-146] Write unit tests for all services (>85% coverage)

### 📌 Backlog

- [ ] [TASK-145] Implement location update batching

### ✅ Done

- [x] [TASK-147] Write integration tests for API endpoints

### 📌 Backlog

- [ ] [TASK-149] Write E2E tests for Android (Detox)
- [ ] [TASK-150] Performance profiling & optimization
- [ ] [TASK-152] Implement analytics tracking
- [ ] [TASK-153] Accessibility audit (WCAG 2.1 AA) - web
- [ ] [TASK-155] Load testing for PocketBase Realtime
- [ ] [TASK-156] API documentation (OpenAPI/Swagger)

---

## Sprint 12: Deploy & Launch (Week 23-24)

### 📌 Backlog

- [ ] [TASK-130] Set up CI/CD pipeline (GitHub Actions)
- [ ] [TASK-131] Configure production Docker images
- [ ] [TASK-132] Set up Docker Swarm / K3s orchestration
- [ ] [TASK-133] Configure production PocketBase instance
- [ ] [TASK-134] Set up Redis for session caching
- [ ] [TASK-135] Configure CDN for map tiles
- [ ] [TASK-136] Set up monitoring & alerting (Grafana/Prometheus)
- [ ] [TASK-137] Configure logging aggregation
- [ ] [TASK-138] Set up staging environment
- [ ] [TASK-139] Perform staging validation
- [ ] [TASK-140] Deploy web PWA to production (Vercel/Cloudflare)
- [ ] [TASK-141] Submit Android app to Google Play
- [ ] [TASK-142] Production deployment & smoke testing
- [ ] [TASK-143] Post-launch monitoring setup

---

## Progress Summary

| Sprint    | Total Tasks | Backlog | In Progress | Done   | Platform           |
| --------- | ----------- | ------- | ----------- | ------ | ------------------ |
| Sprint 1  | 32          | 0       | 0           | 32     | Web + Docker       |
| Sprint 2  | 10          | 0       | 0           | 10     | Web                |
| Sprint 3  | 12          | 0       | 0           | 12     | Web                |
| Sprint 4  | 10          | 0       | 0           | 10     | Web                |
| Sprint 5  | 11          | 0       | 0           | 11     | Web                |
| Sprint 6  | 14          | 0       | 0           | 14     | Web                |
| Sprint 7  | 12          | 12      | 0           | 0      | Web Critical Fixes |
| Sprint 8  | 21          | 10      | 0           | 11     | Web PWA + Trekker  |
| Sprint 9  | 5           | 0       | 0           | 5      | Web CSS Refactor   |
| Sprint 10 | 8           | 8       | 0           | 0      | Web CSS Refactor   |
| Sprint 11 | 13          | 7       | 1           | 4      | All                |
| Sprint 12 | 14          | 14      | 0           | 0      | All                |
| **Total** | **163**     | **73**  | **6**       | **83** |                    |

---

## Nominatim Data Note

**Option B (Current):** Public Nominatim fallback for non-local results. Fast, no disk overhead.
**Option A (Deferred):** Download larger OSM extract from Geofabrik for full offline geocoding. Requires ~2-10GB disk + re-indexing. Documented here for future reference when self-hosted coverage needs to expand beyond Monaco.

---

## Legend

- `[ ]` - Todo / Backlog
- `[-]` - In Progress
- `[x]` - Completed
- `[~]` - Blocked

---

## Platform Delivery Order

```
Sprint 1-8:   [████████████████████████████] Web (PWA) - Full Feature Parity
Sprint 9-10:  [████████████████] Web CSS Refactoring
Sprint 11-12: [████████████████] Polish & Deploy (All Platforms)
```

---

## Notes

- **Web first strategy** - fastest iteration, no app store approval delays
- **PocketBase** - single solution for auth, database, realtime, file storage
- **Full PWA parity** - web is not a companion, it's a first-class citizen
- **Sprint 7** - critical fixes addressing 7 core flow issues; DB cleaned for fresh start
- Estimated velocity: 5-7 tasks per sprint (2 weeks)
