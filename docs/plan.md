# Plan: Browser extension — followed users' Squadrats overlay on Komoot

> **Status (implemented):** extension lives in `squadrats-komoot-overlay/`.
> Milestones 3–5 implemented and unit-tested headlessly (live-API fetch,
> tile→GeoJSON math verified: z14 tile = 1.54 km at lat 51; full content
> pipeline smoke-tested: add/toggle/remove user → SQ_RENDER). Milestone 2
> verification snippet: `squadrats-komoot-overlay/docs/spike-komoot.js`
> (needs a browser). Milestone 1 (follow endpoint) and 6 (import) still gated
> on Phase 0; interim: `+` add form + heuristic "Import follows" button.

Goal: a Chrome/Firefox (MV3) extension that, on komoot.com plan pages, shows a
floating panel listing Squadrats users, each with a checkbox. Checking a user
adds their collected squadrat layers to the Komoot map.

Users are managed **client-side**: the panel has a `+` button to add a Squadrats
UID together with an alias (display name). The list lives only in the browser
(`storage.local`); nothing is stored on any server. Optionally pre-populated
from the squadrats.com follow list (Phase 0, see 1.4).

## 1. Findings (verified 2026-10)

### 1.1 Data source — verified working, no auth needed

`GET https://mainframe-api.squadrats.com/anonymous/squadrants/<UID>`

Verified live with a sample UID. Response:

```json
{
  "raw": {
    "14": ["8128-5489", "8128-5490", ...],   // squadrats  = slippy tile indices x-y at zoom 14
    "17": ["65025-43914", ...]               // squadratinhos = tile indices at zoom 17
  },
  "geojson": "https://squadrats.org/trophies/<UID>/<ts>.geojson"
}
```

- CORS: `access-control-allow-origin: *` → content scripts can `fetch()` directly.
- Rate limited: 429 possible; retry with exponential backoff (1/2/4/8 s), max ~3 concurrent.
- Invalid UID → HTTP 200 with `null` body.
- No name/profile fields — display names must be stored locally.
- Health check: `GET /anonymous/health` → `OK`.
- Alternates: `mainframe-proxy-01/02.squadrats.com` (used by the official extension).
- User UID: from profile URL `https://squadrats.com/u/<UID>` (or `/map/<UID>/14`).

Squadrats are exactly Web Mercator slippy tiles: squadrat = z14 tile,
squadratinho = z17 tile. Tile index → rectangle:

```
lon = x / 2^z * 360 - 180
lat = atan(sinh(π * (1 - 2y / 2^z)))
```

### 1.2 Komoot map hook — how it's done (by the official extension, observed)

Komoot's planning map is **MapLibre GL JS inside React**. The official Squadrats
extension (MV3, id `mkcobabnclhdodfhajlagglahfhkeeon`; XPI inspected) finds the
map instance like this:

1. Wait ~1 s after load; look for `canvas.maplibregl-canvas` in the DOM.
2. From the canvas, walk up ancestors looking for a React fiber key
   (`__reactFiber$…` / `__reactInternalInstance$…`).
3. Walk the fiber tree looking for a property named `mapbox` whose value passes
   `map.getCanvas() === canvas` (i.e. a live MapLibre Map instance).
4. Fallback: time-budgeted full-DOM sweep (100 ms per sweep, resumable cursor).
5. Once found: `map.addSource()` + `map.addLayer()` with vector-tile sources;
   layer order for komoot vector style: after `background`, before
   `base-construction` / `label-waterway-lock`; raster style: after
   `satellite`/`osm`/`ocm`.
6. It intercepts `window.fetch` for `/style.json` to detect style switches
   (komoot calls `map.setStyle()`, which wipes our sources/layers → re-add).
7. Supported pages: path contains `/plan`, `/tour/e…(/edit)`, or `/discover`.

The open-source **ratpack** extension (multi-user overlay, closest prior art)
uses a simpler detection: map container elements (`.maplibregl-map` etc.) with a
`_map` back-reference, plus a canvas overlay synced to `map.on("move")`.
Komoot support is on ratpack's roadmap but not implemented.

### 1.3 Prior art

