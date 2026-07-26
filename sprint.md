# Sprint Board: Convoy Navigation & Communication Platform

**Project:** Real-Time Convoy Navigation & Communication Platform
**Mapping Stack:** OpenStreetMap (OSM) Ecosystem
**Platform Order:** Web (PWA) → Android → iOS
**Backend:** PocketBase (Auth + Database + Realtime)
**Infrastructure:** Docker-First (All services in containers)
**Created:** 2026-07-24

---

## Sprint 1: Web Foundation & Core (Week 1-2)

### 📌 Backlog

- [x] [TASK-005] Configure Docker Compose for all backend services
- [x] [TASK-005A] Set up PocketBase Docker container with persistent volume
- [x] [TASK-005B] Set up OSRM Docker container with map data volume
- [x] [TASK-005C] Set up Nominatim Docker container with geocoding data
- [x] [TASK-005D] Set up Redis Docker container for session caching
- [x] [TASK-005E] Configure Docker network isolation and health checks
- [x] [TASK-005F] Create .env file with all environment variables
- [x] [TASK-006] Design database schema in PocketBase (convoys, members, telemetry, messages)
- [x] [TASK-004] Set up PocketBase instance (auth + database + realtime)

### 🔄 In Progress

(none — Sprint 1 complete)

### ✅ Done

- [x] [TASK-014] Create PWA manifest.json with icons (FR-WEB-02)
- [x] [TASK-015] Set up shared API client library (packages/shared)
- [x] [TASK-016] Create responsive layout shell (desktop/tablet/mobile) (FR-WEB-05)
- [x] [TASK-016A] Fix auth guard - pb.authStore.onChange overriding localStorage handler
- [x] [TASK-017] Sprint 1 Review - 10/10 tests pass, all acceptance criteria met
- [x] [TASK-007] Implement user registration (PocketBase auth) (FR-AUTH-01)
- [x] [TASK-008] Implement user login with session management (FR-AUTH-02)
- [x] [TASK-009] JWT token management & secure storage (FR-AUTH-04)
- [x] [TASK-003] Configure ESLint, Prettier, Husky (shared config)
- [x] [TASK-002] Set up React + Vite + TypeScript web project (FR-WEB-01)
- [x] [TASK-010] Integrate MapLibre GL JS into web project (FR-WEB-04)
- [x] [TASK-011] Self-host Nominatim geocoder via Docker
- [x] [TASK-012] Self-host OSRM routing engine via Docker
- [x] [TASK-013] Create basic map page with zoom/pan controls
- [x] [TASK-000] Copy PRD document to project folder
- [x] [TASK-000A] Create comprehensive project plan (PRD_analysis.md)
- [x] [TASK-000B] Initialize git repository and configure user
- [x] [TASK-000C] Create GitHub repository (public) and push code
- [x] [TASK-000D] Enable GitHub Pages for sprint board
- [x] [TASK-000E] Create sprint-board.html and sprint-data.json
- [x] [TASK-000F] Update Agents.md with sprint tracking rules
- [x] [TASK-001] Initialize monorepo structure (Turborepo) with apps/web, apps/mobile, packages/shared

---

## Sprint 2: Web Navigation & Search (Week 3-4)

### 📌 Backlog

### 🔄 In Progress

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
- [x] [TASK-026] Build desktop sidebar layout (map + roster side-by-side) (FR-WEB-09)

---

## Sprint 3: Web Convoy Sessions (Week 5-6)

### 📌 Backlog

- [ ] [TASK-029] Build deep link generation system (FR-CNV-02)
- [ ] [TASK-030] Implement deep link parsing & validation (FR-CNV-03)
- [ ] [TASK-031] Build convoy join flow - web redirect (open web app directly)
- [ ] [TASK-032] Implement vehicle type selection UI (FR-CNV-04)
- [ ] [TASK-033] Build convoy host dashboard (FR-CNV-05)
- [ ] [TASK-034] Implement host controls (remove member, end session)
- [ ] [TASK-035] Build session state management (active/inactive/cleanup)
- [ ] [TASK-036] Implement convoy roster data model
- [ ] [TASK-037] Add deep link sharing via WhatsApp/SMS/Email
- [ ] [TASK-038] Build convoy invite notification system

### 🔄 In Progress

### ✅ Done

- [x] [TASK-027] Implement "Create Convoy" API (PocketBase collection) (FR-CNV-01)
- [x] [TASK-028] Generate unique trip_id with security tokens
- [x] [TASK-029] Build deep link generation system (FR-CNV-02)
- [x] [TASK-030] Implement deep link parsing & validation (FR-CNV-03)
- [x] [TASK-031] Build convoy join flow - web redirect (open web app directly)
- [x] [TASK-032] Implement vehicle type selection UI (FR-CNV-04)
- [x] [TASK-033] Build convoy host dashboard (FR-CNV-05)
- [x] [TASK-034] Implement host controls (remove member, end session)
- [x] [TASK-035] Build session state management (active/inactive/cleanup)
- [x] [TASK-036] Implement convoy roster data model
- [x] [TASK-037] Add deep link sharing via WhatsApp/SMS/Email
- [x] [TASK-038] Build convoy invite notification system

