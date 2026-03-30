const el = id => document.getElementById(id);

let screenshots = [];
let downloads   = [];
let notes       = {};
let activeType  = "screenshots";
let searchQuery = "";
let filterField = "all";

// ---- boot ----

async function init() {
  await loadAll();
  readUrlParam();
  renderCounts();
  renderStats();
  renderList();
  bindEvents();
}

async function loadAll() {
  [screenshots, downloads, notes] = await Promise.all([
    msg("getScreenshots"),
    msg("getDownloads"),
    loadNotes()
  ]);
}

function readUrlParam() {
  const p = new URLSearchParams(window.location.search).get("type");
  activeType = p === "downloads" ? "downloads" : "screenshots";
  syncTabs();
}

// ---- counts ----

function renderCounts() {
  el("shotCount").textContent = screenshots.length;
  el("dlCount").textContent   = downloads.length;
}

// ---- stats strip ----

function renderStats() {
  const list  = activeList();
  const now   = Date.now();
  const today = list.filter(i => now - i.timestamp < 86400000).length;
  const week  = list.filter(i => now - i.timestamp < 604800000).length;
  const pins  = list.filter(i => i.pinned).length;
  const dels  = list.filter(i => i.deleted).length;

  el("statsStrip").innerHTML = `
    <div class="stat-pill"><strong>${list.length}</strong>Total</div>
    <div class="stat-pill"><strong>${today}</strong>Today</div>
    <div class="stat-pill"><strong>${week}</strong>This week</div>
    <div class="stat-pill"><strong>${pins}</strong>Pinned</div>
    ${dels ? `<div class="stat-pill"><strong style="color:var(--red)">${dels}</strong>Deleted from disk</div>` : ""}
  `;
}

// ---- list ----

