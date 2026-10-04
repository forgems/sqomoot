// Content script on squadrats.com: harvest {uid, name} pairs from the current
// page (profile links /u/<UID>, public maps /map/<UID>). Used by the popup's
// "Import follows" button. Heuristic until a follow endpoint is confirmed.
(function () {
  if (typeof browser === "undefined" && typeof chrome !== "undefined") {
    window.browser = chrome;
  }

  const UID_RE = /\/(?:u|map)\/([a-zA-Z0-9]{8,40})/;

  function harvest() {
    const found = new Map();
    const anchors = document.querySelectorAll('a[href*="/u/"], a[href*="/map/"]');
    for (const a of anchors) {
      const m = a.getAttribute("href").match(UID_RE);
      if (!m) continue;
      const uid = m[1];
      const name = (a.textContent || "").trim();
      if (!found.has(uid) || (name && !found.get(uid))) {
        found.set(uid, name || uid.slice(0, 6));
      }
    }
    return Array.from(found, function ([uid, name]) {
      return { uid, name };
    });
  }

  browser.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg && msg.type === "SQ_IMPORT_FOLLOWS") {
      sendResponse({ users: harvest() });
    }
    return false;
  });
})();
