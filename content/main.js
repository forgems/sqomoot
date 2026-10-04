(function () {
  const sq = (window.sqOverlay = window.sqOverlay || {});
  const cfg = sq.config;
  const VERSION = "0.1.0";

  function isSupportedPath() {
    const p = location.pathname;
    return (
      p.includes("/plan") ||
      /\/(smart)?tour\/e?\d+(\/edit)?\/?$/.test(p) ||
      p.includes("/discover")
    );
  }

  let pageReady = false;
  let refreshInFlight = false;
  let refreshQueued = false;
  let lastRenderMsg = null;

  function injectPageScript(path) {
    const script = document.createElement("script");
    script.src = browser.runtime.getURL(path);
    (document.head || document.documentElement).appendChild(script);
  }

  function injectPageScripts() {
    injectPageScript("page/komoot-hook.js");
    injectPageScript("page/renderer.js");
    injectPageScript("page/panel.js");
  }

  function sendToPage(msg) {
    window.postMessage(Object.assign({ source: "sq-overlay-cs" }, msg), "*");
  }

  function loadTiles(users) {
    const tiles = {};
    const tasks = users.map(function (u) {
      return sq.throttle.defaultQueue
        .add(function () {
          return sq.cache.getValid(u.uid).then(function (cached) {
            if (cached) return cached;
            return sq.fetcher.fetchUserTiles(u.uid).then(function (result) {
              return sq.cache
                .put(u.uid, result.raw, result.geojson)
                .then(function () {
                  return { raw: result.raw, geojson: result.geojson };
                });
            });
          });
        })
        .then(function (data) {
          tiles[u.uid] = {
            14: Array.from(data.raw[14]),
            17: Array.from(data.raw[17]),
          };
        })
        .catch(function (err) {
          console.warn(
            "[sq-overlay] failed to load tiles for " + u.uid + ": " + (err && err.message)
          );
        });
    });
    return Promise.all(tasks).then(function () {
      return tiles;
    });
  }

  function doRefresh() {
    if (refreshInFlight) {
      refreshQueued = true;
      return Promise.resolve();
    }
    refreshInFlight = true;
    return sq.storage
      .getUsers()
      .then(function (users) {
        return loadTiles(users).then(function (tiles) {
          lastRenderMsg = { type: "SQ_RENDER", users: users, tiles: tiles };
          if (pageReady) sendToPage(lastRenderMsg);
        });
      })
      .catch(function (err) {
        console.warn("[sq-overlay] refresh failed: " + (err && err.message));
      })
      .then(function () {
        refreshInFlight = false;
        if (refreshQueued) {
          refreshQueued = false;
          return doRefresh();
        }
      });
  }

  function refresh() {
    return doRefresh();
  }

  // ---- page -> content bridge ----
  window.addEventListener("message", function (e) {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d.source !== "sq-overlay-page") return;

    switch (d.type) {
      case "SQ_PAGE_READY":
        pageReady = true;
        if (lastRenderMsg) sendToPage(lastRenderMsg);
        else refresh();
        break;
      case "SQ_ADD_USER":
        sq.storage
          .addUser(String(d.uid || "").trim(), (d.name || "").trim() || null)
          .then(refresh)
          .catch(function (err) {
            console.warn("[sq-overlay] add user failed: " + err.message);
            sendToPage({ type: "SQ_STATUS", message: "Invalid UID" });
          });
        break;
      case "SQ_REMOVE_USER":
        sq.storage.removeUser(d.uid).then(function () {
          sq.cache.remove(d.uid);
          return refresh();
        });
        break;
      case "SQ_SET_ENABLED":
        sq.storage.patchUser(d.uid, { enabled: !!d.enabled }).then(refresh);
        break;
      case "SQ_SET_NAME":
        sq.storage.patchUser(d.uid, { name: String(d.name || "").trim() || d.uid.slice(0, 6) }).then(refresh);
        break;
      case "SQ_SET_COLOR":
        if (/^#[0-9a-fA-F]{6}$/.test(d.color)) {
          sq.storage.patchUser(d.uid, { color: d.color }).then(refresh);
        }
        break;
    }
  });

  // ---- external changes (popup edits, cache bust) ----
  browser.storage.onChanged.addListener(function (changes, area) {
    if (area !== "local") return;
    if (changes[cfg.usersKey]) {
      refresh();
    }
    if (changes[cfg.cacheBustKey]) {
      sq.cache.clearAll().then(refresh);
    }
  });

  console.log("[sq-overlay] v" + VERSION + " content script loaded");
  if (isSupportedPath()) injectPageScripts();
  else console.log("[sq-overlay] not a plan/tour/discover page, skipping injection");
})();