function renderList() {
  const isShot = activeType === "screenshots";
  const q      = searchQuery.toLowerCase().trim();

  let filtered = activeList();

  if (q) {
    filtered = filtered.filter(item => {
      const fname = (item.filename    || "").toLowerCase();
      const url   = (item.originalUrl || item.tabUrl || "").toLowerCase();
      const site  = (item.tabUrl      || "").toLowerCase();
      const title = (item.tabTitle    || "").toLowerCase();

      if (filterField === "filename") return fname.includes(q);
      if (filterField === "url")      return url.includes(q);
      if (filterField === "site")     return site.includes(q);
      return fname.includes(q) || url.includes(q) || title.includes(q);
    });
  }

  // pinned float to top, then newest first
  filtered.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.timestamp - a.timestamp;
  });

  const container = el("itemList");
  container.innerHTML = "";

  el("resultsInfo").textContent = q
    ? `${filtered.length} result${filtered.length !== 1 ? "s" : ""} for "${searchQuery}"`
    : "";

  if (!filtered.length) {
    container.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>
        <p>${q ? "No results." : `No ${activeType} yet.`}</p>
      </div>`;
    return;
  }

  filtered.forEach(item => container.appendChild(buildCard(item, isShot)));
}

function buildCard(item, isShot) {
  const card      = document.createElement("div");
  const isDeleted = item.deleted === true;
  const isPinned  = item.pinned  === true;

  card.className = "item-card"
    + (isPinned  ? " pinned"     : "")
    + (isDeleted ? " is-deleted" : "");
  card.dataset.id = item.id;

  const domain     = getDomain(item.tabUrl || "");
  const sourceUrl  = item.tabUrl || item.originalUrl || "";
  const timeStr    = timeAgo(item.timestamp);
  const sizeStr    = item.fileSize ? fmtSize(item.fileSize) : "";
  const mimeStr    = item.mime ? item.mime.split("/")[1]?.toUpperCase() : "";
  const noteText   = notes[item.id] || "";
  const iconClass  = isDeleted ? "deleted" : (isShot ? "screenshot" : "download");

  card.innerHTML = `
    <div class="type-icon ${iconClass}">
      ${isDeleted ? icoTrash("#dc2626") : isShot ? icoCamera("#0d9488") : icoDl("#d97706")}
    </div>
    <div class="item-body">
      <div class="item-filename ${isDeleted ? "crossed" : ""}" title="${esc(item.filename)}">
        ${isPinned ? "📌 " : ""}${esc(item.filename)}
      </div>
      <div class="item-source">
        ${domain
          ? `<a href="${esc(sourceUrl)}" target="_blank">${esc(domain)}</a>`
          : esc(item.tabTitle || "")
        }
      </div>
      <div class="item-tags">
        <span class="tag ${isShot ? "t-shot" : "t-dl"}">${isShot ? "screenshot" : "download"}</span>
        <span class="tag t-time">${timeStr}</span>
        ${sizeStr ? `<span class="tag t-size">${sizeStr}</span>` : ""}
        ${mimeStr ? `<span class="tag t-mime">${mimeStr}</span>` : ""}
        ${isDeleted ? `<span class="tag t-deleted">Deleted from disk</span>` : ""}
      </div>
      <div class="note-area">
        <div class="note-preview ${noteText ? "has-note" : ""}" data-nid="${item.id}">
          ${noteText ? `✎ ${esc(noteText.slice(0,55))}${noteText.length > 55 ? "…" : ""}` : "+ add note"}
        </div>
        <div class="note-editor" id="ne-${item.id}">
          <textarea class="note-textarea" id="nt-${item.id}" placeholder="Write a note…">${esc(noteText)}</textarea>
          <div class="note-btns">
            <button class="note-cancel" data-nid="${item.id}">Cancel</button>
            <button class="note-save"   data-nid="${item.id}">Save</button>
          </div>
        </div>
      </div>
    </div>
    <div class="item-actions">
      <button class="act-btn copy" title="Copy source URL" data-url="${esc(sourceUrl)}">${icoCopy()}</button>
      <button class="act-btn pin"  title="${isPinned ? "Unpin" : "Pin"}" data-id="${item.id}">${icoPin(isPinned)}</button>
      <button class="act-btn del"  title="Remove from history" data-id="${item.id}">${icoTrash()}</button>
    </div>
  `;

  return card;
}

// ---- events ----

function bindEvents() {
  // tabs
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      activeType = btn.dataset.type;
      syncTabs();
      renderStats();
      renderList();
    });
  });

  // search
  el("searchInput").addEventListener("input", e => {
    searchQuery = e.target.value;
    renderList();
  });

  el("filterSelect").addEventListener("change", e => {
    filterField = e.target.value;
    renderList();
  });

  el("resetBtn").addEventListener("click", () => {
    searchQuery = "";
    filterField = "all";
    el("searchInput").value = "";
    el("filterSelect").value = "all";
    renderList();
  });

  el("backBtn").addEventListener("click", () => window.close());
  el("exportBtn").addEventListener("click", exportCSV);

  el("clearAllBtn").addEventListener("click", async () => {
    const label = activeType === "screenshots" ? "screenshots" : "downloads";
    if (!confirm(`Clear all ${label}? Cannot be undone.`)) return;
    const key = activeType === "screenshots" ? "screenshotHistory" : "downloadHistory";
    await msg("clearHistory", { storageKey: key });
    if (activeType === "screenshots") screenshots = [];
    else downloads = [];
    renderCounts();
    renderStats();
    renderList();
    showToast(`${label} cleared`);
  });

  // delegated list clicks
  el("itemList").addEventListener("click", e => {
    const copyBtn    = e.target.closest(".act-btn.copy");
    const pinBtn     = e.target.closest(".act-btn.pin");
    const delBtn     = e.target.closest(".act-btn.del");
    const notePreview = e.target.closest(".note-preview");
    const noteSave   = e.target.closest(".note-save");
    const noteCancel = e.target.closest(".note-cancel");

    if (copyBtn)     return handleCopy(copyBtn.dataset.url);
    if (pinBtn)      return handlePin(pinBtn.dataset.id);
    if (delBtn)      return handleDelete(delBtn.dataset.id);
    if (notePreview) return openNote(notePreview.dataset.nid);
    if (noteSave)    return saveNote(noteSave.dataset.nid);
    if (noteCancel)  return closeNote(noteCancel.dataset.nid);
  });
}

// ---- actions ----

function handleCopy(url) {
  if (!url) return;
  navigator.clipboard.writeText(url).then(() => showToast("URL copied"));
}

async function handlePin(idStr) {
  const id  = Number(idStr);
  const key = storageKey();
  await msg("pinItem", { storageKey: key, id });
  await loadAll();
  renderStats();
  renderList();
}

async function handleDelete(idStr) {
  const id  = Number(idStr);
  const key = storageKey();
  await msg("deleteItem", { storageKey: key, id });
  await loadAll();
  renderCounts();
  renderStats();
  renderList();
  showToast("Removed from history");
}

// ---- notes ----

function openNote(id) {
  const editor = el(`ne-${id}`);
  if (editor) editor.classList.add("open");
}

function closeNote(id) {
  const editor = el(`ne-${id}`);
  if (editor) editor.classList.remove("open");
}

async function saveNote(id) {
  const ta = el(`nt-${id}`);
  if (!ta) return;
  notes[id] = ta.value.trim();
  await persistNotes();
  closeNote(id);
  renderList();
  showToast(notes[id] ? "Note saved" : "Note removed");
}

async function loadNotes() {
  return new Promise(resolve => {
    chrome.storage.local.get({ smartshotNotes: {} }, d => resolve(d.smartshotNotes));
  });
}

async function persistNotes() {
  return new Promise(resolve => {
    chrome.storage.local.set({ smartshotNotes: notes }, resolve);
  });
}

// ---- export ----

function exportCSV() {
  const list  = activeList();
  const label = activeType;

  const rows = [
    ["filename","source_url","tab_title","tab_url","timestamp","file_size","mime","status","deleted","note"].join(","),
    ...list.map(item => [
      cell(item.filename),
      cell(item.originalUrl || item.tabUrl),
      cell(item.tabTitle),
      cell(item.tabUrl),
      cell(new Date(item.timestamp).toISOString()),
      cell(item.fileSize || ""),
      cell(item.mime || ""),
      cell(item.status || ""),
      cell(item.deleted ? "yes" : "no"),
      cell(notes[item.id] || "")
    ].join(","))
  ].join("\n");

  const blob = new Blob([rows], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `smartshot_${label}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Exported ${list.length} items`);
}

function cell(v) {
  return `"${String(v || "").replace(/"/g,'""')}"`;
}