| Project | What it proves |
|---|---|
| Official Squadrats extension | Komoot hook works via React-fiber map discovery; vector layers render fine |
| `aliaksei135/ratpack` (GH) | Multi-user overlay via the anonymous API; fetch/cache/throttle design; two-world MV3 architecture |
| `leoschweizer/karoo-squadrats`, `nanolab/squadrats-osmand-overlay` | Tile-URL/token access patterns |

Legal notes:
- Official extension is proprietary ("All Rights Reserved") → **clean-room** our implementation; do not copy its code.
- ratpack has **no LICENSE file** → default all-rights-reserved; use its published API *facts* (endpoints, tile semantics) but do not copy its code.
- The mainframe API is unofficial and unprotected but rate-limited; be polite (cache, ≤3 concurrent, backoff). Squadrats ToS forbids abusing their data — keep this personal-use, no redistribution.

### 1.4 OPEN QUESTION: the "follow" list

I could not confirm a public "follow" feature or endpoint:
- No anonymous follow endpoint exists (probed `/anonymous/following|followers|friends|user|profile/...` → all 404).
- squadrats.com is behind a Vercel bot check, so the frontend can't be scraped from here.
- The official extension has no follow concept at all.

**Phase 0 (you, logged in, 10 min):** open squadrats.com → your follow list page
→ DevTools → Network → record the XHR (likely on `mainframe-api.squadrats.com`
with your session cookie, e.g. `/following/<uid>`). Note the response shape.
If no such page/endpoint exists, fall back to manual UID management (ratpack
style) or scraping UIDs from `a[href*="/u/"]` links on whatever follow UI exists.

## 2. Design

### 2.1 Architecture (MV3, Chrome + Firefox, no build step)

```
manifest.json
content/
  config.js        browser/chrome shim, constants
  storage.js       users: [{uid, name, color, enabled}] in storage.local
  colors.js        deterministic per-uid colors (hash + golden-ratio hue)
  fetcher.js       mainframe-api fetch, 429 backoff, null=invalid
  cache.js         IndexedDB cache, TTL ~24 h
  throttle.js      max 3 concurrent fetches
  main.js          orchestrator: load users → fetch/cache tiles → postMessage to page world
  squadrats-page.js  scraper on squadrats.com: harvest follow list (per Phase 0 finding)
page/
  komoot-hook.js   page-world: find MapLibre map (container._map → React fiber → sweep),
                   watch style.json fetch + styledata, re-add layers on style switch
  renderer.js      page-world: build GeoJSON per user, addSource/addLayer, visibility toggles
  panel.js         page-world: floating checkbox panel injected into komoot DOM,
                   incl. `+` add form (UID + alias) writing to storage.local
popup/
  popup.html/js    manage users: add UID, rename, recolor, refresh, enable/disable
```

- Content scripts (isolated world) do API + storage; page-world script (injected
  via `<script src=runtime.getURL(...)>` from `web_accessible_resources`, works
  in both browsers) does map access. Bridge = `window.postMessage` (convert
  `Set`→`Array`; structured clone drops Sets).
- Manifest matches: `*://*.komoot.com/*`, `*.komoot.de|.es|.it|.fr|.nl`, plus
  `https://squadrats.com/*` for the follow scraper.

### 2.2 Rendering choice

**Recommended (MVP): GeoJSON sources + fill layers per user.**
- Build a `FeatureCollection` client-side from `raw` indices: one rectangle per
  tile (typical user: ~1–15k rects — MapLibre geojson-vt handles this fine).
- Two layers per user: `sq-<uid>-z14` (lighter shade, `maxzoom: 12`) and
  `sq-<uid>-z17` (base color, `minzoom: 11`), `fill-opacity ≈ 0.25`.
- Insert after the basemap layer, before komoot's labels/route layers
  (discover real layer ids at runtime; log `getStyle().layers` once).
- Checkbox → `map.setLayoutVisibility(layerId, "visible"|"none")` — instant, no refetch.
- Overlaps: translucent fills blend; per-user colors distinguish owners.
  (Diagonal-stripe compositing like ratpack is a later enhancement.)

Alternative (if GeoJSON proves heavy on low-end machines): single canvas
overlay synced to `map.on("move"/"resize")` drawing cells via `map.project()`.

### 2.3 User list: `+` add form, client-side storage

Storage shape (`storage.local`, key `sq_users`) — the single source of truth,
never leaves the client:

