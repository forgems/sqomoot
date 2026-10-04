(function () {
  const sq = (window.sqOverlay = window.sqOverlay || {});
  const cfg = sq.config;

  const BACKOFF_MS = [1000, 2000, 4000, 8000];

  function sleep(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }

  function fetchUserTiles(uid) {
    const url = cfg.apiUrl + uid;
    let lastError = null;

    function attempt(n) {
      return fetch(url)
        .then(function (res) {
          if (res.status === 429) {
            lastError = new Error("Rate limited (429) for UID " + uid);
            if (n < BACKOFF_MS.length) {
              return sleep(BACKOFF_MS[n]).then(function () {
                return attempt(n + 1);
              });
            }
            throw lastError;
          }
          if (!res.ok) throw new Error("HTTP " + res.status + " for UID " + uid);
          return res.json();
        })
        .then(function (body) {
          if (body === null) throw new Error("No data for UID: " + uid);
          const raw = body.raw || {};
          return {
            uid: uid,
            raw: {
              14: new Set(raw["14"] || []),
              17: new Set(raw["17"] || []),
            },
            geojson: body.geojson || null,
          };
        })
        .catch(function (err) {
          if (n < BACKOFF_MS.length && /Network error|Failed to fetch/.test(err.message)) {
            return sleep(BACKOFF_MS[n]).then(function () {
              return attempt(n + 1);
            });
          }
          throw err;
        });
    }

    return attempt(0);
  }

  sq.fetcher = { fetchUserTiles };
})();
