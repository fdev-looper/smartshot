// =================== SERVICE WORKER INITIALIZATION ===================
console.log("🟢 SmartShot Background Service Worker Activated");

// =================== MAIN EXTENSION FUNCTIONALITY ===================
initializeExtension();

function initializeExtension() {
  chrome.commands.onCommand.addListener(handleGlobalShortcut);
  chrome.downloads.onCreated.addListener(handleNewDownload);
  chrome.runtime.onInstalled.addListener(initializeStorage);
  chrome.runtime.onMessage.addListener(handleRuntimeMessages);
}

// =================== CORE FUNCTIONALITY ===================
async function handleGlobalShortcut(command) {
  if (command !== "take-screenshot") return;
  console.log("⌨️ Global Screenshot Shortcut Activated");
  try {
    const [activeTab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (!activeTab) throw new Error("No active tab found");
    const cleanTitle = (activeTab.title || "screenshot")
      .replace(/[^\w-]/g, " ")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, 50);
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .split(".")[0];
    const filename = `SmartShot_${cleanTitle}_${timestamp}.png`;
    const imageData = await new Promise(resolve => {
      chrome.tabs.captureVisibleTab(null, {format: "png"}, dataUrl => {
        resolve(dataUrl);
      });
    });
    if (!imageData) throw new Error("Failed to capture tab");
    await new Promise(resolve => {
      chrome.downloads.download({
        url: imageData,
        filename: filename,
        saveAs: false,
        conflictAction: "uniquify"
      }, resolve);
    });
    console.log("✅ Screenshot saved:", filename);
  } catch (error) {
    console.error("❌ Screenshot failed:", error);
  }
}

async function handleNewDownload(downloadItem) {
  // Track ALL downloads, not just images
  if (!downloadItem || !downloadItem.id) return;
  console.log("📥 New Download Detected:", downloadItem.filename || downloadItem.url);

  try {
    const finalState = await monitorDownloadState(downloadItem.id);
    const finalDetails = await getDownloadDetails(downloadItem.id);
    const tabContext = await getActiveTabContext();

    // Prepare metadata
    const metadata = {
      filename: generateCleanFilename(downloadItem, finalDetails, tabContext.url),
      originalUrl: downloadItem.url,
      tabTitle: tabContext.title || "Unknown",
      tabUrl: tabContext.url || "Unknown",
      filePath: finalDetails?.filename || downloadItem.filename,
      timestamp: Date.now(),
      status: finalState,
      fileSize: finalDetails?.fileSize || downloadItem.fileSize || 0,
      mime: downloadItem.mime || finalDetails?.mime || "",
      downloadUrl: downloadItem.url,
      id: downloadItem.id
    };

    await storeDownloadMetadata(metadata);
    console.log("💾 Download metadata saved");
  } catch (error) {
    console.error("⚠️ Download tracking failed:", error);
  }
}

// =================== HELPER FUNCTIONS ===================
async function monitorDownloadState(downloadId) {
  return new Promise(resolve => {
    const listener = delta => {
      if (delta.id === downloadId && delta.state?.current) {
        if (['complete', 'interrupted'].includes(delta.state.current)) {
          chrome.downloads.onChanged.removeListener(listener);
          resolve(delta.state.current);
        }
      }
    };
    chrome.downloads.onChanged.addListener(listener);
    setTimeout(() => {
      chrome.downloads.onChanged.removeListener(listener);
      resolve('timeout');
    }, 15000);
  });
}

async function getDownloadDetails(downloadId) {
  try {
    const [details] = await chrome.downloads.search({id: downloadId});
    return details || null;
  } catch (error) {
    console.warn("Failed to get download details:", error);
    return null;
  }
}

async function getActiveTabContext() {
  try {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    return {
      title: tab?.title || "Unknown",
      url: tab?.url || "Unknown"
    };
  } catch (error) {
    console.warn("Failed to get tab context:", error);
    return {title: "Unknown", url: "Unknown"};
  }
}

function generateCleanFilename(download, finalDetails, tabUrl) {
  if (finalDetails?.filename) {
    return finalDetails.filename.split(/[\\/]/).pop();
  }
  if (download.filename) {
    return download.filename.split(/[\\/]/).pop();
  }
  try {
    const url = new URL(download.url);
    const urlFilename = url.pathname.split('/').pop() ||
      url.searchParams.get('filename') ||
      `download_${Date.now()}.${(download.mime || '').split('/')[1] || 'bin'}`;
    if (tabUrl) {
      try {
        const domain = new URL(tabUrl).hostname.replace('www.', '').split('.')[0];
        return `${domain}_${urlFilename}`;
      } catch {}
    }
    return urlFilename;
  } catch {
    return `file_${Date.now()}.${(download.mime || '').split('/')[1] || 'bin'}`;
  }
}

async function storeDownloadMetadata(metadata) {
  try {
    const {downloadHistory = []} = await chrome.storage.local.get({downloadHistory: []});
    await chrome.storage.local.set({
      downloadHistory: [metadata, ...downloadHistory.slice(0, 999)]
    });
  } catch (error) {
    throw new Error(`Storage error: ${error.message}`);
  }
}

function initializeStorage() {
  chrome.storage.local.set({
    downloadHistory: [],
    settings: {
      captureQuality: "high",
      defaultFormat: "png",
      maxHistoryItems: 1000
    }
  });
}

function handleRuntimeMessages(request, sender, sendResponse) {
  switch (request.action) {
    case "getHistory":
      chrome.storage.local.get({downloadHistory: []}, data => {
        sendResponse(data.downloadHistory);
      });
      return true;
    case "clearHistory":
      chrome.storage.local.set({downloadHistory: []}, () => {
        sendResponse({success: true});
      });
      return true;
    default:
      sendResponse({error: "Unknown action"});
  }
}

// =================== LIFECYCLE MANAGEMENT ===================
chrome.runtime.onStartup.addListener(() => {
  console.log("🔄 SmartShot Background Service Worker Restarted");
});