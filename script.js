(function () {
  "use strict";
  var debugBox = document.getElementById("debugBox");
  function debug(msg) {
}
  window.onerror = function (message, source, lineno, colno) {
    debug("JS ERROR: " + message + " @ " + lineno + ":" + colno);
    return false;
  };
  function xhr(url, cb, method) {
    var r = new XMLHttpRequest();
    r.open(method || "GET", url, true);
    r.timeout = 25000;
    r.onload = function () {
      if (r.status >= 200 && r.status < 300) cb(null, r.responseText, r);
      else cb("HTTP " + r.status, null, r);
    };
    r.onerror = r.ontimeout = function () { cb("NETWORK/TIMEOUT", null, r); };
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
    var rows = [], row = [];
    var cur = "", q = false;
    for (var i = 0; i < t.length; i++) {
      var c = t[i], n = t[i + 1];
      if (c == '"' && q && n == '"') { cur += '"'; i++; }
      else if (c == '"') { q = !q; }
      else if (c == "," && !q) { row.push(cur); cur = ""; }
      else if ((c == "\n" || c == "\r") && !q) {
        if (cur || row.length) { row.push(cur); rows.push(row.slice()); }
        row.length = 0; cur = "";
      } else { cur += c; }
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }
  function sameData(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function tickClock() {
    var d = new Date();
    function pad(n) { return n < 10 ? "0" + n : "" + n; }
    var timeEl = document.getElementById("timeLocal");
    var dateEl = document.getElementById("dateLocal");
    if (timeEl) timeEl.textContent = pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
    if (dateEl) dateEl.textContent = d.toDateString();
  }
  setInterval(tickClock, 1000);
  tickClock();
  function loadWeather() {
    var el = document.getElementById("weatherCairo");
    if (!el) return;
    var url = "https://api.open-meteo.com/v1/forecast?latitude=30.0444&longitude=31.2357&current=temperature_2m";
    xhr(url, function (err, res) {
      if (err) { el.textContent = "--"; return; }
      try { var j = JSON.parse(res); el.textContent = Math.round(j.current.temperature_2m) + "°C"; }
      catch (e) { el.textContent = "--"; }
    });
  }
  loadWeather();
  setInterval(loadWeather, 10 * 60 * 1000);
  var TABLE_REFRESH_MS = 5 * 60 * 1000;        // every 5 minutes (data saving)
  var MANIFEST_REFRESH_MS = 6 * 60 * 60 * 1000; // every 6 hours
  var MEDIA_PATH = "media/shared/";
  var MANIFEST_URL = MEDIA_PATH + "manifest.json";
  var frame = document.getElementById("mediaFrame");
  var statusEl = document.getElementById("mediaStatus");
  var logoFallback = document.getElementById("mediaLogoFallback");
  var playlist = [];
  var idx = 0;
  var nextTimer = null;
  function mediaUrl(src) {
    return MEDIA_PATH + src;
  }
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
      try { vids[0].pause(); } catch (_) {}
      try { vids[0].removeAttribute("src"); } catch (_) {}
      try { vids[0].load(); } catch (_) {}
      if (vids[0].parentNode) vids[0].parentNode.removeChild(vids[0]);
    }
  }
  function ensureImageLayer(id) {
    var img = document.getElementById(id);
    if (img) return img;
    img = document.createElement("img");
    img.id = id;
    img.decoding = "async";
    img.loading = "eager";
    img.referrerPolicy = "no-referrer";
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
    img.style.transition = "opacity 650ms ease";
    img.style.willChange = "opacity";
    frame.appendChild(img);
    return img;
  }
  var imgA = ensureImageLayer("mediaImgA");
  var imgB = ensureImageLayer("mediaImgB");
  var imgAOnTop = true;
  function topImg() { return imgAOnTop ? imgA : imgB; }
  function backImg() { return imgAOnTop ? imgB : imgA; }
  var preloaded = { src: null, ok: false };
  function preloadImage(src) {
    preloaded.src = src;
    preloaded.ok = false;
    var im = new Image();
    im.decoding = "async";
    im.onload = function () { preloaded.ok = true; };
    im.onerror = function () { preloaded.ok = false; };
    im.src = mediaUrl(src);
  }
  function swapToImage(src) {
    var back = backImg();
    var front = topImg();
    back.style.opacity = "0";
    back.src = "";
    var done = false;
    var IMAGE_TIMEOUT_MS = 40000;
    var hang = setTimeout(function () {
      if (done) return;
      done = true;
      setMediaStatus("Image timeout, skipping…");
      scheduleNext(900);
    }, IMAGE_TIMEOUT_MS);
    back.onload = function () {
      if (done) return;
      done = true;
      clearTimeout(hang);
      back.style.opacity = "1";
      front.style.opacity = "0";
      imgAOnTop = !imgAOnTop;
      setMediaStatus("");
    };
    back.onerror = function () {
      if (done) return;
      done = true;
      clearTimeout(hang);
      setMediaStatus("Image failed, skipping…");
      scheduleNext(900);
    };
    back.src = mediaUrl(src);
  }
  function playImage(src, durationSec) {
    hideLogoFallback();
    removeVideo();
    var dur = (durationSec || 15) * 1000;
    if (dur < 3000) dur = 3000;
    setMediaStatus("Loading image…");
    swapToImage(src);
    scheduleNext(dur);
    var next = playlist[(idx) % playlist.length];
    if (next && next.type === "image" && next.src) preloadImage(next.src);
  }
  function playVideo(src) {
    hideLogoFallback();
    removeVideo();
    setMediaStatus("Loading video…");
    var v = document.createElement("video");
    v.src = mediaUrl(src);
    v.autoplay = true;
    v.muted = false;
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
    v.style.background = "transparent";
    frame.appendChild(v);
    var started = false;
    var lastT = -1;
    var stallAt = Date.now();
    var firstFrameTimer = setTimeout(function () {
      if (!started) {
        setMediaStatus("Video can't start, skipping…");
        removeVideo();
        scheduleNext(1200);
      }
    }, 30000);
    function failVideo(msg) {
      clearTimeout(firstFrameTimer);
      setMediaStatus(msg || "Video error, skipping…");
      removeVideo();
      scheduleNext(1200);
    }
    v.ontimeupdate = function () {
      if (v.currentTime !== lastT) {
        lastT = v.currentTime;
        started = true;
        stallAt = Date.now();
        setMediaStatus("");
      }
      if (Date.now() - stallAt > 45000) {
        failVideo("Video froze, skipping…");
      }
    };
    v.onended = function () {
      clearTimeout(firstFrameTimer);
      removeVideo();
      scheduleNext(600);
    };
    v.onerror = function () {
      failVideo("Video error, skipping…");
    };
    v.onwaiting = function () {
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
      scheduleNext(600);
      return;
    }
    if (item.type === "image") return playImage(item.src, item.duration || 15);
    if (item.type === "video") return playVideo(item.src);
    scheduleNext(600);
  }
  function loadManifest(silent) {
    if (!silent) {
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
        playlist = items || [];
        if (!playlist.length) {
          showLogoFallback();
          setMediaStatus("No media found (manifest empty)");
          return;
        }
        if (!silent) {
          idx = 0;
          playNext();
        }
      } catch (e) {
        if (!silent) setMediaStatus("Manifest JSON error");
        showLogoFallback();
      }
    });
  }
  showLogoFallback();
  loadManifest(false);
  setInterval(function () { loadManifest(true); }, MANIFEST_REFRESH_MS);
  var CSV_PROGRESS =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vQX1ojIMJ_lzxRR6vSD-H4Vw-IqunKMRXUyZT-23nGZikVrigEVHRfhtOItUHtbnnF1FGUrjpHnkfLk/pub?gid=2111665249&single=true&output=csv";
  var CSV_REVISIT =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vQX1ojIMJ_lzxRR6vSD-H4Vw-IqunKMRXUyZT-23nGZikVrigEVHRfhtOItUHtbnnF1FGUrjpHnkfLk/pub?gid=1391443977&single=true&output=csv";
  var progressBody = document.getElementById("progressBody");
  var revisitBody = document.getElementById("revisitBody");
  var boardMeta = document.getElementById("boardMeta");
  var revisitMeta = document.getElementById("revisitMeta");
  var progressData = [];
  var revisitData = [];
  var progressPage = 0;
  var revisitPage = 0;
  var PROGRESS_ROWS_PER_PAGE = 9;
  var REVISIT_ROWS_PER_PAGE = 9;
  var PAGE_SWITCH_MS = 4000;
  var progressTimer = null;
  var revisitTimer = null;
  function stopPaging() {
    if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
    if (revisitTimer) { clearInterval(revisitTimer); revisitTimer = null; }
  }
  function renderProgress() {
    if (!progressBody) return;

    if (!progressData.length) {
      progressBody.innerHTML = '<tr><td colspan="5" class="muted">No cars in progress</td></tr>';
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
      html += "<tr>" +
        "<td>" + esc(r.customer) + "</td>" +
        "<td>" + esc(r.model) + "</td>" +
        "<td>" + esc(r.year) + "</td>" +
        "<td>" + esc(r.chassis) + "</td>" +
        "<td>" + esc(r.film) + "</td>" +
      "</tr>";
    }
    progressBody.innerHTML = html;
    if (boardMeta) boardMeta.textContent = "Live · " + progressData.length + " · Page " + (progressPage + 1) + "/" + pages;
    progressPage++;
  }
  function renderRevisit() {
    if (!revisitBody) return;

    if (!revisitData.length) {
      revisitBody.innerHTML = '<tr><td colspan="4" class="muted">No bookings today</td></tr>';
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
      html += "<tr>" +
        "<td>" + esc(r.status) + "</td>" +
        "<td>" + esc(r.name) + "</td>" +
        "<td>" + esc(r.car) + "</td>" +
        "<td>" + esc(r.color) + "</td>" +
      "</tr>";
    }
    revisitBody.innerHTML = html;
    if (revisitMeta) revisitMeta.textContent = "Live · " + revisitData.length + " · Page " + (revisitPage + 1) + "/" + pages;
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
    xhr(CSV_PROGRESS, function (err, res) {
      if (err) { if (boardMeta) boardMeta.textContent = "Offline"; return; }
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
        if (!sameData(progressData, data)) {
          progressData = data;
          progressPage = 0;
          startPaging();
        }
        debug("Progress rows=" + progressData.length);
      } catch (e) {
        if (boardMeta) boardMeta.textContent = "Error";
      }
    });
  }
  function loadRevisit() {
    if (revisitMeta) revisitMeta.textContent = "Updating…";
    xhr(CSV_REVISIT, function (err, res) {
      if (err) { if (revisitMeta) revisitMeta.textContent = "Offline"; return; }
      try {
        var rows = parseCSV(res).slice(1);
        var data = [];
        for (var i = 0; i < rows.length; i++) {
          var r = rows[i];
          var status = (r[0] || "").trim(); // A
          var name = (r[4] || "").trim();   // (kept as you had)
          var car = (r[6] || "").trim();    // (kept as you had)
          var color = (r[7] || "").trim();  // (kept as you had)
          if (!name) continue;
          data.push({ status: status, name: name, car: car, color: color });
        }
        if (!sameData(revisitData, data)) {
          revisitData = data;
          revisitPage = 0;
          startPaging();
        }
        debug("Revisit rows=" + revisitData.length);
      } catch (e) {
        if (revisitMeta) revisitMeta.textContent = "Error";
      }
    });
  }
  var refreshBtn = document.getElementById("refreshBtn");
  if (refreshBtn) {
    refreshBtn.onclick = function () {
      loadManifest(false);
      loadProgress();
      loadRevisit();
    };
  }
  loadProgress();
  loadRevisit();
  startPaging();
  setInterval(loadProgress, TABLE_REFRESH_MS);
  setInterval(loadRevisit, TABLE_REFRESH_MS);
  debug("Ready ✓ (Muted autoplay + Buffer watchdog + Server-time sync)");
})();
