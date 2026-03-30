console.log("SmartShot service worker started");

// keeps IDs of downloads SmartShot itself triggered (screenshots)
// so the download listener doesn't double-log them
const ownDownloadIds = new Set();

initializeExtension();

function initializeExtension() {
  chrome.commands.onCommand.addListener(handleScreenshotShortcut);
  chrome.downloads.onCreated.addListener(handleNewDownload);
  chrome.downloads.onChanged.addListener(handleDownloadChanged);
  chrome.runtime.onInstalled.addListener(handleInstall);
  chrome.runtime.onMessage.addListener(handleMessages);
}

// ---- screenshot ----

async function handleScreenshotShortcut(command) {
  if (command !== "take-screenshot") return;
  await takeScreenshot();
}

async function takeScreenshot() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error("no active tab");

    const imageData = await new Promise((resolve, reject) => {
      chrome.tabs.captureVisibleTab(null, { format: "png" }, dataUrl => {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError.message);
        resolve(dataUrl);
      });
    });

    if (!imageData) throw new Error("capture returned nothing");

    const filename = buildScreenshotFilename(tab);

    const downloadId = await new Promise((resolve, reject) => {
      chrome.downloads.download(
        { url: imageData, filename, saveAs: false, conflictAction: "uniquify" },
        id => {
          if (chrome.runtime.lastError) return reject(chrome.runtime.lastError.message);
          resolve(id);
        }
      );
    });

    // mark this ID so the download listener skips it
    ownDownloadIds.add(downloadId);
    setTimeout(() => ownDownloadIds.delete(downloadId), 10000);

    const entry = {
      id: Date.now(),
      downloadId,
      type: "screenshot",
      filename,
      tabTitle: tab.title || "",
      tabUrl: tab.url || "",
      timestamp: Date.now(),
      deleted: false
    };

    await appendToStorage("screenshotHistory", entry);
    console.log("screenshot saved:", filename);
    return { success: true };

  } catch (err) {
    console.error("screenshot failed:", err);
    return { success: false, error: String(err) };
  }
}

function buildScreenshotFilename(tab) {
  const domain = extractDomain(tab.url);
  const title  = sanitizeText(tab.title || "screenshot").slice(0, 40);
  const ts     = dateStamp();
  return `SmartShot_${domain}_${title}_${ts}.png`;
}

// ---- download tracking ----

const recentUrls = new Map();
const DEDUP_MS   = 5000;

async function handleNewDownload(item) {
  if (!item || !item.id) return;

  // skip anything SmartShot triggered itself
  if (ownDownloadIds.has(item.id)) {
    console.log("own screenshot download — skipping:", item.id);
    return;
  }

  // dedup same URL within 5s window
  const now = Date.now();
  if (recentUrls.has(item.url) && now - recentUrls.get(item.url) < DEDUP_MS) {
    console.log("duplicate skipped:", item.url);
    return;
  }
  recentUrls.set(item.url, now);
  for (const [url, t] of recentUrls.entries()) {
    if (now - t > DEDUP_MS * 20) recentUrls.delete(url);
  }

  try {
    const finalState = await waitForDownload(item.id);
    const details    = await getDownloadDetails(item.id);
    const tab        = await getActiveTab();

    const entry = {
      id: item.id,
      type: "download",
      filename: buildDownloadFilename(item, details, tab),
      originalUrl: item.url,
      tabTitle: tab.title || "",
      tabUrl: tab.url || "",
      filePath: details?.filename || "",
      fileSize: details?.fileSize || item.fileSize || 0,
      mime: item.mime || details?.mime || "",
      status: finalState,
      timestamp: Date.now(),
      deleted: false
    };

    await appendToStorage("downloadHistory", entry);
    console.log("download tracked:", entry.filename);

  } catch (err) {
    console.warn("download tracking error:", err.message);
  }
}

// fires when Chrome notices a file no longer exists on disk
async function handleDownloadChanged(delta) {
  if (!delta || !delta.id) return;
  if (ownDownloadIds.has(delta.id)) return;

  const wasDeleted =
    delta.exists &&
    delta.exists.previous === true &&
    delta.exists.current  === false;

  if (!wasDeleted) return;

  try {
    await markDeleted("downloadHistory",   delta.id);
    await markDeleted("screenshotHistory", delta.id);
    console.log("file deleted from disk, history updated:", delta.id);
  } catch (err) {
    console.warn("markDeleted error:", err.message);
  }
}

