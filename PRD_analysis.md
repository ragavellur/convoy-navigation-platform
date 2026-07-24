# PRD Analysis: Multi-User Real-Time Convoy Navigation & Communication Platform

**Source:** Convoy_Architecture_And_Specification.pdf
**Date:** 2026-07-24
**Mapping Stack:** OpenStreetMap (OSM) Ecosystem
**Client Platforms:** React Native (iOS/Android) + React (Web PWA)

---

## 1. Executive Summary

A real-time, multi-user convoy navigation and communication ecosystem designed to synchronize travel across disparate vehicles. Solves the isolation problem of traditional navigation platforms by introducing:

- Unified group route frameworks
- Vehicle grouping matrix states
- Continuous peer-to-peer background location telemetry streaming
- Zero-latency communication modules (duplex spatial conference calling + PTT broadcast)

**Platform Support:** Native mobile apps (iOS/Android) via React Native + Progressive Web App (PWA) for browser-based access on desktop and mobile web.

---

## 2. Client Platform Strategy

| Platform      | Technology          | Use Case                                               | Offline Support            |
| ------------- | ------------------- | ------------------------------------------------------ | -------------------------- |
| **iOS**       | React Native + Expo | Primary mobile driver experience                       | Service Worker caching     |
| **Android**   | React Native + Expo | Primary mobile driver experience                       | Service Worker caching     |
| **Web (PWA)** | React + Vite        | Desktop dispatch, tablet co-pilot, mobile web fallback | Service Worker + IndexedDB |

### PWA Requirements

- **Installable:** Add to Home Screen on mobile, installable on desktop
- **Offline-capable:** Cache map tiles, convoy state, chat history
- **Responsive:** Works on desktop (1920px), tablet (768px), mobile (375px)
- **Service Worker:** Background sync for location updates when reconnected
- **Manifest:** Full PWA manifest with icons, theme color, display: standalone

---

## 3. Feature Breakdown Matrix

### Epic 1: Authentication & User Management

| Feature                  | FR-ID      | Priority | Complexity | Web | Mobile | Description                                              |
| ------------------------ | ---------- | -------- | ---------- | --- | ------ | -------------------------------------------------------- |
| User Registration        | FR-AUTH-01 | P0       | Medium     | ✅  | ✅     | OAuth2-based registration with mobile/email verification |
| User Login               | FR-AUTH-02 | P0       | Medium     | ✅  | ✅     | Secure login with session management                     |
| Profile Management       | FR-AUTH-03 | P1       | Low        | ✅  | ✅     | User profile with avatar, display name                   |
| Session Token Management | FR-AUTH-04 | P0       | High       | ✅  | ✅     | JWT token lifecycle, refresh tokens, secure storage      |

### Epic 2: Map & Location Engine

| Feature                   | FR-ID     | Priority | Complexity | Web            | Mobile             | Description                                                 |
| ------------------------- | --------- | -------- | ---------- | -------------- | ------------------ | ----------------------------------------------------------- |
| Map Rendering             | FR-MAP-01 | P0       | High       | MapLibre GL JS | MapLibre GL Native | Vector tile rendering                                       |
| Place Autocomplete Search | FR-MAP-02 | P0       | Medium     | ✅             | ✅                 | Nominatim/Photon keyword-to-coordinate lookup               |
| Route Calculation         | FR-MAP-03 | P0       | High       | ✅             | ✅                 | OSRM/Valhalla route engine with traffic data                |
| Route Polyline Overlay    | FR-MAP-04 | P0       | Medium     | ✅             | ✅                 | Render route polyline on map with visual treatments         |
| Turn-by-Turn Navigation   | FR-MAP-05 | P1       | High       | ❌             | ✅                 | Audio guidance with localized TTS (mobile only)             |
| Off-Route Recalculation   | FR-MAP-06 | P0       | High       | ✅             | ✅                 | Path recalculation within 2.5s without disrupting neighbors |
| Traffic Condition Display | FR-MAP-07 | P1       | Medium     | ✅             | ✅                 | Visual traffic overlay on route segments                    |

