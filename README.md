# Squadrats Komoot Overlay

MV3 browser extension (Chrome + Firefox) that overlays the collected Squadrats
of selected users on the Komoot planning map. A floating panel on the map lists
the users with checkboxes; a `+` button adds a user by Squadrats UID with an
alias. The user list is stored **only client-side** (`browser.storage.local`).

**Firefox download page:** https://forgems.github.io/sqomoot/ — the signed
`.xpi` is published there by the `Pages` workflow (see "Publishing" below).

Independent project, not affiliated with Squadrats or Komoot. Clean-room
implementation; uses Squadrats' unprotected anonymous data endpoint politely
(cached, throttled).

## How it works

- User list: `[{uid, name, color, enabled}]` under storage key `sq_users`.
- Tiles: `GET https://mainframe-api.squadrats.com/anonymous/squadrants/<UID>`
  returns collected tile indices (`raw["14"]` = squadrats, `raw["17"]` =
  squadratinhos, as `x-y` slippy-map indices). Cached in IndexedDB for 24 h,
  max 3 concurrent fetches, 429 backoff.
- Rendering: indices are turned into GeoJSON rectangles (Web Mercator math) and
  added to Komoot's MapLibre map as two fill layers per user (z14 lighter
  shade below zoom 12, z17 base color from zoom 11), inserted above the basemap
  and below Komoot's own layers.
- Map discovery: content scripts run in an isolated world; a page-world script
  (injected via `web_accessible_resources`) finds the MapLibre instance via
  (1) container `_map` back-reference, (2) React fiber walk from
  `canvas.maplibregl-canvas`, (3) budgeted full-DOM sweep. It re-discovers the
  map after SPA navigation and re-adds layers after style switches (`styledata`).
- Bridge: content script ↔ page script via `window.postMessage`
  (`source: "sq-overlay-cs"` / `"sq-overlay-page"`).

## Install

**Chrome:** `chrome://extensions` → enable *Developer mode* → *Load unpacked* →
select this folder.

**Firefox:** `about:debugging#/runtime/this-firefox` → *Load Temporary Add-on* →
select `manifest.json`. (For permanent install, sign via AMO unlisted.)

## Use

1. Find a Squadrats UID: open `https://squadrats.com`, click a profile (e.g. in
   Standings) — the URL is `https://squadrats.com/u/<UID>`.
2. On a Komoot plan page (`/plan`, tour edit, or discover), click `+` in the
   panel (top-right), paste the UID, optional alias → Add.
3. Toggle checkboxes to show/hide each user's layers. Click a name to rename,
   the swatch to recolor, `×` to remove.
4. Popup (toolbar icon): same list, plus *Import follows from squadrats.com
   tab* (harvests user links from an open squadrats.com page — heuristic until
   a follow endpoint is confirmed) and *Clear tile cache*.

## Verify (milestones)

1. **Follow discovery** (open question): logged in on squadrats.com, open the
   follow page, DevTools → Network, record the XHR + response shape. Until
   then, use `+` add.
2. **Komoot hook spike**: paste `docs/spike-komoot.js` into the console of a
   Komoot plan page. Expect `SPIKE OK: map found`, tile counts, and colored
   squares after zooming to that user's area.
3. **Data layer**: panel shows a row for an added UID; console shows
   `[sq-overlay]` logs; re-adding is instant (IndexedDB cache).
4. **Renderer**: squares match the same user's map on squadrats.com at z14
   (zoom < 12) and z17 (zoom ≥ 11); Komoot route lines stay visible on top.
5. **Panel**: `+` add works without reload; checkbox toggles instantly; list
   survives browser restart.
6. **Robustness**: layers re-appear after switching Komoot basemap style
   (map/satellite) and after SPA navigation (plan → tour edit).

## Layout

```
manifest.json
content/   config storage colors throttle fetcher cache main squadrats-import
page/      komoot-hook renderer panel      (page-world, injected)
popup/     popup.html popup.js
docs/      spike-komoot.js
```

## Publishing (GitHub Pages)

The `Pages` workflow (`.github/workflows/pages.yml`) builds the Firefox `.xpi`
and deploys the download site at https://forgems.github.io/sqomoot/ on every
push to `main` (also `workflow_dispatch`).

- Without secrets: the published `.xpi` is **unsigned** — installs only in
  Firefox Developer Edition/Nightly or as a temporary add-on.
- With AMO signing: create credentials at
  `addons.mozilla.org/developers/addon/api/key/`, store them as repo secrets
  `AMO_API_KEY` and `AMO_API_SECRET`, re-run the workflow. It then signs the
  add-on via `web-ext sign --channel=unlisted` and publishes the signed file,
  which regular Firefox installs from the download page (same-origin link,
  `application/x-xpinstall` content type).
- AMO rejects re-submitting an existing version. Bump `version` in
  `manifest.json` whenever you want a new signed build published; otherwise the
  signing step fails with `Version X already exists`.

## Notes & limits

- The mainframe API is unofficial and rate-limited; keep usage personal and
  cached. If Squadrats locks it down, only `content/fetcher.js` needs changing.
- Chrome Web Store review will likely reject unofficial Squadrats data use;
  plan for sideloading.
- Komoot internals (React fiber names, style layer ids) can change; discovery
  logs to the console (`[sq-overlay]`) to ease debugging.
