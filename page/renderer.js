// Page-world script: build GeoJSON from tile indices and manage MapLibre layers.
(function () {
  const sqp = (window.sqPage = window.sqPage || {});

  const ALPHA14 = ["interpolate", ["linear"], ["zoom"], 10, 0.75, 12, 0.45];
  const ALPHA17 = ["interpolate", ["linear"], ["zoom"], 11, 0.55, 13, 0.4, 16, 0.3];
  const BASE_LAYER_RE =
    /^(background|satellite|.*satellite$|osm|ocm|.*hill.*|.*heatmap.*|.*terrain.*|.*raster.*|map-switcher|water$|landuse$|landcover$)/i;

  function lighten(hex, amount) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const mix = function (c) {
      return Math.round(c + (255 - c) * amount);
    };
    return (
      "#" +
      mix(r).toString(16).padStart(2, "0") +
      mix(g).toString(16).padStart(2, "0") +
      mix(b).toString(16).padStart(2, "0")
    );
  }

  function tileRect(x, y, z) {
    const n = Math.pow(2, z);
    const lon1 = (x / n) * 360 - 180;
    const lon2 = ((x + 1) / n) * 360 - 180;
    const lat = function (yy) {
      return (Math.atan(Math.sinh(Math.PI * (1 - (2 * yy) / n))) * 180) / Math.PI;
    };
    const latTop = lat(y);
    const latBot = lat(y + 1);
    return [
      [
        [lon1, latTop],
        [lon2, latTop],
        [lon2, latBot],
        [lon1, latBot],
        [lon1, latTop],
      ],
    ];
  }

  function buildFeatureCollection(tiles) {
    const features = [];
    for (const z of [14, 17]) {
      const list = tiles[z] || [];
      for (const idx of list) {
        const parts = idx.split("-");
        const x = parseInt(parts[0], 10);
        const y = parseInt(parts[1], 10);
        if (isNaN(x) || isNaN(y)) continue;
        features.push({
          type: "Feature",
          properties: { z: z },
          geometry: { type: "Polygon", coordinates: tileRect(x, y, z) },
        });
      }
    }
    return { type: "FeatureCollection", features: features };
  }

  // Insert our fills above Komoot's fill/line layers but below its labels,
  // otherwise opaque basemap fills (landcover/landuse/water) hide them.
  function computeBeforeId(map) {
    const layers = map.getStyle().layers || [];
    for (const l of layers) {
      if (/^sq-/.test(l.id)) continue;
      if (l.type === "symbol" || /^label|^text/.test(l.id)) return l.id;
    }
    for (const l of layers) {
      if (/^sq-/.test(l.id)) continue;
      if (!BASE_LAYER_RE.test(l.id)) return l.id;
    }
    return undefined;
  }

  function ourLayerIds(map) {
    return (map.getStyle().layers || [])
      .map(function (l) {
        return l.id;
      })
      .filter(function (id) {
        return /^sq-/.test(id);
      });
  }

  function render(map, users, tiles) {
    if (!map) return;
    try {
      const wanted = new Set();
      const beforeId = computeBeforeId(map);

      for (const u of users || []) {
        const data = (tiles || {})[u.uid];
        if (!data) continue;
        const srcId = "sq-src-" + u.uid;
        const l14 = "sq-" + u.uid + "-14";
        const l17 = "sq-" + u.uid + "-17";
        wanted.add(l14);
        wanted.add(l17);

        const fc = buildFeatureCollection(data);
        const src = map.getSource(srcId);
        if (src) {
          src.setData(fc);
        } else {
          map.addSource(srcId, { type: "geojson", data: fc });
        }

        if (!map.getLayer(l14)) {
          map.addLayer(
            {
              id: l14,
              type: "fill",
              source: srcId,
              filter: ["==", ["get", "z"], 14],
              maxzoom: 12,
              paint: { "fill-color": lighten(u.color, 0.4), "fill-opacity": ALPHA14 },
            },
            beforeId
          );
        }
        if (!map.getLayer(l17)) {
          map.addLayer(
            {
              id: l17,
              type: "fill",
              source: srcId,
              filter: ["==", ["get", "z"], 17],
              minzoom: 11,
              paint: { "fill-color": u.color, "fill-opacity": ALPHA17 },
            },
            beforeId
          );
        }

        // Always re-apply paint: layers persist across renders, so color
        // edits must be pushed even when the layer already exists.
        map.setPaintProperty(l14, "fill-color", lighten(u.color, 0.4));
        map.setPaintProperty(l14, "fill-opacity", ALPHA14);
        map.setPaintProperty(l17, "fill-color", u.color);
        map.setPaintProperty(l17, "fill-opacity", ALPHA17);

        const vis = u.enabled ? "visible" : "none";
        // setLayoutVisibility exists only in MapLibre >= 4.1; Komoot ships an
        // older build, so use the long-standing layout-property form.
        map.setLayoutProperty(l14, "visibility", vis);
        map.setLayoutProperty(l17, "visibility", vis);
      }

      // Drop layers of removed users.
      for (const id of ourLayerIds(map)) {
        if (wanted.has(id)) continue;
        map.removeLayer(id);
      }
      for (const srcId of Object.keys(map.getStyle().sources || {})) {
        if (!/^sq-src-/.test(srcId)) continue;
        const uid = srcId.slice(7);
        if (!wanted.has("sq-" + uid + "-14") && !wanted.has("sq-" + uid + "-17")) {
          map.removeSource(srcId);
        }
      }
    } catch (err) {
      console.warn("[sq-overlay] render failed: " + (err && err.message));
    }
  }

  sqp.render = render;
})();
