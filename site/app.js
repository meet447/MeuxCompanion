/* Meuxe landing: latest-release downloads + rendered changelog.
 * No build step - plain script loaded by index.html. */
(function () {
  "use strict";

  var REPO = "meet447/Meuxe";
  var RELEASES_URL = "https://github.com/" + REPO + "/releases/latest";
  var API_LATEST = "https://api.github.com/repos/" + REPO + "/releases/latest";
  var CHANGELOG_RAW =
    "https://raw.githubusercontent.com/" + REPO + "/main/CHANGELOG.md";
  var CHANGELOG_BLOB = "https://github.com/" + REPO + "/blob/main/CHANGELOG.md";

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

  function pickAsset(assets, test) {
    for (var i = 0; i < assets.length; i++) {
      if (test(assets[i].name)) return assets[i];
    }
    return null;
  }

  function loadRelease() {
    var lead = document.getElementById("download-lead");
    var grid = document.getElementById("dl-grid");
    var fallback = document.getElementById("dl-fallback");
    fetch(API_LATEST, { headers: { Accept: "application/vnd.github+json" } })
      .then(function (res) {
        if (!res.ok) throw new Error("release API " + res.status);
        return res.json();
      })
      .then(function (rel) {
        var assets = Array.isArray(rel.assets) ? rel.assets : [];
        var dmg = pickAsset(assets, function (n) {
          return /\.dmg$/i.test(n);
        });
        var deb = pickAsset(assets, function (n) {
          return /\.deb$/i.test(n);
        });
        var appimage = pickAsset(assets, function (n) {
          return /\.AppImage$/i.test(n) && !/\.zsync/i.test(n);
        });
        var version = rel.tag_name || rel.name || "latest";
        var date = rel.published_at ? fmtDate(rel.published_at) : "";
        var pre = rel.prerelease ? " · prerelease" : "";
        if (lead) lead.textContent = version + (date ? " · " + date : "") + pre;
        setBtn("dl-mac", dmg, dmg ? "Download for Mac" : null);
        setBtn("dl-deb", deb, deb ? "Download .deb" : null);
        setBtn("dl-appimage", appimage, appimage ? "Download .AppImage" : null);
        if (grid) grid.hidden = false;
        if (fallback) fallback.hidden = true;
      })
      .catch(function () {
        if (grid) grid.hidden = true;
        if (fallback) fallback.hidden = false;
        if (lead) lead.textContent = "Grab the newest build from GitHub Releases.";
      });
  }

  /* Minimal markdown subset for CHANGELOG.md:
   * ## version headings, ### groups, - lists, `code`, **bold**, [links]. */
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

  function renderChangelog(md) {
    var host = document.getElementById("changelog-body");
    if (!host) return;
    var lines = md.replace(/\r\n/g, "\n").split("\n");
    // Drop the "# Changelog" title + maintainer intro; start at first ## version.
    var start = 0;
    for (var i = 0; i < lines.length; i++) {
      if (/^##\s/.test(lines[i])) {
        start = i;
        break;
      }
    }
    lines = lines.slice(start);
    var html = "";
    var inList = false;
    var inCode = false;
    function closeList() {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
    }
    for (var j = 0; j < lines.length; j++) {
      var line = lines[j];
      if (/^```/.test(line)) {
        closeList();
        html += inCode ? "</code></pre>" : "<pre><code>";
        inCode = !inCode;
        continue;
      }
      if (inCode) {
        html +=
          line.replace(/&/g, "&amp;").replace(/</g, "&lt;") + "\n";
        continue;
      }
      var h2 = line.match(/^##\s+(.*)$/);
      if (h2) {
        closeList();
        html +=
          '</article><article class="cl-card ring-hairline"><h3>' +
          inlineMd(h2[1].trim()) +
          "</h3>";
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
    // Remove the empty article opened before the first card.
    html = html.replace(/^<\/article>/, "");
    host.innerHTML = html || '<p class="muted">No entries yet.</p>';
  }

  function loadChangelog() {
    var host = document.getElementById("changelog-body");
    fetch(CHANGELOG_RAW)
      .then(function (res) {
        if (!res.ok) throw new Error("changelog " + res.status);
        return res.text();
      })
      .then(renderChangelog)
      .catch(function () {
        if (host) {
          host.innerHTML =
            '<p class="muted">Could not load the changelog here. ' +
            '<a href="' +
            CHANGELOG_BLOB +
            '" rel="noopener noreferrer">Read it on GitHub →</a></p>';
        }
      });
  }

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

  document.addEventListener("DOMContentLoaded", function () {
    setupCopyButtons();
    loadRelease();
    loadChangelog();
  });
})();