### Epic 3: Convoy Session Management

| Feature                  | FR-ID     | Priority | Complexity | Web | Mobile | Description                                     |
| ------------------------ | --------- | -------- | ---------- | --- | ------ | ----------------------------------------------- |
| Create Convoy Session    | FR-CNV-01 | P0       | Medium     | ✅  | ✅     | Generate trip_id + security token               |
| Deep Link Generation     | FR-CNV-02 | P0       | Low        | ✅  | ✅     | Generate shareable deep link with trip_id param |
| Deep Link Parsing & Join | FR-CNV-03 | P0       | High       | ✅  | ✅     | Validate link, fetch destination, join session  |
| Vehicle Type Selection   | FR-CNV-04 | P1       | Low        | ✅  | ✅     | SUV/Sedan/Motorcycle/Passenger classification   |
| Convoy Host Controls     | FR-CNV-05 | P1       | Medium     | ✅  | ✅     | Host can manage members, end session            |
| Session State Management | FR-CNV-06 | P0       | High       | ✅  | ✅     | Active/inactive states, cleanup on disconnect   |

### Epic 4: Real-Time Location Tracking

| Feature                    | FR-ID     | Priority | Complexity | Web                     | Mobile     | Description                                     |
| -------------------------- | --------- | -------- | ---------- | ----------------------- | ---------- | ----------------------------------------------- |
| GPS Streaming              | FR-GPS-01 | P0       | High       | Browser Geolocation API | Native GPS | Continuous location updates 3-5s intervals      |
| Adaptive Polling (Battery) | FR-GPS-02 | P0       | High       | ✅                      | ✅         | Stationary: 30s, Urban: 5s/15m, Highway: 3s/40m |
| Custom Map Markers         | FR-GPS-03 | P0       | Medium     | ✅                      | ✅         | Vehicle-type specific marker icons              |
| Marker LERP Interpolation  | FR-GPS-04 | P1       | High       | ✅                      | ✅         | Smooth 1000ms animation with dead-reckoning     |
| Heading & Velocity Display | FR-GPS-05 | P1       | Medium     | ✅                      | ✅         | Direction vector, speed, heading angles         |
| Position Broadcast         | FR-GPS-06 | P0       | High       | ✅                      | ✅         | WebSocket/Socket.IO real-time position sharing  |

### Epic 5: Vehicle Roster Sidebar

| Feature                | FR-ID     | Priority | Complexity | Web | Mobile | Description                                  |
| ---------------------- | --------- | -------- | ---------- | --- | ------ | -------------------------------------------- |
| Roster Panel UI        | FR-ROS-01 | P1       | Medium     | ✅  | ✅     | Expandable sliding navigation view           |
| Vehicle Classification | FR-ROS-02 | P1       | Low        | ✅  | ✅     | Group by vehicle type                        |
| Status Indicators      | FR-ROS-03 | P1       | Medium     | ✅  | ✅     | In-Transit/Stopped/Offline heartbeat display |
| Speed & ETA Display    | FR-ROS-04 | P1       | Low        | ✅  | ✅     | Real-time speed and dynamic ETA              |
| Map Focus on Select    | FR-ROS-05 | P1       | Low        | ✅  | ✅     | Pan viewport to selected member marker       |

### Epic 6: Communication Module

| Feature                | FR-ID     | Priority | Complexity | Web | Mobile | Description                                  |
| ---------------------- | --------- | -------- | ---------- | --- | ------ | -------------------------------------------- |
| 1-on-1 Text Chat       | FR-CHT-01 | P1       | Medium     | ✅  | ✅     | Private messaging between convoy members     |
| Group Text Chat        | FR-CHT-02 | P0       | Medium     | ✅  | ✅     | Trip_id-bound group text room                |
| WebRTC Voice Channel   | FR-VCE-01 | P0       | High       | ✅  | ✅     | Duplex audio conference via mediasoup SFU    |
| Push-to-Talk Broadcast | FR-VCE-02 | P0       | High       | ✅  | ✅     | Override broadcast with 80% volume reduction |
| Opus Codec Adaptation  | FR-VCE-03 | P0       | High       | ✅  | ✅     | Dynamic 16kbps-64kbps modulation             |
| Voice Priority Flag    | FR-VCE-04 | P0       | Medium     | ✅  | ✅     | is_transmitting_broadcast signaling          |