---

## Sprint 4: Web Real-Time Tracking (Week 7-8)

### 📌 Backlog

- [ ] [TASK-042] Create custom map markers for vehicle types (FR-GPS-03)
- [ ] [TASK-043] Implement marker LERP interpolation (FR-GPS-04)
- [ ] [TASK-044] Add dead-reckoning for smooth transitions
- [ ] [TASK-045] Build heading & velocity vector display (FR-GPS-05)
- [ ] [TASK-046] Implement PocketBase Realtime for position broadcast (FR-GPS-06)

### 🔄 In Progress

- [ ] [TASK-041] Build adaptive polling logic (FR-GPS-02):
  - [ ] [TASK-041a] Stationary state: 30s heartbeat
  - [ ] [TASK-041b] Urban state (<40km/h): 5s / 15m delta
  - [ ] [TASK-041c] Highway state (>40km/h): 3s / 40m delta
- [ ] [TASK-047] Add position update throttling & debouncing

### ✅ Done

- [x] [TASK-039] Set up PocketBase Realtime subscriptions
- [x] [TASK-040] Implement browser Geolocation API streaming (FR-GPS-01)
- [x] [TASK-048] Build location permission handling flow (browser prompt)

---

## Sprint 5: Web UI & Roster (Week 9-10)

### 📌 Backlog

- [ ] [TASK-049] Build vehicle roster sidebar component (FR-ROS-01)
- [ ] [TASK-050] Implement expandable/collapsible drawer UI
- [ ] [TASK-051] Add vehicle type classification display (FR-ROS-02)
- [ ] [TASK-052] Build status indicators (In-Transit/Stopped/Offline) (FR-ROS-03)
- [ ] [TASK-053] Add speed & ETA display per member (FR-ROS-04)
- [ ] [TASK-054] Implement "Focus on Member" map interaction (FR-ROS-05)
- [ ] [TASK-055] Build convoy member avatar & info cards
- [ ] [TASK-056] Add member count badge on roster toggle
- [ ] [TASK-057] Implement real-time roster updates via PocketBase Realtime
- [ ] [TASK-058] Touch-optimized gestures for tablet/mobile web (FR-WEB-10)
- [ ] [TASK-059] Add dark mode support for map & UI

### 🔄 In Progress

### ✅ Done

---

## Sprint 6: Web Communication Module (Week 11-12)

### 📌 Backlog

- [ ] [TASK-060] Set up mediasoup SFU server
- [ ] [TASK-061] Implement WebRTC voice channel (FR-VCE-01)
- [ ] [TASK-062] Build voice room join/leave logic
- [ ] [TASK-063] Implement Push-to-Talk broadcast system (FR-VCE-02)
- [ ] [TASK-064] Build PTT UI button with hold-to-talk
- [ ] [TASK-065] Implement volume reduction (80%) for non-speakers
- [ ] [TASK-066] Add Opus codec with adaptive bitrate (FR-VCE-03)
- [ ] [TASK-067] Implement voice priority flag signaling (FR-VCE-04)
- [ ] [TASK-068] Build 1-on-1 text chat (FR-CHT-01)
- [ ] [TASK-069] Build group text chat room (FR-CHT-02)
- [ ] [TASK-070] Add chat message persistence to PocketBase
- [ ] [TASK-071] Build chat UI with message bubbles & timestamps
- [ ] [TASK-072] Add typing indicators & read receipts
- [ ] [TASK-073] Implement chat notification sounds

### 🔄 In Progress

### ✅ Done

---

## Sprint 7: Web PWA Polish (Week 13-14)

### 📌 Backlog

- [ ] [TASK-074] Configure Service Worker with Workbox (FR-WEB-03)
- [ ] [TASK-075] Implement map tile caching strategy (IndexedDB + SW) (FR-WEB-08)
- [ ] [TASK-076] Implement offline mode - view cached convoy state (FR-WEB-08)
- [ ] [TASK-077] Implement background sync for location updates (FR-WEB-03)
- [ ] [TASK-078] Set up Web Push Notifications (FR-WEB-07)
- [ ] [TASK-079] Implement push notification permission flow
- [ ] [TASK-080] Create PWA install prompt UI (beforeinstallprompt)
- [ ] [TASK-081] Add service worker update notification
- [ ] [TASK-082] Optimize PWA Lighthouse score (>90 target)
- [ ] [TASK-083] Test PWA on Chrome, Safari, Firefox, Edge
- [ ] [TASK-084] Implement web app caching for static assets
- [ ] [TASK-085] Add PWA meta tags and Open Graph tags

### 🔄 In Progress

### ✅ Done

---

## Sprint 8: Android Foundation (Week 15-16)

### 📌 Backlog

