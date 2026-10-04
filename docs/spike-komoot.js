// Milestone-2 spike: paste into the DevTools console of a Komoot plan page
// (https://www.komoot.com/plan) to prove the MapLibre map hook + a live
// Squadrats layer render, before loading the extension.
//
// Usage: (1) open a komoot plan page, (2) paste this whole file, (3) replace
// SAMPLE_UID with a real squadrats.com/u/<UID>.
(async function () {
  const SAMPLE_UID = "2qgThcUDn4OMjTDaGsvF9nSLbWV2";
  const COLOR = "#c0392b";

  function isMap(o) {
    return o && typeof o.getStyle === "function" && typeof o.addLayer === "function" &&
      typeof o.addSource === "function" && typeof o.getCanvas === "function";
  }
  function fiber(el) {
    for (const k in el) if (k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$")) return el[k];
    return null;
  }
  function scan(f, canvas) {
    const cands = [];
    if (f.stateNode) cands.push(f.stateNode);
    if (f.memoizedProps && typeof f.memoizedProps === "object") for (const k in f.memoizedProps) cands.push(f.memoizedProps[k]);
    let h = f.memoizedState;
    for (let i = 0; h && i < 40; i++, h = h.next) if (h.memoizedState && typeof h.memoizedState === "object") cands.push(h.memoizedState);
    for (const c of cands) {
      if (isMap(c)) { try { if (!canvas || c.getCanvas() === canvas) return c; } catch (e) {} }
    }
    return null;
  }
  function findMap() {
    for (const node of document.querySelectorAll(".maplibregl-map, .maplibregl-canvas-container"))
      if (node._map && isMap(node._map)) return node._map;
    for (const canvas of document.querySelectorAll("canvas.maplibregl-canvas")) {
      for (let el = canvas; el; el = el.parentElement) {
        const f0 = fiber(el);
        if (!f0) continue;
        let f = f0;
        for (let i = 0; f && i < 60; i++, f = f.return) { const m = scan(f, canvas); if (m) return m; }
        let q = [f0];
        for (let seen = 0; q.length && seen < 3000; ) {
          const n = q.shift(); seen++;
          const m = scan(n, canvas); if (m) return m;
          if (n.child) q.push(n.child);
          if (n.sibling) q.push(n.sibling);
        }
      }
    }
    return null;
  }

  const map = findMap();
  if (!map) { console.error("SPIKE FAIL: no MapLibre map found on this page"); return; }
  console.log("SPIKE OK: map found", map);

  const data = await (await fetch("https://mainframe-api.squadrats.com/anonymous/squadrants/" + SAMPLE_UID)).json();
  if (!data) { console.error("SPIKE FAIL: no data for UID"); return; }
  console.log("SPIKE OK: tiles fetched — z14:", data.raw["14"].length, "z17:", data.raw["17"].length);

  const rect = function (x, y, z) {
    const n = 2 ** z;
    const lon1 = x / n * 360 - 180, lon2 = (x + 1) / n * 360 - 180;
    const lat = (yy) => Math.atan(Math.sinh(Math.PI * (1 - 2 * yy / n))) * 180 / Math.PI;
    return [[[lon1, lat(y)], [lon2, lat(y)], [lon2, lat(y + 1)], [lon1, lat(y + 1)], [lon1, lat(y)]]];
  };
  const features = [];
  for (const z of [14, 17]) for (const idx of data.raw[z]) {
    const [x, y] = idx.split("-").map(Number);
    features.push({ type: "Feature", properties: { z }, geometry: { type: "Polygon", coordinates: rect(x, y, z) } });
  }
  const fc = { type: "FeatureCollection", features };

  const layers = (map.getStyle().layers || []).map((l) => l.id);
  console.log("komoot style layers:", layers.join(", "));
  const baseRe = /^(background|satellite|osm|ocm|.*hill.*|.*heatmap.*|.*terrain.*|.*raster.*|map-switcher)/i;
  const beforeId = layers.find((id) => !baseRe.test(id));

  map.addSource("spike-src", { type: "geojson", data: fc });
  map.addLayer({ id: "spike-14", type: "fill", source: "spike-src", filter: ["==", ["get", "z"], 14], maxzoom: 12, paint: { "fill-color": "#e74c3c", "fill-opacity": 0.3 } }, beforeId);
  map.addLayer({ id: "spike-17", type: "fill", source: "spike-src", filter: ["==", ["get", "z"], 17], minzoom: 11, paint: { "fill-color": COLOR, "fill-opacity": 0.22 } }, beforeId);
  console.log("SPIKE OK: layers added (beforeId=" + beforeId + "). Zoom/pan to the user's area to see the squares.");
})();
