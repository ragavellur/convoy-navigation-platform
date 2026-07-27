# Test Flow 1: Convoy Creation, Joining & Real-Time Tracking

## Prerequisites

All backend services running:

```
convoy-pocketbase  → localhost:8090
convoy-osrm        → localhost:5001
convoy-nominatim   → localhost:8080
convoy-redis       → localhost:6379
```

Start the web dev server:

```bash
cd apps/web && npm run dev
```

Opens at `http://localhost:5173`

You need **2 browser windows** (one normal + one incognito) to simulate 2 convoy members.

---

## Step 1: Register Users & Add Vehicles

### Browser A — Member 1 (Host: Alice)

1. Open `http://localhost:5173`
2. Register: email `alice@test.com`, password `test1234`, name `Alice`
3. Go to **Profile** (`/profile`)
4. Click **+ Add Vehicle**
5. Fill: Name=`Alice's Car`, Type=`Car`, Color=`Red`, License Plate=`ABC-123`
6. Click **Save Vehicle** → verify it appears in the list
7. Add a second vehicle: Name=`Alice's Truck`, Type=`Truck`, License Plate=`XYZ-789`

### Browser B — Member 2 (Joiner: Bob)

1. Open `http://localhost:5173` in incognito
2. Register: email `bob@test.com`, password `test1234`, name `Bob`
3. Go to **Profile** → Add vehicle: Name=`Bob's Bike`, Type=`Motorcycle`, Color=`Blue`, License Plate=`BOB-001`

### Verify

- [ ] Both users can register without errors
- [ ] Both can add vehicles on Profile page
- [ ] Vehicles appear with correct type, color, and license plate
- [ ] Remove a vehicle → it disappears from the list

---

## Step 2: Create a Convoy

### Browser A (Alice)

1. Navigate to **Convoys** (`/convoy`)
2. Click **Create Convoy**
3. Fill in:
   - Name: `Weekend Road Trip`
   - Description: `Monaco to Nice coastal drive`
   - Starting Point: type `Monaco` → select from autocomplete dropdown
   - Destination: type `Nice France` → select from autocomplete dropdown
4. Click **Create**
5. Verify convoy appears in list showing: `Weekend Road Trip`, `Monaco → Nice France, France`
6. Click **Copy Invite Link** → link is copied (or note the 6-character **Code** shown)

### Verify

- [ ] Convoy creation form shows source and destination search bars
- [ ] Search autocomplete works with keyboard (↑↓ to navigate, Enter to select, Escape to close)
- [ ] After creation, convoy shows source → destination route text
- [ ] Convoy code is a 6-character alphanumeric string
- [ ] Copy Invite Link copies a valid deep link to clipboard

---

## Step 3: Join a Convoy

### Browser B (Bob)

1. Navigate to **Convoys** (`/convoy`)
2. In the **Join a Convoy** section (bottom of page):
   - Vehicle dropdown should show `Bob's Bike (motorcycle) · Blue [BOB-001]`
   - It auto-selects if you only have one vehicle
3. Enter the convoy code from Alice (e.g. `A3X7K9`)
4. Click **Join**
5. Convoy should appear in Bob's convoy list

### Verify

- [ ] Bob sees his vehicle pre-selected (or can select from dropdown)
- [ ] Joining without selecting a vehicle shows error: "Please select a vehicle before joining"
- [ ] After joining, Bob sees `Weekend Road Trip` in his convoy list
- [ ] Clicking into it shows both Alice (host) and Bob (member) in the Members list
- [ ] Alice's vehicle shows as `car`, Bob's as `motorcycle`

---

## Step 4: Deep Link Join Flow

### Test from a fresh browser

1. Alice: In ConvoyDetailPage, click **Copy Link** or **WhatsApp** to get the deep link
2. Open the deep link in a new incognito window
3. If not logged in → redirected to login with redirect param preserved
4. After login → redirected back to join page
5. **Vehicle selection screen** appears → select vehicle → click **Join with Selected Vehicle**
6. Should redirect to map view

### Verify

- [ ] Deep link contains `code`, `trip_id`, and `security_token` params
- [ ] Login redirect preserves all deep link params
- [ ] After login, user returns to join page (not lost)
- [ ] Vehicle selection screen shows user's vehicles
- [ ] Joining redirects to map with convoy active

