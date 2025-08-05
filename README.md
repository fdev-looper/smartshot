# 📸 SmartShot – Your Screenshot & Download History Manager

SmartShot is a lightweight Chrome extension that automatically logs your downloads and screenshots in one intuitive interface—so you never lose track of anything again.

---

## 🌟 Why SmartShot?

Chrome's built-in tools or normal screenshot apps don’t give you a unified, searchable record of what you've taken or downloaded. SmartShot solves that:

- **Instant Logging**: Tracks both screenshots and downloads for easy access.
- **One-click Interface**: No need to juggle downloads and folders manually.
- **Searchable History**: Find past actions by time, type, and filename.
- **Efficiency for Users**: Perfect for developers, students, and anyone who takes frequent screenshots or downloads files.

Tech reviewers say screenshot extensions excel when they’re fast, simple to access in-browser, and lightweight without bloating your workflow :contentReference[oaicite:1]{index=1}. That’s exactly where SmartShot fits.

---

## 📁 File Breakdown

| File | Purpose |
|------|---------|
| **manifest.json** | Tells Chrome about the extension’s name, permissions (download/screenshot), background & popup scripts, and overall capabilities. |
| **background.js** | Listens for browser events like download completions and screenshot actions, then logs them locally behind the scenes. |
| **popup.html** & optional **popup.js** | UI visible when user clicks the extension icon; shows organized tabs such as *Downloads* and *Screenshots* with search/filter features. |
| **history.html** | Self‑contained page that renders a visual, filterable log of your activity—exportable and easy to navigate. |
