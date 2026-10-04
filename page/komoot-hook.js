// Page-world script: find Komoot's MapLibre map instance and keep it alive
// across SPA navigation and style switches. Clean-room implementation.
(function () {
  const sqp = (window.sqPage = window.sqPage || {});

  const MAP_CANVAS_SELECTOR = "canvas.maplibregl-canvas, canvas.mapboxgl-canvas";
  const MAP_CONTAINERS_SELECTOR =
    ".maplibregl-map, .maplibregl-canvas-container, .mapboxgl-map, .mapboxgl-canvas-container";
  const DISCOVERY_INTERVAL_MS = 2000;
  const SWEEP_BUDGET_MS = 100;

  let map = null;
  let lastRender = null; // {users, tiles}
  let discoveryTimer = null;
  let sweepCursor = 0;
  const styleWatched = new WeakSet();

  function isMapInstance(o) {
    return (
      o &&
      typeof o.getStyle === "function" &&
      typeof o.addLayer === "function" &&
      typeof o.getLayer === "function" &&
      typeof o.addSource === "function" &&
      typeof o.getSource === "function" &&
      typeof o.getCanvas === "function"
    );
  }

  function isLiveMap(m) {
    try {
      return isMapInstance(m) && document.contains(m.getCanvas());
    } catch (e) {
      return false;
    }
  }

  function getReactFiber(el) {
    for (const key in el) {
      if (key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$")) {
        return el[key];
      }
    }
    return null;
  }

  // Scan one fiber node (and its immediate prop/state values) for a map.
  function scanFiber(fiber, canvas) {
    if (!fiber) return null;
    const candidates = [];
    if (fiber.stateNode) candidates.push(fiber.stateNode);
    if (fiber.memoizedProps && typeof fiber.memoizedProps === "object") {
      for (const key in fiber.memoizedProps) {
        candidates.push(fiber.memoizedProps[key]);
      }
    }
    let hook = fiber.memoizedState;
    for (let i = 0; hook && i < 40; i++, hook = hook.next) {
      if (hook.memoizedState && typeof hook.memoizedState === "object") {
        candidates.push(hook.memoizedState);
      }
    }
    for (const c of candidates) {
      if (isMapInstance(c)) {
        try {
          if (!canvas || c.getCanvas() === canvas) return c;
        } catch (e) {}
      }
    }
    return null;
  }

  // From the fiber of a DOM node: walk up the .return chain, then down children.
  function findMapInFiber(fiber, canvas) {
    let f = fiber;
    for (let i = 0; f && i < 60; i++) {
      const m = scanFiber(f, canvas);
      if (m) return m;
      f = f.return;
    }
    // Downward BFS from the top fiber reached above
    let queue = [fiber];
    for (let seen = 0; queue.length > 0 && seen < 3000; ) {
      const node = queue.shift();
      seen++;
      const m = scanFiber(node, canvas);
      if (m) return m;
      if (node.child) queue.push(node.child);
      if (node.sibling) queue.push(node.sibling);
    }
    return null;
  }

  // Strategy 1: container element with a _map back-reference.
  function findByContainerRef() {
    const nodes = document.querySelectorAll(MAP_CONTAINERS_SELECTOR);
    for (const node of nodes) {
      if (isLiveMap(node._map)) return node._map;
    }
    return null;
  }

  // Strategy 2: React fiber attached to the map canvas or its ancestors.
  function findByReactFiber() {
    const canvases = document.querySelectorAll(MAP_CANVAS_SELECTOR);
    for (let i = 0; i < canvases.length; i++) {
      const canvas = canvases[i];
      for (let el = canvas; el; el = el.parentElement) {
        const fiber = getReactFiber(el);
        if (!fiber) continue;
        const m = findMapInFiber(fiber, canvas);
        if (m && isLiveMap(m)) {
          console.log("[sq-overlay] map found in React fiber");
          return m;
        }
      }
    }
    return null;
  }

  // Strategy 3: time-budgeted full-DOM sweep (resumable cursor).
  function sweepForMap() {
    const all = document.querySelectorAll("*");
    if (sweepCursor >= all.length) sweepCursor = 0;
    const deadline = performance.now() + SWEEP_BUDGET_MS;
    while (sweepCursor < all.length && performance.now() < deadline) {
      const fiber = getReactFiber(all[sweepCursor++]);
      if (fiber) {
        const m = findMapInFiber(fiber, null);
        if (m && isLiveMap(m)) {
          sweepCursor = 0;
          console.log("[sq-overlay] map found in DOM sweep");
          return m;
        }
      }
    }
    return null;
  }

  function onStyleData() {
    // setStyle() wipes sources/layers: re-apply the last render.
    if (map && lastRender && sqp.render) {
      const probe = map.getStyle().layers.find(function (l) {
        return /^sq-/.test(l.id);
      });
      if (!probe) {
        console.log("[sq-overlay] style changed, re-adding layers");
        sqp.render(map, lastRender.users, lastRender.tiles);
      }
    }
  }

  function adoptMap(m) {
    map = m;
    if (!styleWatched.has(m)) {
      styleWatched.add(m);
      try {
        m.on("styledata", onStyleData);
      } catch (e) {}
    }
    if (lastRender && sqp.render) sqp.render(map, lastRender.users, lastRender.tiles);
  }

  function tick() {
    if (map && isLiveMap(map)) return;
    map = null;
    const found = findByContainerRef() || findByReactFiber() || sweepForMap();
    if (found) {
      console.log("[sq-overlay] MapLibre map adopted");
      adoptMap(found);
    }
  }

  function startDiscovery() {
    if (discoveryTimer) return;
    discoveryTimer = setInterval(tick, DISCOVERY_INTERVAL_MS);
    setTimeout(tick, 1000);
  }

  // Bridge: content script sends render payloads.
  window.addEventListener("message", function (e) {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d.source !== "sq-overlay-cs") return;
    if (d.type === "SQ_RENDER") {
      lastRender = { users: d.users, tiles: d.tiles };
      if (map && isLiveMap(map) && sqp.render) sqp.render(map, d.users, d.tiles);
    }
  });

  sqp.getMap = function () {
    return map && isLiveMap(map) ? map : null;
  };

  sqp.postToContent = function (msg) {
    window.postMessage(Object.assign({ source: "sq-overlay-page" }, msg), "*");
  };

  startDiscovery();
  sqp.postToContent({ type: "SQ_PAGE_READY" });
  console.log("[sq-overlay] page hook installed");
})();