- [ ] [TASK-086] Set up React Native / Expo project for Android
- [ ] [TASK-087] Configure Android build (EAS Build)
- [ ] [TASK-088] Integrate MapLibre GL Native SDK
- [ ] [TASK-089] Port authentication flow to React Native
- [ ] [TASK-090] Port map screen to React Native
- [ ] [TASK-091] Implement native GPS background service
- [ ] [TASK-092] Port adaptive polling logic to native
- [ ] [TASK-093] Port convoy join/create flow to mobile
- [ ] [TASK-094] Implement deep link handling (Android intent filters)
- [ ] [TASK-095] Port vehicle roster sidebar to mobile
- [ ] [TASK-096] Implement turn-by-turn navigation with TTS (FR-MAP-05)
- [ ] [TASK-097] Port chat UI to React Native
- [ ] [TASK-098] Implement push notifications (FCM)

### 🔄 In Progress

### ✅ Done

---

## Sprint 9: iOS Foundation (Week 17-18)

### 📌 Backlog

- [ ] [TASK-099] Configure iOS build (EAS Build)
- [ ] [TASK-100] Implement iOS-specific deep links (Universal Links)
- [ ] [TASK-101] Implement iOS background location mode
- [ ] [TASK-102] Implement iOS push notifications (APNs)
- [ ] [TASK-103] Test iOS-specific UI (safe area, notch, dynamic island)
- [ ] [TASK-104] iOS App Store submission preparation
- [ ] [TASK-105] Test iOS WebRTC compatibility

### 🔄 In Progress

### ✅ Done

---

## Sprint 10: Polish & Testing (Week 19-20)

### 📌 Backlog

- [ ] [TASK-106] Optimize battery consumption across all states
- [ ] [TASK-107] Implement location update batching
- [ ] [TASK-108] Write unit tests for all services (>85% coverage)
- [ ] [TASK-109] Write integration tests for API endpoints
- [ ] [TASK-110] Write E2E tests for web (Playwright)
- [ ] [TASK-111] Write E2E tests for Android (Detox)
- [ ] [TASK-112] Performance profiling & optimization
- [ ] [TASK-113] Add error boundaries & crash reporting (Sentry)
- [ ] [TASK-114] Implement analytics tracking
- [ ] [TASK-115] Accessibility audit (WCAG 2.1 AA) - web
- [ ] [TASK-116] Security audit (OWASP Mobile + Web)
- [ ] [TASK-117] Load testing for PocketBase Realtime
- [ ] [TASK-118] API documentation (OpenAPI/Swagger)

### 🔄 In Progress

### ✅ Done

---

## Sprint 11: Deploy & Launch (Week 21)

### 📌 Backlog

- [ ] [TASK-119] Set up CI/CD pipeline (GitHub Actions)
- [ ] [TASK-120] Configure production Docker images
- [ ] [TASK-121] Set up Docker Swarm / K3s orchestration
- [ ] [TASK-122] Configure production PocketBase instance
- [ ] [TASK-123] Set up Redis for session caching
- [ ] [TASK-124] Configure CDN for map tiles
- [ ] [TASK-125] Set up monitoring & alerting (Grafana/Prometheus)
- [ ] [TASK-126] Configure logging aggregation
- [ ] [TASK-127] Set up staging environment
- [ ] [TASK-128] Perform staging validation
- [ ] [TASK-129] Deploy web PWA to production (Vercel/Cloudflare)
- [ ] [TASK-130] Submit Android app to Google Play
- [ ] [TASK-131] Production deployment & smoke testing
- [ ] [TASK-132] Post-launch monitoring setup

### 🔄 In Progress

### ✅ Done

---

## Progress Summary

| Sprint    | Total Tasks | Backlog | In Progress | Done   | Platform     |
| --------- | ----------- | ------- | ----------- | ------ | ------------ |
| Sprint 1  | 32          | 12      | 0           | 20     | Web + Docker |
| Sprint 2  | 10          | 10      | 0           | 0      | Web          |
| Sprint 3  | 12          | 12      | 0           | 0      | Web          |
| Sprint 4  | 10          | 10      | 0           | 0      | Web          |
| Sprint 5  | 11          | 11      | 0           | 0      | Web          |
| Sprint 6  | 14          | 14      | 0           | 0      | Web          |
| Sprint 7  | 12          | 12      | 0           | 0      | Web PWA      |
| Sprint 8  | 13          | 13      | 0           | 0      | Android      |
| Sprint 9  | 7           | 7       | 0           | 0      | iOS          |
| Sprint 10 | 13          | 13      | 0           | 0      | All          |
| Sprint 11 | 14          | 14      | 0           | 0      | All          |
| **Total** | **148**     | **128** | **0**       | **20** |              |

---

## Legend

- `[ ]` - Todo / Backlog
- `[-]` - In Progress
- `[x]` - Completed
- `[~]` - Blocked

---

## Platform Delivery Order

```
Sprint 1-7:  [████████████████████████████] Web (PWA) - Full Feature Parity
Sprint 8:    [████████████] Android Foundation
Sprint 9:    [████████] iOS Foundation
Sprint 10-11:[████████████████] Polish & Deploy (All Platforms)
```

---

## Notes

- **Web first strategy** - fastest iteration, no app store approval delays
- **PocketBase** - single solution for auth, database, realtime, file storage
- **Full PWA parity** - web is not a companion, it's a first-class citizen
- Estimated velocity: 5-7 tasks per sprint (2 weeks)
- **Sprint 1 is ready to begin** - Web foundation tasks are well-defined
