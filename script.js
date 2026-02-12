// script.js
(function () {
  "use strict";

  // ===== Helpers =====
  var debugBox = document.getElementById("debugBox");
  function debug(msg) {
    if (debugBox) debugBox.textContent = msg;
  }

  window.onerror = function (message, source, lineno, colno) {
    debug("JS ERROR: " + message + " @ " + lineno + ":" + colno);
    return false;
  };

  function xhr(url, cb) {
    var r = new XMLHttpRequest();
    r.open("GET", url, true);
    r.timeout = 25000;
    r.onload = function () {
      if (r.status >= 200 && r.status < 300) cb(null, r.responseText);
      else cb("HTTP " + r.status);
    };
    r.onerror = r.ontimeout = function () {
      cb("NETWORK/TIMEOUT");
    };
    r.send();
  }

  function esc(s) {
    s = s === undefined || s === null ? "" : String(s);
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function parseCSV(t) {
    var rows = [],
      row = [];
    var cur = "",
      q = false;
    for (var i = 0; i < t.length; i++) {
      var c = t[i],
        n = t[i + 1];
      if (c == '"' && q && n == '"') {
        cur += '"';
        i++;
      } else if (c == '"') {
        q = !q;
      } else if (c == "," && !q) {
        row.push(cur);
        cur = "";
      } else if ((c == "\n" || c == "\r") && !q) {
        if (cur || row.length) {
          row.push(cur);
          rows.push(row.slice());
        }
        row.length = 0;
        cur = "";
      } else {
        cur += c;
      }
    }
    if (cur || row.length) {
      row.push(cur);
      rows.push(row);
    }
    return rows;
  }

  // ===== Clock =====
  function tickClock() {
    var d = new Date();
    function pad(n) {
      return n < 10 ? "0" + n : "" + n;
    }
    var timeEl = document.getElementById("timeLocal");
    var dateEl = document.getElementById("dateLocal");
    if (timeEl)
      timeEl.textContent =
        pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
    if (dateEl) dateEl.textContent = d.toDateString();
  }
  setInterval(tickClock, 1000);
  tickClock();

  // ===== Weather (Cairo) =====
  function loadWeather() {
    var el = document.getElementById("weatherCairo");
    if (!el) return;
    var url =
      "https://api.open-meteo.com/v1/forecast?latitude=30.0444&longitude=31.2357&current=temperature_2m";
    xhr(url + "&t=" + Date.now(), function (err, res) {
      if (err) {
        el.textContent = "--";
        return;
      }
      try {
        var j = JSON.parse(res);
        el.textContent = Math.round(j.current.temperature_2m) + "°C";
      } catch (e) {
        el.textContent = "--";
      }
    });
  }
  loadWeather();
  setInterval(loadWeather, 10 * 60 * 1000);

  // ===== LIVE UPDATE SETTINGS =====
  var TABLE_REFRESH_MS = 60 * 1000; // tables live refresh
var MANIFEST_REFRESH_MS = 3 * 60 * 60 * 1000; // manifest refresh every 3 hours

  // ===== MEDIA PLAYER =====
  var MEDIA_PATH = "media/shared/";
  var MANIFEST_URL = MEDIA_PATH + "manifest.json";

  var frame = document.getElementById("mediaFrame");
  var statusEl = document.getElementById("mediaStatus");
  var logoFallback = document.getElementById("mediaLogoFallback");

  var playlist = [];
  var idx = 0;
  var nextTimer = null;

  function setMediaStatus(t) {
    if (statusEl) statusEl.textContent = t || "";
  }

  function showLogoFallback() {
    if (logoFallback) logoFallback.style.opacity = "1";
  }
  function hideLogoFallback() {
    if (logoFallback) logoFallback.style.opacity = "0";
  }

  function clearNext() {
    if (nextTimer) {
      clearTimeout(nextTimer);
      nextTimer = null;
    }
  }
  function scheduleNext(ms) {
    clearNext();
    nextTimer = setTimeout(playNext, ms);
  }

  function removeVideo() {
    if (!frame) return;
    var vids = frame.getElementsByTagName("video");
    if (vids && vids[0]) {
      try {
        vids[0].pause();
      } catch (_) {}
      try {
        vids[0].removeAttribute("src");
      } catch (_) {}
      try {
        vids[0].load();
      } catch (_) {}
      if (vids[0].parentNode) vids[0].parentNode.removeChild(vids[0]);
    }
  }

  function ensureOverlayImage() {
    var img = document.getElementById("mediaOverlayImage");
    if (img) return img;
    img = document.createElement("img");
    img.id = "mediaOverlayImage";
    img.style.position = "absolute";
    img.style.left = "0";
    img.style.top = "0";
    img.style.right = "0";
    img.style.bottom = "0";
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "contain";
    img.style.background = "#000";
    img.style.opacity = "0";
    img.style.transition = "opacity 600ms ease";
    frame.appendChild(img);
    return img;
  }

  function playImage(src, durationSec) {
    hideLogoFallback();
    removeVideo();
    var overlay = ensureOverlayImage();
    overlay.style.opacity = "0";
    overlay.src = "";

    var dur = (durationSec || 15) * 1000;
    if (dur < 3000) dur = 3000;

    setMediaStatus("Loading image…");

    var done = false;
    var hang = setTimeout(function () {
      if (done) return;
      done = true;
      setMediaStatus("Image timeout, skipping…");
      overlay.style.opacity = "0";
      showLogoFallback();
      scheduleNext(900);
    }, 12000);

    overlay.onload = function () {
      if (done) return;
      done = true;
      clearTimeout(hang);
      setMediaStatus("");
      overlay.style.opacity = "1";
      scheduleNext(dur);
    };

    overlay.onerror = function () {
      if (done) return;
      done = true;
      clearTimeout(hang);
      setMediaStatus("Image failed, skipping…");
      overlay.style.opacity = "0";
      showLogoFallback();
      scheduleNext(900);
    };

    overlay.src = MEDIA_PATH + src + "?t=" + Date.now();
  }

  function playVideo(src) {
    hideLogoFallback();
    var overlay = ensureOverlayImage();
    overlay.style.opacity = "0";
    removeVideo();

    setMediaStatus("Loading video…");

    var v = document.createElement("video");
    v.src = MEDIA_PATH + src + "?t=" + Date.now();
    v.autoplay = true;
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.setAttribute("webkit-playsinline", "true");
    v.setAttribute("playsinline", "true");

    v.style.position = "absolute";
    v.style.left = "0";
    v.style.top = "0";
    v.style.right = "0";
    v.style.bottom = "0";
    v.style.width = "100%";
    v.style.height = "100%";
    v.style.objectFit = "cover";
    v.style.background = "#000";

    frame.appendChild(v);

    var started = false;
    var lastT = -1;
    var stallAt = Date.now();

    var firstFrameTimer = setTimeout(function () {
      if (!started) {
        setMediaStatus("Video can't start, skipping…");
        removeVideo();
        showLogoFallback();
        scheduleNext(1200);
      }
    }, 25000);

    function failVideo(msg) {
      clearTimeout(firstFrameTimer);
      setMediaStatus(msg || "Video error, skipping…");
      removeVideo();
      showLogoFallback();
      scheduleNext(1200);
    }

    v.ontimeupdate = function () {
      if (v.currentTime !== lastT) {
        lastT = v.currentTime;
        started = true;
        stallAt = Date.now();
        setMediaStatus("");
        hideLogoFallback();
      }
      if (Date.now() - stallAt > 30000) {
        failVideo("Video froze, skipping…");
      }
    };

    v.onended = function () {
      clearTimeout(firstFrameTimer);
      removeVideo();
      showLogoFallback();
      scheduleNext(600);
    };
    v.onerror = function () {
      failVideo("Video error, skipping…");
    };
    v.onwaiting = function () {
      showLogoFallback();
      setMediaStatus("Buffering…");
    };

    try {
      var p = v.play();
      if (p && p.catch) p.catch(function () { failVideo("Autoplay blocked"); });
    } catch (e) {
      failVideo("Play failed");
    }
  }

  function playNext() {
    clearNext();

    if (!playlist.length) {
      showLogoFallback();
      setMediaStatus("No media found (manifest empty)");
      return;
    }

    var item = playlist[idx];
    idx = (idx + 1) % playlist.length;

    if (!item || !item.type || !item.src) {
      showLogoFallback();
      scheduleNext(600);
      return;
    }

    if (item.type === "image") return playImage(item.src, item.duration || 15);
    if (item.type === "video") return playVideo(item.src);

    showLogoFallback();
    scheduleNext(600);
  }

  function loadManifest(silent) {
    if (!silent) {
      showLogoFallback();
      setMediaStatus("Loading media…");
    }

    xhr(MANIFEST_URL + "?t=" + Date.now(), function (err, res) {
      if (err) {
        if (!silent) setMediaStatus("Manifest offline (" + err + ")");
        showLogoFallback();
        return;
      }
      try {
        var j = JSON.parse(res);
        var items = (j && j.items) ? j.items : [];
        var changed = JSON.stringify(items) !== JSON.stringify(playlist);
        if (changed) {
          playlist = items;
          idx = 0;
          if (!silent) playNext();
          debug("Manifest updated items=" + playlist.length);
        }
      } catch (e) {
        if (!silent) setMediaStatus("Manifest JSON error");
        showLogoFallback();
      }
    });
  }

  // start media
  showLogoFallback();
  loadManifest(false);
  setInterval(function () { loadManifest(true); }, MANIFEST_REFRESH_MS);

  // ===== TABLES (LIVE) =====
  var CSV_PROGRESS =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vSKpulVdyocoyi3Vj-BHBG9aOcfsG-QkgLtwlLGjbWFy_YkTmiN5mOsiYfWS6_sqLNtS4hCie2c3JDH/pub?gid=2111665249&single=true&output=csv";

  var CSV_REVISIT =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vSKpulVdyocoyi3Vj-BHBG9aOcfsG-QkgLtwlLGjbWFy_YkTmiN5mOsiYfWS6_sqLNtS4hCie2c3JDH/pub?gid=1236474828&single=true&output=csv";

  var progressBody = document.getElementById("progressBody");
  var revisitBody = document.getElementById("revisitBody");
  var boardMeta = document.getElementById("boardMeta");
  var revisitMeta = document.getElementById("revisitMeta");

  var progressData = [];
  var revisitData = [];
  var progressPage = 0;
  var revisitPage = 0;

  // ✅ Added 2 more rows each
  var PROGRESS_ROWS_PER_PAGE = 9; // was 7
  var REVISIT_ROWS_PER_PAGE = 8;  // was 6
  var PAGE_SWITCH_MS = 3500;

  var progressTimer = null;
  var revisitTimer = null;

  function stopPaging() {
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
    if (revisitTimer) {
      clearInterval(revisitTimer);
      revisitTimer = null;
    }
  }

  function renderProgress() {
    if (!progressBody) return;

    if (!progressData.length) {
      progressBody.innerHTML =
        '<tr><td colspan="5" class="muted">No cars in progress</td></tr>';
      if (boardMeta) boardMeta.textContent = "Live · 0";
      return;
    }

    var pages = Math.ceil(progressData.length / PROGRESS_ROWS_PER_PAGE);
    if (progressPage >= pages) progressPage = 0;

    var start = progressPage * PROGRESS_ROWS_PER_PAGE;
    var slice = progressData.slice(start, start + PROGRESS_ROWS_PER_PAGE);

    var html = "";
    for (var i = 0; i < slice.length; i++) {
      var r = slice[i];
      html +=
        "<tr>" +
        "<td>" + esc(r.customer) + "</td>" +
        "<td>" + esc(r.model) + "</td>" +
        "<td>" + esc(r.year) + "</td>" +
        "<td>" + esc(r.chassis) + "</td>" +
        "<td>" + esc(r.film) + "</td>" +
        "</tr>";
    }

    progressBody.innerHTML = html;
    if (boardMeta)
      boardMeta.textContent =
        "Live · " + progressData.length + " · Page " + (progressPage + 1) + "/" + pages;

    progressPage++;
  }

  function renderRevisit() {
    if (!revisitBody) return;

    if (!revisitData.length) {
      revisitBody.innerHTML =
        '<tr><td colspan="4" class="muted">No bookings today</td></tr>';
      if (revisitMeta) revisitMeta.textContent = "Live · 0";
      return;
    }

    var pages = Math.ceil(revisitData.length / REVISIT_ROWS_PER_PAGE);
    if (revisitPage >= pages) revisitPage = 0;

    var start = revisitPage * REVISIT_ROWS_PER_PAGE;
    var slice = revisitData.slice(start, start + REVISIT_ROWS_PER_PAGE);

    var html = "";
    for (var i = 0; i < slice.length; i++) {
      var r = slice[i];
      html +=
        "<tr>" +
        "<td>" + esc(r.status) + "</td>" +
        "<td>" + esc(r.name) + "</td>" +
        "<td>" + esc(r.car) + "</td>" +
        "<td>" + esc(r.color) + "</td>" +
        "</tr>";
    }

    revisitBody.innerHTML = html;
    if (revisitMeta)
      revisitMeta.textContent =
        "Live · " + revisitData.length + " · Page " + (revisitPage + 1) + "/" + pages;

    revisitPage++;
  }

  function startPaging() {
    stopPaging();
    renderProgress();
    renderRevisit();
    progressTimer = setInterval(renderProgress, PAGE_SWITCH_MS);
    revisitTimer = setInterval(renderRevisit, PAGE_SWITCH_MS);
  }

  function loadProgress() {
    if (boardMeta) boardMeta.textContent = "Updating…";
    xhr(CSV_PROGRESS + "&t=" + Date.now(), function (err, res) {
      if (err) {
        if (boardMeta) boardMeta.textContent = "Offline";
        return;
      }
      try {
        var rows = parseCSV(res).slice(1);
        var data = [];

        for (var i = 0; i < rows.length; i++) {
          var r = rows[i];
          var customer = (r[4] || "").trim(); // E
          var model = (r[6] || "").trim();    // G
          var year = (r[8] || "").trim();     // I
          var chassis = (r[9] || "").trim();  // J
          var film = (r[10] || "").trim();    // K
          if (!customer) continue;
          data.push({ customer: customer, model: model, year: year, chassis: chassis, film: film });
        }

        progressData = data;
        progressPage = 0;
        startPaging();
        debug("Progress live rows=" + progressData.length);
      } catch (e) {
        if (boardMeta) boardMeta.textContent = "Error";
      }
    });
  }

  function loadRevisit() {
    if (revisitMeta) revisitMeta.textContent = "Updating…";
    xhr(CSV_REVISIT + "&t=" + Date.now(), function (err, res) {
      if (err) {
        if (revisitMeta) revisitMeta.textContent = "Offline";
        return;
      }
      try {
        var rows = parseCSV(res).slice(1);
        var data = [];

        for (var i = 0; i < rows.length; i++) {
          var r = rows[i];
          var status = (r[0] || "").trim(); // A
          var name = (r[3] || "").trim();   // D
          var car = (r[5] || "").trim();    // F
          var color = (r[6] || "").trim();  // G
          if (!name) continue;
          data.push({ status: status, name: name, car: car, color: color });
        }

        revisitData = data;
        revisitPage = 0;
        startPaging();
        debug("Revisit live rows=" + revisitData.length);
      } catch (e) {
        if (revisitMeta) revisitMeta.textContent = "Error";
      }
    });
  }

  // Manual refresh
  var refreshBtn = document.getElementById("refreshBtn");
  if (refreshBtn) {
    refreshBtn.onclick = function () {
      loadManifest(false);
      loadProgress();
      loadRevisit();
    };
  }

  // Initial + Live auto-refresh
  loadProgress();
  loadRevisit();
  startPaging();

  setInterval(loadProgress, TABLE_REFRESH_MS);
  setInterval(loadRevisit, TABLE_REFRESH_MS);

  debug("Ready ✓");

})();

