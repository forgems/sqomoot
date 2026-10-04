// Übersquadrat: the largest solid square fully filled with collected
// squadrats (z14 tiles). Computed locally from the tile indices — verified
// against Squadrats' own trophy GeoJSON (same side length for every UID
// tested).
(function () {
  const sq = (window.sqOverlay = window.sqOverlay || {});

  const UBER_ZOOM = 14;

  function parse(indices) {
    const tiles = [];
    for (const idx of indices) {
      const parts = idx.split("-");
      const x = parseInt(parts[0], 10);
      const y = parseInt(parts[1], 10);
      if (!isNaN(x) && !isNaN(y)) tiles.push([x, y]);
    }
    return tiles;
  }

  // Maximal-square DP over the occupied tiles: side(x, y) is the side of the
  // largest solid square whose bottom-right tile is (x, y). Sparse (Map keyed
  // by "x,y"), so cost is O(n) for n collected tiles instead of O(bbox area).
  function maxSquare(indices) {
    const tiles = parse(indices);
    if (tiles.length === 0) return null;
    tiles.sort(function (a, b) {
      return a[1] - b[1] || a[0] - b[0];
    });

    const side = new Map();
    const key = function (x, y) {
      return x + "," + y;
    };
    let best = 0;
    let bestX = 0;
    let bestY = 0;

    for (const t of tiles) {
      const x = t[0];
      const y = t[1];
      const v =
        1 +
        Math.min(
          side.get(key(x - 1, y)) || 0,
          side.get(key(x, y - 1)) || 0,
          side.get(key(x - 1, y - 1)) || 0
        );
      side.set(key(x, y), v);
      // Strict ">" keeps the first (topmost, then leftmost) square on ties.
      if (v > best) {
        best = v;
        bestX = x;
        bestY = y;
      }
    }

    return {
      size: best,
      x0: bestX - best + 1,
      y0: bestY - best + 1,
      z: UBER_ZOOM,
    };
  }

  sq.ubersquadrat = { maxSquare, zoom: UBER_ZOOM };
})();