// ---- helpers ----

function activeList() {
  return activeType === "screenshots" ? screenshots : downloads;
}

function storageKey() {
  return activeType === "screenshots" ? "screenshotHistory" : "downloadHistory";
}

function syncTabs() {
  document.querySelectorAll(".tab").forEach(b => {
    b.classList.toggle("active", b.dataset.type === activeType);
  });
}

function msg(action, extra = {}) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ action, ...extra }, res => resolve(res || []));
  });
}

function getDomain(url) {
  try { return new URL(url).hostname.replace("www.", ""); }
  catch { return ""; }
}

function timeAgo(ts) {
  const d = Date.now() - ts;
  const m = Math.floor(d/60000);
  const h = Math.floor(d/3600000);
  const days = Math.floor(d/86400000);
  if (m < 1)    return "just now";
  if (m < 60)   return `${m}m ago`;
  if (h < 24)   return `${h}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function fmtSize(b) {
  if (!b) return "";
  if (b < 1024)    return `${b} B`;
  if (b < 1048576) return `${(b/1024).toFixed(1)} KB`;
  return `${(b/1048576).toFixed(1)} MB`;
}

function esc(s) {
  return (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function showToast(t) {
  const toast = el("toast");
  toast.textContent = t;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2200);
}

// icons
function icoCamera(c = "currentColor") {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>`;
}

function icoDl(c = "currentColor") {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7,10 12,15 17,10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>`;
}

function icoTrash(c = "currentColor") {
  return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2">
    <polyline points="3,6 5,6 21,6"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6M14 11v6"/>
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>`;
}

function icoCopy() {
  return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="9" y="9" width="13" height="13" rx="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>`;
}

function icoPin(active) {
  const c = active ? "#d97706" : "currentColor";
  const f = active ? "#d97706" : "none";
  return `<svg width="12" height="12" viewBox="0 0 24 24" fill="${f}" stroke="${c}" stroke-width="2">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
    <circle cx="12" cy="10" r="3"/>
  </svg>`;
}

init();