async function markDeleted(storageKey, downloadId) {
  const data    = await chrome.storage.local.get({ [storageKey]: [] });
  const list    = data[storageKey];
  let changed   = false;

  const updated = list.map(item => {
    if (item.id === downloadId || item.downloadId === downloadId) {
      changed = true;
      return { ...item, deleted: true };
    }
    return item;
  });

  if (changed) await chrome.storage.local.set({ [storageKey]: updated });
}

function waitForDownload(downloadId) {
  return new Promise(resolve => {
    const listener = delta => {
      if (delta.id !== downloadId) return;
      const state = delta.state?.current;
      if (state === "complete" || state === "interrupted") {
        chrome.downloads.onChanged.removeListener(listener);
        resolve(state);
      }
    };
    chrome.downloads.onChanged.addListener(listener);
    setTimeout(() => {
      chrome.downloads.onChanged.removeListener(listener);
      resolve("timeout");
    }, 20000);
  });
}

async function getDownloadDetails(id) {
  try {
    const [d] = await chrome.downloads.search({ id });
    return d || null;
  } catch { return null; }
}

async function getActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab || {};
  } catch { return {}; }
}

// ---- filename helpers ----

function buildDownloadFilename(item, details, tab) {
  if (details?.filename) {
    return cleanFilename(details.filename.split(/[\\/]/).pop());
  }
  try {
    const url  = new URL(item.url);
    let name   = url.pathname.split("/").filter(Boolean).pop()
      || url.searchParams.get("filename")
      || `file_${dateStamp()}`;
    name = cleanFilename(name);
    const domain = extractDomain(tab.url || "");
    if (domain && domain !== "unknown") name = `${domain}_${name}`;
    return name;
  } catch {
    const ext = (item.mime || "").split("/")[1] || "bin";
    return `download_${dateStamp()}.${ext}`;
  }
}

function cleanFilename(name) {
  return name
    .replace(/[a-f0-9]{16,}/gi, "")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "")
    .replace(/[_-]{2,}/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "")
    || "file";
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace("www.", "").split(".")[0];
  } catch { return "unknown"; }
}

function sanitizeText(str) {
  return str.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_");
}

function dateStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").split(".")[0];
}

// ---- storage ----

async function appendToStorage(key, entry) {
  const data = await chrome.storage.local.get({ [key]: [] });
  const list = data[key];
  list.unshift(entry);
  if (list.length > 1000) list.splice(1000);
  await chrome.storage.local.set({ [key]: list });
}

// ---- messages from popup / history ----

function handleMessages(request, sender, sendResponse) {
  switch (request.action) {

    case "takeScreenshot":
      takeScreenshot().then(result => sendResponse(result));
      return true;

    case "getScreenshots":
      chrome.storage.local.get({ screenshotHistory: [] }, data => {
        sendResponse(data.screenshotHistory);
      });
      return true;

    case "getDownloads":
      chrome.storage.local.get({ downloadHistory: [] }, data => {
        sendResponse(data.downloadHistory);
      });
      return true;

    case "deleteItem": {
      const { storageKey, id } = request;
      chrome.storage.local.get({ [storageKey]: [] }, data => {
        const filtered = data[storageKey].filter(item => item.id !== id);
        chrome.storage.local.set({ [storageKey]: filtered }, () => sendResponse({ success: true }));
      });
      return true;
    }

    case "clearHistory": {
      const { storageKey } = request;
      chrome.storage.local.set({ [storageKey]: [] }, () => sendResponse({ success: true }));
      return true;
    }

    case "pinItem": {
      const { storageKey, id } = request;
      chrome.storage.local.get({ [storageKey]: [] }, data => {
        const list = data[storageKey].map(item =>
          item.id === id ? { ...item, pinned: !item.pinned } : item
        );
        chrome.storage.local.set({ [storageKey]: list }, () => sendResponse({ success: true }));
      });
      return true;
    }

    default:
      sendResponse({ error: "unknown action" });
  }
}

// ---- install ----

function handleInstall() {
  chrome.storage.local.set({
    screenshotHistory: [],
    downloadHistory: [],
    settings: { quality: "high", format: "png", maxItems: 1000 }
  });
  console.log("SmartShot installed, storage ready");
}

chrome.runtime.onStartup.addListener(() => {
  console.log("SmartShot service worker restarted");
});