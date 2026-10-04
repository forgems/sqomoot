(function () {
  const sq = (window.sqOverlay = window.sqOverlay || {});

  function djb2(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    }
    return h;
  }

  function hslToHex(h, s, l) {
    const f = function (n) {
      const k = (n + h / 30) % 12;
      const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return Math.round(255 * c)
        .toString(16)
        .padStart(2, "0");
    };
    return "#" + f(0) + f(8) + f(4);
  }

  // Golden-ratio hue spacing keyed off a per-uid hash: distinct, stable colors.
  function colorForUid(uid) {
    const h = djb2(uid);
    const hue = (h * 0.618033988749895) % 1 * 360;
    const sat = 0.55 + (h % 100) / 100 * 0.25;
    const light = 0.38 + (h % 37) / 37 * 0.12;
    return hslToHex(hue, sat, light);
  }

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

  sq.colors = { colorForUid, lighten };
})();
