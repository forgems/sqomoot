(function () {
  const sq = (window.sqOverlay = window.sqOverlay || {});
  const cfg = sq.config;

  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      const req = indexedDB.open(cfg.cacheDb, 1);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains(cfg.cacheStore)) {
          req.result.createObjectStore(cfg.cacheStore, { keyPath: "uid" });
        }
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error);
      };
    });
    return dbPromise;
  }

  function tx(mode) {
    return openDb().then(function (db) {
      return db.transaction(cfg.cacheStore, mode).objectStore(cfg.cacheStore);
    });
  }

  function reqToPromise(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error);
      };
    });
  }

  // IndexedDB structured-clone drops Sets, so store arrays and rebuild Sets here.
  function getValid(uid) {
    return tx("readonly")
      .then(function (store) {
        return reqToPromise(store.get(uid));
      })
      .then(function (row) {
        if (!row || Date.now() - row.fetchedAt > cfg.cacheTtlMs) return null;
        return {
          raw: { 14: new Set(row.raw14), 17: new Set(row.raw17) },
          geojson: row.geojson || null,
        };
      })
      .catch(function () {
        return null;
      });
  }

  function put(uid, raw, geojson) {
    return tx("readwrite")
      .then(function (store) {
        const row = {
          uid: uid,
          raw14: Array.from(raw[14]),
          raw17: Array.from(raw[17]),
          geojson: geojson || null,
          fetchedAt: Date.now(),
        };
        return reqToPromise(store.put(row));
      })
      .catch(function () {});
  }

  function remove(uid) {
    return tx("readwrite")
      .then(function (store) {
        return reqToPromise(store.delete(uid));
      })
      .catch(function () {});
  }

  function clearAll() {
    return tx("readwrite")
      .then(function (store) {
        return reqToPromise(store.clear());
      })
      .catch(function () {});
  }

  sq.cache = { getValid, put, remove, clearAll };
})();