### Epic 7: Backend Infrastructure

| Feature                      | FR-ID    | Priority | Complexity | Description                            |
| ---------------------------- | -------- | -------- | ---------- | -------------------------------------- |
| API Gateway                  | FR-BE-01 | P0       | High       | RESTful API endpoints                  |
| WebSocket Server             | FR-BE-02 | P0       | High       | Real-time bidirectional communication  |
| Database Schema              | FR-BE-03 | P0       | Medium     | Convoys, vehicles, telemetry, channels |
| Geospatial Queries (PostGIS) | FR-BE-04 | P0       | High       | Spatial indexing for location queries  |
| Redis Pub/Sub                | FR-BE-05 | P0       | High       | Real-time state synchronization        |
| OSRM/Valhalla Self-Host      | FR-BE-06 | P0       | High       | Dockerized routing engine              |
| Nominatim Self-Host          | FR-BE-07 | P0       | Medium     | Dockerized geocoder                    |

### Epic 8: Web Client / PWA (NEW)

| Feature                    | FR-ID     | Priority | Complexity | Description                                  |
| -------------------------- | --------- | -------- | ---------- | -------------------------------------------- |
| React + Vite Setup         | FR-WEB-01 | P0       | Medium     | Modern React SPA with Vite bundler           |
| PWA Manifest & Icons       | FR-WEB-02 | P0       | Low        | Installable PWA with proper manifest.json    |
| Service Worker             | FR-WEB-03 | P0       | High       | Offline caching, background sync             |
| MapLibre GL JS Integration | FR-WEB-04 | P0       | High       | Browser-native map rendering                 |
| Responsive Layout          | FR-WEB-05 | P0       | High       | Desktop/tablet/mobile responsive design      |
| Browser Geolocation API    | FR-WEB-06 | P0       | Medium     | HTML5 Geolocation for web clients            |
| Web Push Notifications     | FR-WEB-07 | P1       | Medium     | Browser push notifications for convoy alerts |
| IndexedDB Local Cache      | FR-WEB-08 | P1       | Medium     | Offline data persistence                     |
| Desktop Sidebar Layout     | FR-WEB-09 | P1       | Medium     | Side-by-side map + roster for desktop        |
| Touch-Optimized UI         | FR-WEB-10 | P1       | Low        | Touch gestures for tablet/mobile web         |

---

## 4. Technical Architecture (OpenStreetMap Stack + Web PWA)

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT PLATFORMS                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐    │
│  │ React Native│  │ React Native│  │   React + Vite      │    │
│  │   (iOS)     │  │  (Android)  │  │   (Web PWA)         │    │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘    │
│         │                │                     │                │
│  MapLibre GL Native     MapLibre GL Native    MapLibre GL JS   │
│         │                │                     │                │
│         └────────────────┼─────────────────────┘                │
│                          │                                      │
│  ┌───────────────────────┼───────────────────────┐             │
│  │            Shared API Layer (REST + WS)        │             │
│  └───────────────────────┬───────────────────────┘             │
└──────────────────────────┼──────────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │   REST API  │
                    │   Gateway   │
                    └──────┬──────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
    ┌────▼────┐     ┌─────▼─────┐     ┌─────▼─────┐
    │  Auth   │     │  Convoy   │     │  Telemetry│
    │ Service │     │  Service  │     │  Service  │
    └────┬────┘     └─────┬─────┘     └─────┬─────┘
         │                │                 │
    ┌────▼────┐     ┌─────▼─────┐     ┌─────▼─────┐
    │PostgreSQL│     │   Redis   │     │ WebSocket │
    │+ PostGIS│     │  Pub/Sub  │     │   Server  │
    └─────────┘     └───────────┘     └───────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
         ┌────▼────┐ ┌────▼────┐ ┌────▼────┐
         │  OSRM   │ │Nominatim│ │Mediasoup│
         │  Route  │ │  Geo   │ │  SFU    │
         │ Engine  │ │ Coder  │ │  Voice  │
         └─────────┘ └─────────┘ └─────────┘