```json
[{ "uid": "2qgThcUDn4OMjTDaGsvF9nSLbWV2", "name": "Jane", "color": "#c0392b", "enabled": true }]
```

Panel `+` flow (page-world, in `panel.js`):

1. Click `+` → inline form appears: two inputs — **UID** (required) and
   **alias** (optional; defaults to first 6 chars of UID).
2. Validate UID against `/^[a-zA-Z0-9]{8,40}$/` (ratpack uses `^[a-zA-Z0-9]+$`;
   real UIDs observed are 28-char alphanum). Reject duplicates.
3. Assign a deterministic color (colors.js) — user can recolor later via a
   color swatch in the row.
4. Write to `storage.local` → `storage.onChanged` fires → `main.js` fetches
   tiles for the new UID (throttled, cached) → panel row gets its checkbox →
   renderer adds the layers. No page reload needed.
5. Row affordances: checkbox (layer visibility), swatch (recolor), inline alias
   edit, `×` remove (drops layers + cached tiles).

The popup mirrors the same list (add/edit/remove) — same storage key, so panel
and popup stay in sync via `storage.onChanged`.

Optional pre-population from squadrats.com (only if Phase 0 confirms a follow
endpoint/page): content script harvests `{uid, displayName}` pairs and merges
them into `sq_users` on demand ("Import follows" button in the popup). Manual
`+` add remains the primary path and works standalone.

## 3. Milestones (each independently verifiable)

1. **Phase 0 — follow discovery** (manual, DevTools): identify follow endpoint or
   confirm absence. → verify: recorded request/response or decision to use manual list.
2. **Spike — komoot map hook** (no extension yet): paste a snippet in komoot plan
   page console; find the MapLibre instance via fiber walk; add one hardcoded
   GeoJSON rectangle layer. → verify: rectangle visible on komoot map, route still visible.
3. **Data layer**: fetcher + IndexedDB cache + throttle for a hardcoded UID list.
   → verify: `raw` sets loaded, cached, 429s retried (test by hammering).
4. **Renderer**: tile indices → GeoJSON → per-user layers on komoot.
   → verify: your own + one friend's squadrats visible at z14 and z17, correct
   placement (compare against squadrats.com map view).
5. **Panel UI**: floating panel on the map with user list + checkboxes + colors,
   and the `+` add form (UID + alias) writing to `storage.local`.
   → verify: add a UID via `+`, its layers appear without reload; toggling the
   checkbox shows/hides them; list survives browser restart (client-side storage).
6. **Follow import** (optional, gated on Phase 0): "Import follows" merges
   squadrats.com follow list into the client-side user list.
   → verify: followed users appear as rows with their display names as aliases.
7. **Robustness**: style switch (map ↔ satellite), SPA navigation (plan → tour
   edit), map re-creation, cache TTL refresh button.
   → verify: layers survive/re-appear after switching basemap style and navigating.

## 4. Risks

- **Follow feature unconfirmed** — no longer blocks the core product: the `+`
  add form (UID + alias, client-side) is the primary user-list mechanism;
  follow import is an optional convenience (milestone 6, gated on Phase 0).
- **Unofficial API** — could be locked down (auth, CORS removal) at any time;
  keep fetch layer swappable (config: mainframe URL + path).
- **Komoot internals change** — fiber/`_map` hooks are brittle; keep all three
  discovery strategies + clear console diagnostics.
- **Performance** — a few heavy users (10k+ z17 tiles each) → measure; fall back
  to canvas overlay or viewport-clipped sources if needed.
- **Distribution** — Chrome Web Store review will likely reject unofficial use of
  Squadrats data; plan for sideload (unpacked / .xpi self-sign like ratpack).

## 5. References

- Verified API contract: `mainframe-api.squadrats.com/anonymous/squadrants/<UID>`
- ratpack repo (architecture prior art): https://github.com/aliaksei135/ratpack
  (its `docs/spec/squadrats/fetching.md` documents the same endpoint)
- Official extension XPI inspected at `/tmp/squadrats-ext/ext` (komoot hook in
  `planners/komoot.js`, layer ordering in `engines/mapbox.js`) — reference only,
  proprietary.
- Tile math: squadrats = z14 / squadratinhos = z17 Web Mercator tiles.