---

## Step 5: Map — Live Position Tracking

### Browser A (Alice)

1. From ConvoyDetailPage, click **Open Map** (or navigate to `/map?convoy=<ID>`)
2. Accept location permission when prompted
3. Verify your vehicle marker appears on the map (car icon)

### Browser B (Bob)

1. Open the map for the same convoy (`/map?convoy=<ID>`)
2. Accept location permission
3. Verify Bob's marker appears (motorcycle icon)

### Verify

- [ ] Both members see **each other's markers** on the map
- [ ] Markers show vehicle type icons (car / motorcycle / truck / other)
- [ ] Markers update in real-time as positions change (every 5 seconds)
- [ ] Velocity vector lines extend from each marker showing heading direction
- [ ] Click a member in the roster → map flies to their position
- [ ] Own vehicle marker is visually distinct from others

---

## Step 6: Roster Sidebar — Member Status

### Verify

- [ ] Roster sidebar shows both members with their vehicles
- [ ] Status indicators update based on movement:
  - **In-Transit** (green) — speed >= 0.5 m/s and position < 30s old
  - **Stopped** (yellow) — speed < 0.5 m/s
  - **Offline** (gray) — no recent position or > 30s old
- [ ] Clicking a member focuses the map on their position
- [ ] Swipe left/right on mobile to expand/collapse roster

---

## Step 7: Search & Navigation

### Verify

- [ ] Type in search bar → results appear after 2+ characters
- [ ] Keyboard navigation: ↑↓ arrows highlight results, amber preview pin appears on map
- [ ] Enter selects the result → origin (green) and destination (red) markers appear
- [ ] Route is calculated via OSRM and displayed on map
- [ ] If local Nominatim (Monaco DB) returns no results, public Nominatim fallback kicks in automatically
- [ ] Clicking away from search closes the dropdown (Escape key also works)

---

## Step 8: Chat

### Verify

- [ ] Click chat icon in roster sidebar → chat panel expands
- [ ] Type a message → press Enter or click Send
- [ ] Message appears as a bubble (indigo for self, gray for others)
- [ ] Timestamps display correctly
- [ ] In Bob's window → message appears in real-time via PocketBase Realtime
- [ ] Bob sends a reply → Alice receives it in real-time
- [ ] Chat messages persist after page reload

---

## Step 9: Dark Mode

### Verify

- [ ] Click theme toggle (sun/moon icon) in sidebar
- [ ] Map switches to dark style
- [ ] UI switches to dark theme
- [ ] Refresh → dark mode persists (localStorage)
- [ ] Toggle back → light mode restores

---

## Step 10: PWA Service Worker

### Verify (Chrome DevTools)

1. Open DevTools → Application → Service Workers
2. [ ] `sw.js` is registered and active (autoUpdate mode)
3. [ ] Manifest shows Convoy Navigator with correct icons
4. [ ] Cache Storage has caches:
   - `osm-tiles` — map tile cache
   - `pocketbase-api` — API responses
   - `nominatim-geocode` — search results
5. Test offline: DevTools → Network → Offline
6. [ ] Map tiles still load from cache
7. [ ] Previously visited pages still work

---

## Step 11: Host Controls

### As Host (Alice) in ConvoyDetailPage

1. Verify you see both members with their vehicles
2. Click **Remove** next to Bob → Bob is removed from active members
3. Bob's map shows "Convoy not found" or redirects

### Verify

- [ ] Host can remove members
- [ ] Removed member loses access to convoy map
- [ ] End Session button (host only) → convoy status changes to "ended"
- [ ] After ending, convoy no longer appears in active convoy lists

---

## Bug Reporting

After running through these tests, report back:

| Item                | Details                                                  |
| ------------------- | -------------------------------------------------------- |
| **Tests that pass** | List test numbers                                        |
| **Tests that fail** | List test numbers + error message or unexpected behavior |
| **UI issues**       | Layout, styling, responsiveness problems                 |
| **Performance**     | Lag in position updates, search, or chat                 |
| **Console errors**  | Any red errors in browser console                        |

This tells us exactly what to fix before moving to Sprint 8 (PWA Polish).
