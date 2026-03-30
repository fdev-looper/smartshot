<div align="center">

<br/>

```
  ███████╗███╗   ███╗ █████╗ ██████╗ ████████╗███████╗██╗  ██╗ ██████╗ ████████╗
  ██╔════╝████╗ ████║██╔══██╗██╔══██╗╚══██╔══╝██╔════╝██║  ██║██╔═══██╗╚══██╔══╝
  ███████╗██╔████╔██║███████║██████╔╝   ██║   ███████╗███████║██║   ██║   ██║   
  ╚════██║██║╚██╔╝██║██╔══██║██╔══██╗   ██║   ╚════██║██╔══██║██║   ██║   ██║   
  ███████║██║ ╚═╝ ██║██║  ██║██║  ██║   ██║   ███████║██║  ██║╚██████╔╝   ██║   
  ╚══════╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝ ╚═════╝    ╚═╝   
```

### **Every screenshot. Every download. Remembered forever.**

<br/>

![Chrome Extension](https://img.shields.io/badge/Chrome%20Extension-MV3-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)
![Version](https://img.shields.io/badge/Version-1.0.0-0d9488?style=for-the-badge)
![Storage](https://img.shields.io/badge/Storage-100%25%20Local-22c55e?style=for-the-badge&logo=databricks&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-f59e0b?style=for-the-badge)
![GitHub stars](https://img.shields.io/github/stars/fdev-looper/smartshot?style=for-the-badge&color=f59e0b)

<br/>

> **SmartShot** is a zero-bloat Chrome extension that silently logs every screenshot you take and every file you download — complete with source URL, page title, domain, timestamp, and file size. Search it. Pin it. Export it. Never lose context again.

<br/>

---

</div>

<br/>

## 🧭 Table of Contents

- [Why SmartShot?](#-why-smartshot)
- [Features at a Glance](#-features-at-a-glance)
- [Installation](#-installation-manual--github-only)
- [How to Use](#-how-to-use)
- [Keyboard Shortcut](#-keyboard-shortcut)
- [File Structure](#-file-structure)
- [Privacy](#-privacy--your-data-never-leaves-your-browser)
- [Contributing](#-contributing)

<br/>

---

## 💡 Why SmartShot?

You take a screenshot of something important. Three days later? Gone. You downloaded a file from a site you can barely remember. The filename is a random hash. The URL? No idea.

**SmartShot fixes that.**

It quietly watches in the background and the moment you capture or download something, it saves:

- 📁 **The filename** — cleaned and readable
- 🌐 **The source URL** — so you always know where it came from
- 🏷️ **The page title & domain** — full context, always
- 🕐 **The timestamp** — down to the second
- 📏 **The file size & MIME type** — for downloads
- 🔴 **Deleted-from-disk detection** — knows when a file is gone

No cloud. No account. No tracking. Everything is stored locally in your browser using `chrome.storage.local`.

<br/>

---

## ✨ Features at a Glance

| Feature | Details |
|---|---|
| 📸 **Screenshot Capture** | One-click or keyboard shortcut capture of any active tab |
| ⬇️ **Auto Download Logging** | Every browser download is automatically tracked |
| 🔍 **Smart Search** | Filter by filename, URL, or site across your entire history |
| 📌 **Pin Items** | Pin important items so they float to the top, always |
| 📝 **Notes** | Attach a private note to any screenshot or download |
| 📤 **Export to CSV** | Download your full history as a spreadsheet |
| 🗑️ **Disk-Deletion Detection** | Items deleted from disk are visually flagged — never confused |
| 🧹 **Deduplication** | Same URL downloaded twice in 5s? Logged once. Smart. |
| 📊 **Stats Dashboard** | See totals, today's activity, pinned items at a glance |
| 🔒 **100% Local Storage** | Zero servers, zero accounts, zero data ever leaving your machine |

<br/>

---

## 🚀 Installation (Manual — GitHub Only)

> SmartShot is **not** on the Chrome Web Store. You install it directly from this repository in under 60 seconds.

<br/>

### Step 1 — Download the Extension

**Option A: Clone with Git**
```bash
git clone https://github.com/fdev-looper/smartshot.git
```

**Option B: Download ZIP**
1. Click the green **`<> Code`** button at the top of this page
2. Select **Download ZIP**
3. Extract the ZIP to a folder you'll remember (e.g. `Desktop/smartshot`)

<br/>

### Step 2 — Open Chrome Extensions

Open a new Chrome tab and navigate to:
```
chrome://extensions
```

Or go to: **Chrome menu (⋮) → Extensions → Manage Extensions**

<br/>

### Step 3 — Enable Developer Mode

In the top-right corner of the Extensions page, toggle **Developer mode** to **ON**.

```
┌─────────────────────────────────────────┐
│  Extensions             Developer mode ●│  ← flip this ON
└─────────────────────────────────────────┘
```

<br/>

### Step 4 — Load the Extension

Click the **"Load unpacked"** button that appears on the left side.

```
┌──────────────────────────────────────────┐
│ [ Load unpacked ]  [ Pack extension ]    │
└──────────────────────────────────────────┘
```

Navigate to and select the **`smartshot`** folder (the one containing `manifest.json`). Click **Select Folder**.

<br/>

### Step 5 — Pin It to Your Toolbar *(Recommended)*

1. Click the 🧩 **puzzle piece** icon in Chrome's top-right
2. Find **SmartShot** in the list
3. Click the 📌 **pin icon** next to it

SmartShot is now visible in your toolbar and ready to go.

<br/>

> ✅ **Done!** SmartShot is now active. It will start logging downloads immediately, and you can take screenshots via the popup or the keyboard shortcut.

<br/>

---

## 📖 How to Use

### Taking a Screenshot

| Method | How |
|---|---|
| **Popup button** | Click the SmartShot icon in your toolbar → click **"Take Screenshot"** |
| **Keyboard shortcut** | Press `Ctrl+Shift+S` (Windows/Linux) or `Cmd+Shift+S` (Mac) |

The screenshot is saved to your Downloads folder and automatically logged in SmartShot with the page title, URL, domain, and timestamp.

<br/>

### Viewing Your History

Click the SmartShot toolbar icon to see:

- **Recent items** — your last 12 screenshots and downloads combined
- **Stats bar** — total screenshots, downloads, and today's count
- **"View all"** button — opens the full-page History viewer

<br/>

### Using the History Page

The History page (`history.html`) is your command center:

```
┌────────────────────────────────────────────────────────┐
│  [ Screenshots | 42 ]    [ Downloads | 18 ]            │
├────────────────────────────────────────────────────────┤
│  Total: 42   Today: 3   This week: 11   Pinned: 2      │
├────────────────────────────────────────────────────────┤
│  🔍 Search...              [ All fields ▾ ]  [ Reset ] │
├────────────────────────────────────────────────────────┤
│  📸 SmartShot_github_repo...    github.com   3m ago    │
│  📸 SmartShot_figma_design...   figma.com    1h ago    │
│  ⬇️  report_q3_final.pdf        notion.so    2h ago    │
└────────────────────────────────────────────────────────┘
```

**Actions on each item:**

| Button | What it does |
|---|---|
| 📋 Copy URL | Copies the source URL to your clipboard |
| 📌 Pin | Pins the item to the top of your list |
| 🗑️ Remove | Removes the item from history (not from disk) |
| ✎ Add note | Opens a text field to attach a personal note |

<br/>

### Searching & Filtering

Use the search bar to find anything by:
- **Filename** — partial match works
- **URL** — the source page address
- **Site** — just the domain name

Use the dropdown to narrow search to a specific field.

<br/>

### Exporting to CSV

Click **"Export CSV"** in the top-right of the History page to download a `.csv` file containing your full history — filename, URL, title, timestamp, size, MIME type, status, and notes. Perfect for keeping records or importing into a spreadsheet.

<br/>

---

## ⌨️ Keyboard Shortcut

| Platform | Shortcut |
|---|---|
| Windows / Linux | `Ctrl` + `Shift` + `S` |
| macOS | `Cmd` + `Shift` + `S` |

**To change the shortcut:**
1. Go to `chrome://extensions/shortcuts`
2. Find **SmartShot** → **"Take a screenshot of the current tab"**
3. Click the pencil icon and set your preferred keys

<br/>

---

## 📂 File Structure

```
smartshot/
│
├── manifest.json          # Extension config: permissions, shortcuts, icons
├── background.js          # Service worker: screenshot logic, download tracking,
│                          #   deduplication, disk-deletion detection, storage
│
├── popup.html             # Toolbar popup UI
├── popup.js               # Popup logic: stats, recent list, screenshot button
│
├── history.html           # Full-page history viewer
├── history.js             # History logic: search, filter, pin, notes, export
│
└── Smartshot logo.png     # Extension icon
```

<br/>

### How the pieces talk to each other

```
  User clicks popup  ──────────────►  popup.js
                                          │
                          chrome.runtime.sendMessage()
                                          │
                                          ▼
                                   background.js   ◄──── chrome.downloads events
                                          │                chrome.commands events
                              chrome.storage.local
                                          │
                          chrome.runtime.sendMessage()
                                          │
                                          ▼
                                    history.js   (reads storage, renders UI)
```

<br/>

---

## 🔒 Privacy — Your Data Never Leaves Your Browser

SmartShot stores everything using **`chrome.storage.local`** — the browser's own on-device key-value store.

- ❌ No external servers
- ❌ No analytics or telemetry  
- ❌ No accounts or sign-ins
- ❌ No internet requests of any kind
- ✅ All data lives only on your machine
- ✅ Clearing browser data clears SmartShot data too

The extension requests these permissions:

| Permission | Why it's needed |
|---|---|
| `downloads` | To detect and log file downloads |
| `tabs` + `activeTab` | To capture tab title/URL for context |
| `storage` | To save history locally |
| `commands` | To register the keyboard shortcut |
| `<all_urls>` | To read the URL of any page when capturing |

<br/>

---

## 🛠️ Contributing

Contributions are welcome! Here's how to get started:

1. **Fork** this repository
2. **Clone** your fork: `git clone https://github.com/fdev-looper/smartshot.git`
3. **Make changes** — the codebase is plain HTML/CSS/JS, no build step needed
4. **Load unpacked** in Chrome to test (see Installation above)
5. **Open a Pull Request** with a clear description of what you changed and why

**Ideas for contributions:**
- [ ] Dark mode support
- [ ] Screenshot thumbnail previews
- [ ] Folder/tag organization
- [ ] Right-click context menu for screenshots
- [ ] Configurable keyboard shortcut UI within the popup
- [ ] Import/restore history from CSV

<br/>

---

## 📜 License

MIT © 2025 — Free to use, fork, and modify.

<br/>

---

<div align="center">

**Built with care. Stored locally. Works silently.**

*If SmartShot saved you even once, give it a ⭐ — it means a lot.*

</div>
