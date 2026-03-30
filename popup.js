const el = id => document.getElementById(id);

let allScreenshots = [];
let allDownloads   = [];

async function init() {
  allScreenshots = await msg("getScreenshots");
  allDownloads   = await msg("getDownloads");
  renderStats();
  renderRecent();
  bindEvents();
}

// ---- stats ----

function renderStats() {
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const todayCount = [...allScreenshots, ...allDownloads]
    .filter(i => i.timestamp >= todayStart).length;

  el("countShots").textContent     = allScreenshots.length;
  el("countDownloads").textContent = allDownloads.length;
  el("countToday").textContent     = todayCount;
}

// ---- recent list ----

function renderRecent() {
  const list = el("recentList");
  list.innerHTML = "";

  const combined = [...allScreenshots, ...allDownloads]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 12);

  if (!combined.length) {
    list.innerHTML = `
      <div class="empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>
        <p>Nothing yet.<br>Take a screenshot to get started.</p>
      </div>`;
    return;
  }

  combined.forEach(item => {
    const isShot    = item.type === "screenshot";
    const isDeleted = item.deleted === true;
    const timeStr   = timeAgo(item.timestamp);
    const domain    = getDomain(item.tabUrl || "");
    const copyUrl   = item.tabUrl || item.originalUrl || "";

    const iconClass = isDeleted ? "deleted" : (isShot ? "screenshot" : "download");

    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div class="item-icon ${iconClass}">
        ${isDeleted ? svgTrash() : isShot ? svgCamera() : svgDownload()}
      </div>
      <div class="item-info">
        <div class="item-name ${isDeleted ? "deleted-name" : ""}" title="${esc(item.filename)}">
          ${esc(item.filename)}
        </div>
        <div class="item-meta">${timeStr}${domain ? " · " + esc(domain) : ""}</div>
      </div>
      ${isDeleted
        ? `<span class="deleted-badge">Deleted</span>`
        : `<button class="copy-url" title="Copy URL" data-url="${esc(copyUrl)}">${svgCopy()}</button>`
      }`;

    list.appendChild(row);
  });
}

// ---- events ----

function bindEvents() {
  // screenshot button — sends to background which handles it properly
  el("shotBtn").addEventListener("click", async () => {
    const btn = el("shotBtn");
    btn.disabled = true;
    btn.innerHTML = `${svgCamera()} Capturing…`;

    const result = await msg("takeScreenshot");

    if (result?.success) {
      showToast("Screenshot saved");
      await refresh();
    } else {
      showToast("Could not capture — try the shortcut");
    }

    btn.disabled = false;
    btn.innerHTML = `${svgCamera()} Take Screenshot`;
  });

  // copy URL
  el("recentList").addEventListener("click", e => {
    const btn = e.target.closest(".copy-url");
    if (!btn || !btn.dataset.url) return;
    navigator.clipboard.writeText(btn.dataset.url)
      .then(() => showToast("URL copied"));
  });

  // stat click → open history at right tab
  el("statShots").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("history.html") + "?type=screenshots" });
  });

  el("statDownloads").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("history.html") + "?type=downloads" });
  });

  // clear all
  el("clearBtn").addEventListener("click", async () => {
    if (!confirm("Clear all history? This cannot be undone.")) return;
    await msg("clearHistory", { storageKey: "screenshotHistory" });
    await msg("clearHistory", { storageKey: "downloadHistory" });
    allScreenshots = [];
    allDownloads   = [];
    renderStats();
    renderRecent();
    showToast("History cleared");
  });
}

// ---- helpers ----

async function refresh() {
  allScreenshots = await msg("getScreenshots");
  allDownloads   = await msg("getDownloads");
  renderStats();
  renderRecent();
}

function msg(action, extra = {}) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ action, ...extra }, res => resolve(res || {}));
  });
}

function timeAgo(ts) {
  const d = Date.now() - ts;
  const m = Math.floor(d / 60000);
  const h = Math.floor(d / 3600000);
  const days = Math.floor(d / 86400000);
  if (m < 1)    return "just now";
  if (m < 60)   return `${m}m ago`;
  if (h < 24)   return `${h}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function getDomain(url) {
  try { return new URL(url).hostname.replace("www.", ""); }
  catch { return ""; }
}

function esc(s) {
  return (s || "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function showToast(text) {
  const t = el("toast");
  t.textContent = text;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

// ---- icons ----
function svgCamera() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>`;
}

function svgDownload() {
  return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7,10 12,15 17,10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>`;
}

function svgTrash() {
  return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2">
    <polyline points="3,6 5,6 21,6"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
  </svg>`;
}

function svgCopy() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="9" y="9" width="13" height="13" rx="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>`;
}

init();