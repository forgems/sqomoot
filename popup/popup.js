// Popup script (extension page). Deliberately duplicates the storage/colors
// logic from content/storage.js and content/colors.js — content-script IIFEs
// do not load on extension pages. Keep the copies in sync.
(function () {
  if (typeof browser === "undefined" && typeof chrome !== "undefined") {
    window.browser = chrome;
  }

  const USERS_KEY = "sq_users";
  const CACHE_BUST_KEY = "sq_cache_bust";
  const UID_RE = /^[a-zA-Z0-9]{8,40}$/;

  function djb2(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return h;
  }

  function hslToHex(h, s, l) {
    const f = function (n) {
      const k = (n + h / 30) % 12;
      const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return Math.round(255 * c).toString(16).padStart(2, "0");
    };
    return "#" + f(0) + f(8) + f(4);
  }

  function colorForUid(uid) {
    const h = djb2(uid);
    const hue = ((h * 0.618033988749895) % 1) * 360;
    const sat = 0.55 + ((h % 100) / 100) * 0.25;
    const light = 0.38 + ((h % 37) / 37) * 0.12;
    return hslToHex(hue, sat, light);
  }

  function getUsers() {
    return browser.storage.local.get(USERS_KEY).then(function (res) {
      return Array.isArray(res[USERS_KEY]) ? res[USERS_KEY] : [];
    });
  }

  function setUsers(users) {
    const obj = {};
    obj[USERS_KEY] = users;
    return browser.storage.local.set(obj);
  }

  function status(msg) {
    document.getElementById("status").textContent = msg || "";
  }

  function render(users) {
    const list = document.getElementById("list");
    list.innerHTML = "";
    if (users.length === 0) {
      list.innerHTML = "<div class='status'>No users yet. Add a UID above.</div>";
      return;
    }
    for (const u of users) {
      const row = document.createElement("div");
      row.className = "row";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !!u.enabled;
      cb.onchange = function () {
        u.enabled = cb.checked;
        setUsers(users);
      };
      row.appendChild(cb);

      const swatch = document.createElement("input");
      swatch.type = "color";
      swatch.className = "color";
      swatch.value = u.color;
      swatch.onchange = function () {
        u.color = swatch.value;
        setUsers(users);
      };
      row.appendChild(swatch);

      const name = document.createElement("input");
      name.className = "name";
      name.value = u.name || u.uid.slice(0, 6);
      name.onchange = function () {
        u.name = name.value.trim() || u.uid.slice(0, 6);
        setUsers(users);
      };
      row.appendChild(name);

      const del = document.createElement("span");
      del.className = "del";
      del.textContent = "\u00d7";
      del.title = "Remove user";
      del.onclick = function () {
        setUsers(users.filter(function (x) { return x.uid !== u.uid; }));
      };
      row.appendChild(del);

      list.appendChild(row);
    }
  }

  function refresh() {
    return getUsers().then(render);
  }

  document.getElementById("add").onclick = function () {
    const uid = document.getElementById("uid").value.trim();
    const alias = document.getElementById("alias").value.trim();
    if (!UID_RE.test(uid)) {
      status("Invalid UID (8-40 alphanumeric).");
      return;
    }
    getUsers().then(function (users) {
      if (users.some(function (u) { return u.uid === uid; })) {
        status("User already added.");
        return;
      }
      users.push({
        uid: uid,
        name: alias || uid.slice(0, 6),
        color: colorForUid(uid),
        enabled: true,
      });
      return setUsers(users).then(function () {
        document.getElementById("uid").value = "";
        document.getElementById("alias").value = "";
        status("Added " + uid.slice(0, 6) + ".");
      });
    });
  };

  document.getElementById("import").onclick = function () {
    browser.tabs.query({ url: "https://squadrats.com/*" }).then(function (tabs) {
      if (!tabs || tabs.length === 0) {
        status("Open a squadrats.com tab first.");
        return;
      }
      return browser.tabs.sendMessage(tabs[0].id, { type: "SQ_IMPORT_FOLLOWS" }).then(function (res) {
        const found = (res && res.users) || [];
        if (found.length === 0) {
          status("No user links found on that page.");
          return;
        }
        return getUsers().then(function (users) {
          let added = 0;
          for (const f of found) {
            if (!UID_RE.test(f.uid)) continue;
            if (users.some(function (u) { return u.uid === f.uid; })) continue;
            users.push({
              uid: f.uid,
              name: f.name || f.uid.slice(0, 6),
              color: colorForUid(f.uid),
              enabled: true,
            });
            added++;
          }
          return setUsers(users).then(function () {
            status("Imported " + added + " user(s).");
          });
        });
      });
    });
  };

  document.getElementById("clear").onclick = function () {
    const obj = {};
    obj[CACHE_BUST_KEY] = Date.now();
    browser.storage.local.set(obj).then(function () {
      status("Cache cleared; open a Komoot plan tab to refetch.");
    });
  };

  browser.storage.onChanged.addListener(function (changes, area) {
    if (area === "local" && changes[USERS_KEY]) refresh();
  });

  refresh();
})();
