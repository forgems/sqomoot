(function () {
  if (typeof browser === "undefined" && typeof chrome !== "undefined") {
    window.browser = chrome;
  }
  const sq = (window.sqOverlay = window.sqOverlay || {});

  sq.config = {
    apiUrl: "https://mainframe-api.squadrats.com/anonymous/squadrants/",
    usersKey: "sq_users",
    cacheBustKey: "sq_cache_bust",
    cacheDb: "sq-overlay-cache",
    cacheStore: "userTiles",
    cacheTtlMs: 24 * 60 * 60 * 1000,
    maxConcurrent: 3,
    uidPattern: /^[a-zA-Z0-9]{8,40}$/,
    alpha14: 0.3,
    alpha17: 0.22,
  };
})();