```

---

## 5. Database Schema (Based on PRD JSON Blueprint)

### Tables

| Table                    | Purpose           | Key Fields                                                            |
| ------------------------ | ----------------- | --------------------------------------------------------------------- |
| `users`                  | User accounts     | user_id, name, email, auth_provider, created_at                       |
| `convoys`                | Trip sessions     | trip_id, host_user_id, destination coordinates, is_active, created_at |
| `convoy_members`         | Membership        | trip_id, user_id, vehicle_type, vehicle_label, joined_at              |
| `vehicles`               | Vehicle details   | vehicle_id, convoy_id, vehicle_type, label, assigned_occupants        |
| `live_telemetry`         | Real-time GPS     | user_id, trip_id, lat, lng, speed, heading, last_updated              |
| `communication_channels` | Voice/chat tokens | trip_id, webrtc_token, active_speaker_id, broadcast_status            |
| `messages`               | Chat messages     | message_id, trip_id, sender_id, content, type, timestamp              |

---

## 6. Sprint Plan Overview (Updated for Web PWA)

| Sprint   | Theme              | Duration | Features                                                  |
| -------- | ------------------ | -------- | --------------------------------------------------------- |
| Sprint 1 | Foundation         | 2 weeks  | Monorepo setup, Auth, DB schema, Basic map (mobile + web) |
| Sprint 2 | Core Navigation    | 2 weeks  | Route engine, Place search, Route overlay (mobile + web)  |
| Sprint 3 | Convoy Sessions    | 2 weeks  | Create/Join convoy, Deep links, Vehicle selection         |
| Sprint 4 | Real-Time Tracking | 2 weeks  | GPS streaming, Adaptive polling, Custom markers           |
| Sprint 5 | UI & Roster        | 2 weeks  | Vehicle roster sidebar, Map interactions, Responsive web  |
| Sprint 6 | Communication      | 2 weeks  | Group chat, WebRTC voice, PTT broadcast                   |
| Sprint 7 | Web PWA Polish     | 2 weeks  | PWA manifest, Service worker, Offline mode, Web push      |
| Sprint 8 | Polish & Testing   | 2 weeks  | Battery optimization, LERP smoothing, E2E testing         |
| Sprint 9 | Deploy & Launch    | 1 week   | CI/CD, Docker compose, Production deploy, App stores      |

---

## 7. Risk Assessment

| Risk                         | Impact | Mitigation                                                          |
| ---------------------------- | ------ | ------------------------------------------------------------------- |
| OSRM traffic data quality    | High   | Fallback to Valhalla, cache popular routes                          |
| WebRTC SFU complexity        | High   | Start with simple SFU, iterate                                      |
| Battery drain on mobile      | Medium | Aggressive adaptive polling, background mode limits                 |
| Nominatim rate limiting      | Medium | Self-host, implement caching layer                                  |
| Real-time sync latency       | Medium | Redis pub/sub + WebSocket, optimize payload                         |
| PWA browser compatibility    | Medium | Target modern browsers (Chrome, Safari, Firefox), feature detection |
| Map tile caching for offline | Medium | IndexedDB + Service Worker tile caching strategy                    |

---

## 8. Decisions (Resolved)

| Question                      | Decision                | Rationale                                                               |
| ----------------------------- | ----------------------- | ----------------------------------------------------------------------- |
| React Native vs Flutter?      | **React Native**        | Shared codebase with web React, single team skillset                    |
| Firebase Auth vs self-hosted? | **PocketBase**          | Self-hosted, includes auth + database + realtime, zero vendor lock-in   |
| Cloud hosting vs self-hosted? | **Self-hosted**         | Full control, cost predictable, no egress fees                          |
| Platform order?               | **Web → Android → iOS** | Web first for fastest iteration, then Android (larger market), then iOS |
| PWA scope?                    | **Full feature parity** | PWA is a first-class citizen, not a companion                           |

---

## 9. Technology Stack (Final)

| Layer              | Technology                        | Notes                                  |
| ------------------ | --------------------------------- | -------------------------------------- |
| **Web Client**     | React + Vite + TypeScript         | PWA with full feature parity           |
| **Mobile Client**  | React Native + Expo + TypeScript  | Shared logic with web via monorepo     |
| **Backend**        | PocketBase (Go)                   | Auth, Database, Realtime, File Storage |
| **Database**       | SQLite (via PocketBase) + PostGIS | Spatial queries for location           |
| **Routing**        | OSRM / Valhalla                   | Self-hosted via Docker                 |
| **Geocoding**      | Nominatim / Photon                | Self-hosted via Docker                 |
| **Voice**          | mediasoup SFU + WebRTC            | Self-hosted SFU cluster                |
| **Map Tiles**      | OpenStreetMap via MapLibre        | Vector tiles, self-hosted or CDN       |
| **Infrastructure** | Docker + Docker Compose           | Self-hosted on owned servers           |
| **CI/CD**          | GitHub Actions                    | Automated testing and deployment       |

---

## 10. Docker-First Architecture (Mandatory)

All backend services MUST run in Docker containers. No exceptions.

### Container Stack

| Service           | Image                                  | Port | Purpose                    |
| ----------------- | -------------------------------------- | ---- | -------------------------- |
| **PocketBase**    | `ghcr.io/pocketbase/pocketbase:latest` | 8090 | Auth + Database + Realtime |
| **OSRM**          | `osrm/osrm-backend`                    | 5000 | Route calculation engine   |
| **Nominatim**     | `mediagis/nominatim`                   | 8080 | Geocoding / Place search   |
| **Mediasoup SFU** | Custom Dockerfile                      | 7400 | WebRTC voice/video         |
| **Redis**         | `redis:alpine`                         | 6379 | Session caching + Pub/Sub  |

### Docker Compose Structure

```
docker-compose.yml
├── services/
│   ├── pocketbase/
│   │   ├── Dockerfile
│   │   └── pb_data/          # Volume mount for persistence
│   ├── osrm/
│   │   └── data/             # Preprocessed OSM data
│   ├── nominatim/
│   │   └── data/             # Geocoding database
│   ├── mediasoup/
│   │   └── Dockerfile
│   └── redis/
│       └── redis.conf
├── .env                      # All environment variables
└── scripts/
    ├── init-db.sh            # Database initialization
    └── download-map-data.sh  # OSM data download
```

### Volume Persistence

| Volume           | Container  | Purpose                              |
| ---------------- | ---------- | ------------------------------------ |
| `pb_data`        | PocketBase | User accounts, convoy data, messages |
| `nominatim_data` | Nominatim  | Geocoding database (20GB+)           |
| `osrm_data`      | OSRM       | Preprocessed routing data            |
| `redis_data`     | Redis      | Session cache persistence            |

### Environment Variables (.env)

```env
# PocketBase
POCKETBASE_ADMIN_EMAIL=admin@convoy.local
POCKETBASE_ADMIN_PASSWORD=changeme

# OSRM
OSRM_DATA_FILE=/data/india-latest.osrm

# Nominatim
NOMINATIM_DB_DIR=/var/lib/postgresql/14/main
NOMINATIM_IMPORT_STYLE=street

# Mediasoup
MEDIASOUP_LISTEN_IP=0.0.0.0
MEDIASOUP_ANNOUNCED_IP=your-server-ip

# Redis
REDIS_PASSWORD=changeme
```

---

**Status:** Plan Finalized
**Next Step:** Begin Sprint 1 execution (Docker Infrastructure First)
