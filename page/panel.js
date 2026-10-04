// Page-world script: floating user panel injected into the Komoot page.
(function () {
  const sqp = (window.sqPage = window.sqPage || {});

  const PANEL_ID = "sq-overlay-panel";
  const UID_RE = /^[a-zA-Z0-9]{8,40}$/;

  let users = [];
  let addFormOpen = false;
  let helpOpen = false;
  let statusText = "";

  const style = document.createElement("style");
  style.textContent = [
    "#" + PANEL_ID + "{position:fixed;top:70px;right:12px;z-index:2147483647;",
    "  background:#fff;color:#222;border:1px solid #ccc;border-radius:8px;",
    "  box-shadow:0 2px 10px rgba(0,0,0,.25);font:13px/1.4 sans-serif;",
    "  max-height:60vh;overflow:auto;min-width:220px;max-width:280px;padding:8px;}",
    "#" + PANEL_ID + " .sq-row{display:flex;align-items:center;gap:6px;padding:3px 0;}",
    "#" + PANEL_ID + " .sq-name{flex:1;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
    "#" + PANEL_ID + " .sq-del{cursor:pointer;color:#a33;padding:0 4px;}",
    "#" + PANEL_ID + " input.sq-color{width:22px;height:22px;padding:0;border:1px solid #bbb;border-radius:4px;}",
    "#" + PANEL_ID + " .sq-head{display:flex;align-items:center;gap:6px;font-weight:600;}",
    "#" + PANEL_ID + " .sq-handle{cursor:move;color:#888;padding:2px 4px;user-select:none;touch-action:none;}",
    "#" + PANEL_ID + " .sq-add{cursor:pointer;font-weight:700;font-size:16px;padding:0 6px;}",
    "#" + PANEL_ID + " .sq-help{cursor:pointer;font-weight:700;font-size:14px;padding:0 6px;color:#555;}",
    "#" + PANEL_ID + " .sq-help-box{margin-top:8px;padding-top:8px;border-top:1px solid #ccc;font-size:12px;line-height:1.5;}",
    "#" + PANEL_ID + " .sq-help-box ol{margin:4px 0 4px 18px;padding:0;}",
    "#" + PANEL_ID + " .sq-help-box code{background:#f2f2f2;padding:1px 3px;border-radius:3px;}",
    "#" + PANEL_ID + " .sq-help-close{float:right;cursor:pointer;color:#a33;padding:0 4px;font-weight:700;}",
    "#" + PANEL_ID + " .sq-form{display:flex;flex-direction:column;gap:4px;margin-top:8px;padding-top:8px;border-top:1px solid #ccc;}",
    "#" + PANEL_ID + " .sq-form input{font:13px sans-serif;padding:4px;}",
    "#" + PANEL_ID + " .sq-btns{display:flex;margin-top:2px;}",
    "#" + PANEL_ID + " .sq-btns button{flex:1;font:13px sans-serif;padding:6px 0;cursor:pointer;}",
    "#" + PANEL_ID + " .sq-btn-add{background:#2e7d32;color:#fff;border:1px solid #1b5e20;border-radius:5px 0 0 5px;}",
    "#" + PANEL_ID + " .sq-btn-add:hover{background:#256428;}",
    "#" + PANEL_ID + " .sq-btn-cancel{background:#ececec;color:#333;border:1px solid #999;border-left:none;border-radius:0 5px 5px 0;}",
    "#" + PANEL_ID + " .sq-btn-cancel:hover{background:#d8d8d8;}",
    "#" + PANEL_ID + " .sq-status{color:#777;font-size:12px;}",
  ].join("");
  document.documentElement.appendChild(style);

  function post(msg) {
    if (sqp.postToContent) sqp.postToContent(msg);
  }

  function panel() {
    let el = document.getElementById(PANEL_ID);
    if (!el) {
      el = document.createElement("div");
      el.id = PANEL_ID;
      document.body.appendChild(el);
    }
    return el;
  }

  function renderPanel() {
    const el = panel();
    el.innerHTML = "";

    const head = document.createElement("div");
    head.className = "sq-head";

    const handle = document.createElement("span");
    handle.className = "sq-handle";
    handle.textContent = "\u283f"; // braille grip dots
    handle.title = "Drag to move the panel";
    head.appendChild(handle);

    const title = document.createElement("span");
    title.textContent = "Squadrats";
    head.appendChild(title);

    const addBtn = document.createElement("span");
    addBtn.className = "sq-add";
    addBtn.textContent = "+";
    addBtn.title = "Add user (UID + alias)";
    addBtn.onclick = function () {
      addFormOpen = !addFormOpen;
      renderPanel();
    };
    head.appendChild(addBtn);

    const helpBtn = document.createElement("span");
    helpBtn.className = "sq-help";
    helpBtn.textContent = "?";
    helpBtn.title = "Help: how to find a Squadrats UID";
    helpBtn.onclick = function () {
      helpOpen = !helpOpen;
      renderPanel();
    };
    head.appendChild(helpBtn);
    el.appendChild(head);
    makeDraggable(el, handle);

    for (const u of users) {
      const row = document.createElement("div");
      row.className = "sq-row";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !!u.enabled;
      cb.onchange = function () {
        post({ type: "SQ_SET_ENABLED", uid: u.uid, enabled: cb.checked });
      };
      row.appendChild(cb);

      const swatch = document.createElement("input");
      swatch.type = "color";
      swatch.className = "sq-color";
      swatch.value = u.color;
      swatch.onchange = function () {
        post({ type: "SQ_SET_COLOR", uid: u.uid, color: swatch.value });
      };
      row.appendChild(swatch);

      const name = document.createElement("span");
      name.className = "sq-name";
      name.textContent = u.name || u.uid.slice(0, 6);
      name.title = u.uid;
      name.onclick = function () {
        const input = document.createElement("input");
        input.value = name.textContent;
        name.replaceWith(input);
        input.focus();
        input.select();
        const commit = function () {
          post({ type: "SQ_SET_NAME", uid: u.uid, name: input.value });
        };
        input.onblur = commit;
        input.onkeydown = function (e) {
          if (e.key === "Enter") input.blur();
        };
      };
      row.appendChild(name);

      const del = document.createElement("span");
      del.className = "sq-del";
      del.textContent = "\u00d7";
      del.title = "Remove user";
      del.onclick = function () {
        post({ type: "SQ_REMOVE_USER", uid: u.uid });
      };
      row.appendChild(del);

      el.appendChild(row);
    }

    if (helpOpen) {
      const box = document.createElement("div");
      box.className = "sq-help-box";

      const close = document.createElement("span");
      close.className = "sq-help-close";
      close.textContent = "\u00d7";
      close.title = "Close help";
      close.onclick = function () {
        helpOpen = false;
        renderPanel();
      };
      box.appendChild(close);

      box.appendChild(Object.assign(document.createElement("strong"), { textContent: "How to get a Squadrats UID" }));

      const ol = document.createElement("ol");
      const items = [
        'Open <a href="https://squadrats.com" target="_blank" rel="noopener">squadrats.com</a> and log in.',
        'Open any profile: e.g. <em>Standings</em> \u2192 click a name, or your <em>Profile</em> \u2192 \u201cmy achievements\u201d.',
        'The URL becomes <code>squadrats.com/u/&lt;UID&gt;</code> \u2014 public maps look like <code>squadrats.com/map/&lt;UID&gt;/14</code>.',
        'The UID is the 28-character alphanumeric string after <code>/u/</code>.',
        'Click <strong>+</strong> in this panel, paste the UID, add an optional alias.',
      ];
      for (const html of items) {
        const li = document.createElement("li");
        li.innerHTML = html;
        ol.appendChild(li);
      }
      box.appendChild(ol);

      const note = document.createElement("div");
      note.innerHTML = "Squares shown here come from Squadrats' public data endpoint; they update when that user syncs new activities (cached up to 24 h).";
      note.style.marginTop = "4px";
      note.style.color = "#666";
      box.appendChild(note);

      el.appendChild(box);
    }

    if (addFormOpen) {
      const form = document.createElement("div");
      form.className = "sq-form";

      const uidInput = document.createElement("input");
      uidInput.placeholder = "Squadrats UID";
      const nameInput = document.createElement("input");
      nameInput.placeholder = "Alias (optional)";
      const err = document.createElement("div");
      err.className = "sq-status";

      const submit = function () {
        const uid = uidInput.value.trim();
        if (!UID_RE.test(uid)) {
          err.textContent = "Invalid UID (8-40 alphanumeric)";
          return;
        }
        if (users.some(function (u) { return u.uid === uid; })) {
          err.textContent = "User already added";
          return;
        }
        post({ type: "SQ_ADD_USER", uid: uid, name: nameInput.value.trim() });
        addFormOpen = false;
        renderPanel();
      };

      uidInput.onkeydown = function (e) {
        if (e.key === "Enter") submit();
      };
      nameInput.onkeydown = function (e) {
        if (e.key === "Enter") submit();
      };

      const buttons = document.createElement("div");
      buttons.className = "sq-btns";
      const addBtn = document.createElement("button");
      addBtn.className = "sq-btn-add";
      addBtn.textContent = "Add";
      addBtn.onclick = submit;
      const cancelBtn = document.createElement("button");
      cancelBtn.className = "sq-btn-cancel";
      cancelBtn.textContent = "Cancel";
      cancelBtn.onclick = function () {
        addFormOpen = false;
        renderPanel();
      };
      buttons.appendChild(addBtn);
      buttons.appendChild(cancelBtn);

      form.appendChild(uidInput);
      form.appendChild(nameInput);
      form.appendChild(buttons);
      form.appendChild(err);
      el.appendChild(form);
    }

    if (statusText) {
      const st = document.createElement("div");
      st.className = "sq-status";
      st.textContent = statusText;
      el.appendChild(st);
    }
  }

  // Drag the panel by its handle. Switches from right-anchored to
  // left/top positioning once the user grabs it.
  function makeDraggable(el, handle) {
    // Re-attached on every renderPanel(): the handle element is recreated
    // each render, so old listeners die with the old node. Position itself
    // lives on el.style and survives re-renders.
    handle.addEventListener("pointerdown", function (down) {
      const rect = el.getBoundingClientRect();
      const offX = down.clientX - rect.left;
      const offY = down.clientY - rect.top;
      handle.setPointerCapture(down.pointerId);

      function onMove(e) {
        const left = Math.min(
          Math.max(e.clientX - offX, 4),
          window.innerWidth - rect.width - 4
        );
        const top = Math.min(
          Math.max(e.clientY - offY, 4),
          window.innerHeight - 40
        );
        el.style.left = left + "px";
        el.style.top = top + "px";
        el.style.right = "auto";
      }

      function onUp(e) {
        handle.releasePointerCapture(down.pointerId);
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
      }

      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
      down.preventDefault();
    });
  }

  window.addEventListener("message", function (e) {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d.source !== "sq-overlay-cs") return;
    if (d.type === "SQ_RENDER") {
      users = d.users || [];
      renderPanel();
    } else if (d.type === "SQ_STATUS") {
      statusText = d.message || "";
      renderPanel();
    }
  });

  console.log("[sq-overlay] panel installed");
})();
