/* Meuxe landing: tabbed views, OS-detected downloads, rendered changelog.
 * No build step - plain script loaded by index.html. */
(function () {
  "use strict";

  var REPO = "meet447/Meuxe";
  var RELEASES_URL = "https://github.com/" + REPO + "/releases/latest";
  var API_LATEST = "https://api.github.com/repos/" + REPO + "/releases/latest";
  var CHANGELOG_RAW =
    "https://raw.githubusercontent.com/" + REPO + "/main/CHANGELOG.md";
  var CHANGELOG_BLOB = "https://github.com/" + REPO + "/blob/main/CHANGELOG.md";

  /* ── Helpers ── */

  function fmtSize(bytes) {
    if (typeof bytes !== "number" || !isFinite(bytes)) return "";
    var mb = bytes / (1024 * 1024);
    if (mb >= 1) return mb.toFixed(1) + " MB";
    var kb = bytes / 1024;
    return Math.max(1, Math.round(kb)) + " KB";
  }

  function fmtDate(iso) {
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch (e) {
      return "";
    }
  }

  function pickAsset(assets, test) {
    for (var i = 0; i < assets.length; i++) {
      if (test(assets[i].name)) return assets[i];
    }
    return null;
  }

  function setBtn(id, asset, label) {
    var el = document.getElementById(id);
    if (!el) return false;
    if (!asset) {
      el.setAttribute("aria-disabled", "true");
      el.classList.add("is-disabled");
      el.removeAttribute("href");
      return false;
    }
    el.href = asset.browser_download_url;
    var name = el.querySelector(".dl-btn-label");
    if (name) name.textContent = label || asset.name;
    var meta = document.getElementById(id + "-meta");
    if (meta) {
      var parts = [asset.name, fmtSize(asset.size)].filter(Boolean);
      meta.textContent = parts.join(" · ");
    }
    return true;
  }

  /* ── OS detection ── */

  function detectOS() {
    var ua = (navigator.userAgent || "") + " " + (navigator.platform || "");
    if (/Mac|iPhone|iPad|iPod/i.test(ua)) return "mac";
    if (/Linux|X11/i.test(ua) && !/Android/i.test(ua)) return "linux";
    return "other";
  }

  /* ── Release fetching (shared: hero button + downloads tab) ── */

  var releaseData = null;

  function loadRelease() {
    fetch(API_LATEST, { headers: { Accept: "application/vnd.github+json" } })
      .then(function (res) {
        if (!res.ok) throw new Error("release API " + res.status);
        return res.json();
      })
      .then(function (rel) {
        releaseData = rel;
        updateHeroButton();
        updateDownloadsTab();
      })
      .catch(function () {
        showDownloadFallback();
      });
  }

  function updateHeroButton() {
    var btn = document.getElementById("hero-download");
    if (!btn || !releaseData) return;
    var assets = Array.isArray(releaseData.assets) ? releaseData.assets : [];
    var os = detectOS();
    var asset = null;
    var label = "Download";
    if (os === "mac") {
      asset = pickAsset(assets, function (n) {
        return /\.dmg$/i.test(n);
      });
      label = "Download for Mac";
    } else if (os === "linux") {
      asset = pickAsset(assets, function (n) {
        return /\.deb$/i.test(n);
      });
      label = "Download for Linux";
    }
    var labelEl = btn.querySelector(".hero-dl-label");
    if (asset) {
      btn.href = asset.browser_download_url;
      if (labelEl) labelEl.textContent = label;
    } else {
      btn.href = RELEASES_URL;
      if (labelEl) labelEl.textContent = "Download";
    }
  }

  function updateDownloadsTab() {
    var lead = document.getElementById("download-lead");
    var grid = document.getElementById("dl-grid");
    var fallback = document.getElementById("dl-fallback");
    if (!releaseData) return;
    var assets = Array.isArray(releaseData.assets) ? releaseData.assets : [];
    var dmg = pickAsset(assets, function (n) {
      return /\.dmg$/i.test(n);
    });
    var deb = pickAsset(assets, function (n) {
      return /\.deb$/i.test(n);
    });
    var appimage = pickAsset(assets, function (n) {
      return /\.AppImage$/i.test(n) && !/\.zsync/i.test(n);
    });
    var version = releaseData.tag_name || releaseData.name || "latest";
    var date = releaseData.published_at ? fmtDate(releaseData.published_at) : "";
    var pre = releaseData.prerelease ? " · prerelease" : "";
    if (lead) lead.textContent = version + (date ? " · " + date : "") + pre;
    setBtn("dl-mac", dmg, dmg ? "Download for Mac" : null);
    setBtn("dl-deb", deb, deb ? "Download .deb" : null);
    setBtn("dl-appimage", appimage, appimage ? "Download .AppImage" : null);
    if (grid) grid.hidden = false;
    if (fallback) fallback.hidden = true;
  }

  function showDownloadFallback() {
    var grid = document.getElementById("dl-grid");
    var fallback = document.getElementById("dl-fallback");
    var lead = document.getElementById("download-lead");
    if (grid) grid.hidden = true;
    if (fallback) fallback.hidden = false;
    if (lead) lead.textContent = "Grab the newest build from GitHub Releases.";
  }

  /* ── Minimal markdown subset for CHANGELOG.md ── */

  function inlineMd(text) {
    var esc = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    esc = esc.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (m, t, u) {
      var safe = u.replace(/"/g, "%22");
      return (
        '<a href="' + safe + '" rel="noopener noreferrer">' + t + "</a>"
      );
    });
    esc = esc.replace(/`([^`]+)`/g, "<code>$1</code>");
    esc = esc.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    return esc;
  }

  /* Parse CHANGELOG.md into an array of version entries.
   * Each entry: { heading: string, lines: string[] } */
  function mdToEntries(md) {
    var lines = md.replace(/\r\n/g, "\n").split("\n");
    var start = 0;
    for (var i = 0; i < lines.length; i++) {
      if (/^##\s/.test(lines[i])) {
        start = i;
        break;
      }
    }
    lines = lines.slice(start);
    var entries = [];
    var current = null;
    for (var j = 0; j < lines.length; j++) {
      var match = lines[j].match(/^##\s+(.*)$/);
      if (match) {
        if (current && !/\[Unreleased\]/i.test(current.heading))
          entries.push(current);
        current = { heading: match[1].trim(), lines: [] };
      } else if (current) {
        current.lines.push(lines[j]);
      }
    }
    if (current && !/\[Unreleased\]/i.test(current.heading))
      entries.push(current);
    return entries;
  }

  /* Render a single changelog entry as an HTML card. */
  function renderEntry(entry) {
    var html =
      '<article class="cl-card ring-hairline"><h3>' +
      inlineMd(entry.heading) +
      "</h3>";
    var inList = false;
    var inCode = false;
    function closeList() {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
    }
    for (var j = 0; j < entry.lines.length; j++) {
      var line = entry.lines[j];
      if (/^```/.test(line)) {
        closeList();
        html += inCode ? "</code></pre>" : "<pre><code>";
        inCode = !inCode;
        continue;
      }
      if (inCode) {
        html += line.replace(/&/g, "&amp;").replace(/</g, "&lt;") + "\n";
        continue;
      }
      var h3 = line.match(/^###\s+(.*)$/);
      if (h3) {
        closeList();
        html += "<h4>" + inlineMd(h3[1].trim()) + "</h4>";
        continue;
      }
      var li = line.match(/^\s*[-*]\s+(.*)$/);
      if (li) {
        if (!inList) {
          html += "<ul>";
          inList = true;
        }
        html += "<li>" + inlineMd(li[1]) + "</li>";
        continue;
      }
      if (/^\s*$/.test(line)) {
        closeList();
        continue;
      }
      closeList();
      html += "<p>" + inlineMd(line.trim()) + "</p>";
    }
    closeList();
    html += "</article>";
    return html;
  }

  /* Fetch changelog once, render into both preview (latest) and full view. */
  function loadChangelog() {
    fetch(CHANGELOG_RAW)
      .then(function (res) {
        if (!res.ok) throw new Error("changelog " + res.status);
        return res.text();
      })
      .then(function (md) {
        var entries = mdToEntries(md);
        var fullHost = document.getElementById("changelog-body");
        var previewHost = document.getElementById("changelog-preview-body");

        if (entries.length === 0) {
          if (fullHost)
            fullHost.innerHTML = '<p class="muted">No entries yet.</p>';
          if (previewHost)
            previewHost.innerHTML = '<p class="muted">No entries yet.</p>';
          return;
        }

        if (fullHost)
          fullHost.innerHTML = entries.map(renderEntry).join("");
        if (previewHost)
          previewHost.innerHTML = renderEntry(entries[0]);
      })
      .catch(function () {
        var fullHost = document.getElementById("changelog-body");
        var previewHost = document.getElementById("changelog-preview-body");
        var errHtml =
          '<p class="muted">Could not load the changelog. <a href="' +
          CHANGELOG_BLOB +
          '" rel="noopener noreferrer">Read it on GitHub →</a></p>';
        if (fullHost) fullHost.innerHTML = errHtml;
        if (previewHost) previewHost.innerHTML = errHtml;
      });
  }

  /* ── Copy-to-clipboard buttons ── */

  function setupCopyButtons() {
    document.addEventListener("click", function (ev) {
      var btn = ev.target.closest("[data-copy]");
      if (!btn) return;
      var src = document.getElementById(btn.getAttribute("data-copy"));
      if (!src) return;
      var text = src.textContent;
      function done() {
        var orig = btn.textContent;
        btn.textContent = "Copied";
        setTimeout(function () {
          btn.textContent = orig;
        }, 1500);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, done);
      } else {
        var ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand("copy");
        } catch (e) {}
        document.body.removeChild(ta);
        done();
      }
    });
  }

  /* ── Tab / view switching ── */

  var VALID_VIEWS = ["home", "changelog", "downloads"];

  function switchView(view, push) {
    var views = document.querySelectorAll("[data-view]");
    for (var i = 0; i < views.length; i++) {
      var v = views[i];
      if (v.getAttribute("data-view") === view) {
        v.classList.add("view-active");
        v.removeAttribute("hidden");
      } else {
        v.classList.remove("view-active");
        v.setAttribute("hidden", "");
      }
    }
    var navLinks = document.querySelectorAll("[data-tab]");
    for (var j = 0; j < navLinks.length; j++) {
      if (navLinks[j].getAttribute("data-tab") === view) {
        navLinks[j].classList.add("nav-active");
      } else {
        navLinks[j].classList.remove("nav-active");
      }
    }
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    if (push !== false) {
      var url = view === "home" ? "./" : "#" + view;
      history.pushState({ view: view }, "", url);
    }
  }

  function getViewFromHash() {
    var hash = (window.location.hash || "").replace("#", "");
    if (VALID_VIEWS.indexOf(hash) !== -1) return hash;
    return "home";
  }

  function initTabs() {
    document.addEventListener("click", function (ev) {
      var link = ev.target.closest("[data-tab]");
      if (!link) return;
      ev.preventDefault();
      switchView(link.getAttribute("data-tab"));
    });
    window.addEventListener("popstate", function () {
      switchView(getViewFromHash(), false);
    });
    switchView(getViewFromHash(), false);
  }

  /* ── Init ── */

  document.addEventListener("DOMContentLoaded", function () {
    initTabs();
    setupCopyButtons();
    loadRelease();
    loadChangelog();
  });
})();
