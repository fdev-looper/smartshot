document.addEventListener("DOMContentLoaded", async () => {
    let currentType = 'screenshots';
    let allData = {
        screenshots: [],
        downloads: []
    };

    const list = document.getElementById("list");
    const searchBar = document.getElementById("searchBar");
    const filterBy = document.getElementById("filterBy");
    const searchBtn = document.getElementById("searchBtn");
    const clearBtn = document.getElementById("clearBtn");
    const totalCount = document.getElementById("totalCount");
    const todayCount = document.getElementById("todayCount");
    const weekCount = document.getElementById("weekCount");

    initializeEventListeners();
    await loadData();

    function initializeEventListeners() {
        document.querySelectorAll('.toggle-option').forEach(option => {
            option.addEventListener('click', function() {
                const type = this.dataset.type;
                if (type !== currentType) switchType(type);
            });
        });

        searchBtn.addEventListener('click', performSearch);
        clearBtn.addEventListener('click', clearSearch);
        searchBar.addEventListener('keypress', e => {
            if (e.key === 'Enter') performSearch();
        });
        searchBar.addEventListener('input', debounce(performSearch, 300));
        filterBy.addEventListener('change', performSearch);
    }

    function switchType(type) {
        currentType = type;
        document.querySelectorAll('.toggle-option').forEach(option => {
            option.classList.toggle('active', option.dataset.type === type);
        });
        searchBar.placeholder = `Search ${type} by filename, URL, or date...`;
        searchBar.value = '';
        displayData(allData[currentType]);
        updateStats();
    }

    async function loadData() {
        try {
            showLoading();
            const data = await new Promise(resolve => {
                chrome.storage.local.get({
                    downloadHistory: []
                }, resolve);
            });

            let allItems = [...(data.downloadHistory || [])];

            allItems = removeDuplicates(allItems);

            // Screenshot logic: sirf downloadHistory se, jisme size ho
            allData.screenshots = allItems.filter(item => {
                let fname = '';
                if (item.filepath) {
                    fname = item.filepath.split(/[\\/]/).pop();
                } else if (item.filename) {
                    fname = item.filename.split(/[\\/]/).pop();
                } else {
                    fname = item.filename || '';
                }
                fname = fname.toLowerCase();

                return (
                    (fname.includes('screenshot') ||
                    fname.includes('capture') ||
                    fname.includes('screen') ||
                    (item.url && item.url.startsWith('data:image/')) ||
                    (item.filepath && (
                        item.filepath.toLowerCase().includes('screenshot') ||
                        item.filepath.toLowerCase().includes('screen') ||
                        item.filepath.toLowerCase().includes('capture')
                    )))
                    && (item.size || item.fileSize || item.totalBytes)
                );
            });

            // Download logic: untouched, show all items from downloadHistory except screenshots
            allData.downloads = allItems.filter(item => {
                let fname = '';
                if (item.filepath) {
                    fname = item.filepath.split(/[\\/]/).pop();
                } else if (item.filename) {
                    fname = item.filename.split(/[\\/]/).pop();
                } else {
                    fname = item.filename || '';
                }
                fname = fname.toLowerCase();

                const isScreenshot =
                    fname.includes('screenshot') ||
                    fname.includes('capture') ||
                    fname.includes('screen') ||
                    (item.url && item.url.startsWith('data:image/')) ||
                    (item.filepath && (
                        item.filepath.toLowerCase().includes('screenshot') ||
                        item.filepath.toLowerCase().includes('screen') ||
                        item.filepath.toLowerCase().includes('capture')
                    ));
                return !isScreenshot && (item.downloadUrl || item.filename);
            });

            allData.screenshots.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
            allData.downloads.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

            displayData(allData[currentType]);
            updateStats();
        } catch (error) {
            displayError(`Failed to load history. Error: ${error.message}`);
        }
    }

    function removeDuplicates(items) {
        const seen = new Set();
        return items.filter(item => {
            let fname = '';
            if (item.filepath) {
                fname = item.filepath.split(/[\\/]/).pop();
            } else if (item.filename) {
                fname = item.filename.split(/[\\/]/).pop();
            } else {
                fname = item.filename || '';
            }
            let key;
            if (fname.toLowerCase().includes('screenshot')) {
                key = `ss-${fname.replace(/\.[^/.]+$/, "")}-${item.timestamp || ''}`;
            } else {
                key = `${fname}-${item.fileSize || item.size || 0}-${item.timestamp || Date.now()}`;
            }
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function showLoading() {
        list.innerHTML = `
            <div class="loading-spinner">
                <div class="spinner"></div>
                <p class="loading-text">Loading your history...</p>
            </div>
        `;
    }

    function displayData(data) {
        if (!data || data.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">${currentType === 'screenshots' ? '📸' : '📥'}</div>
                    <h3>No ${currentType} found</h3>
                    <p>Start using SmartShot to capture screenshots or download files, and they'll appear here.</p>
                </div>
            `;
            return;
        }

        list.innerHTML = data.map(item => {
            // Clean filename: Remove screenshot_ prefix and date/time part
            let displayFilename = '';
            if (item.filepath) {
                displayFilename = item.filepath.split(/[\\/]/).pop();
            } else if (item.filename) {
                displayFilename = item.filename.split(/[\\/]/).pop();
            } else {
                displayFilename = item.filename || item.name || "Untitled";
            }

            // Remove SmartShot date/time pattern from screenshot name
            if (currentType === 'screenshots') {
                displayFilename = displayFilename
                    .replace(/^screenshot_/, '')
                    .replace(/_{2,}/g, '_') // Remove double underscores
                    .replace(/(_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)?(\.png)?$/i, '.png');
            }

            let fileSize = 'Unknown size';
            if (item.size) fileSize = typeof item.size === 'number' ? formatFileSize(item.size) : item.size;
            else if (item.fileSize) fileSize = typeof item.fileSize === 'number' ? formatFileSize(item.fileSize) : item.fileSize;
            else if (item.totalBytes) fileSize = typeof item.totalBytes === 'number' ? formatFileSize(item.totalBytes) : item.totalBytes;

            const fileExtension = getFileExtension(displayFilename || '');
            const fileType = getFileType(fileExtension);
            const dimensions = item.dimensions || item.resolution || null;

            // Date & Time for UI
            const timestamp = item.timestamp || item.dateCreated || item.downloadTime;
            const dateStr = formatDate(timestamp);
            const timeStr = formatTime(timestamp);

            // --- UI change: Show "Captured at:" for screenshots, "Downloaded at:" for downloads ---
            let dateTimeLabel = '';
            if (currentType === 'screenshots') {
                dateTimeLabel = `<span class="date-label">Captured at:</span> <span class="date">${dateStr}</span> <span class="time">${timeStr}</span>`;
            } else {
                dateTimeLabel = `<span class="date-label">Downloaded at:</span> <span class="date">${dateStr}</span> <span class="time">${timeStr}</span>`;
            }

            return `
                <div class="item">
                    <div class="item-header">
                        <div class="item-title">${displayFilename}</div>
                        <div class="item-timestamp">
                            ${dateTimeLabel}
                        </div>
                    </div>
                    <div class="item-content">
                        ${generateUrlSection(item)}
                        <div class="item-meta">
                            <div class="meta-item">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2-2V8z"/>
                                    <polyline points="14,2 14,8 20,8"/>
                                </svg>
                                ${fileSize}
                            </div>
                            ${dimensions ? `
                                <div class="meta-item">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                                    </svg>
                                    ${dimensions}
                                </div>
                            ` : ''}
                            ${fileType ? `
                                <div class="meta-item">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2-2V8z"/>
                                    </svg>
                                    ${fileType}
                                </div>
                            ` : ''}
                            ${item.filepath ? `
                                <div class="meta-item">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M3 3h18v18H3zM9 9h6v6H9z"/>
                                    </svg>
                                    ${item.filepath.length > 40 ? '...' + item.filepath.slice(-40) : item.filepath}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function generateUrlSection(item) {
        let urlSection = '';
        // Screenshots logic
        if (currentType === 'screenshots') {
            if (item.url && item.url.startsWith('data:')) {
                const dataType = item.url.substring(5, item.url.indexOf(';')) || 'image';
                urlSection += `
                    <div class="item-url">
                        <strong>Image:</strong> <span style="color: #6b7280;">[${dataType.toUpperCase()} - Captured Screenshot]</span>
                    </div>
                `;
            } else if (item.url) {
                urlSection += `
                    <div class="item-url">
                        <strong>File URL:</strong> <a href="${item.url}" target="_blank">${shortenUrl(item.url)}</a>
                    </div>
                `;
            }
            if (item.tabUrl || item.pageUrl || item.sourceUrl || item.referrer) {
                const sourceUrl = item.tabUrl || item.pageUrl || item.sourceUrl || item.referrer;
                urlSection += `
                    <div class="item-url">
                        <strong>Source Page:</strong> <a href="${sourceUrl}" target="_blank">${shortenUrl(sourceUrl)}</a>
                    </div>
                `;
            }
            if (item.originalUrl && !item.originalUrl.startsWith('data:') && item.originalUrl !== item.url) {
                urlSection += `
                    <div class="item-url">
                        <strong>Image URL:</strong> <a href="${item.originalUrl}" target="_blank">${shortenUrl(item.originalUrl)}</a>
                    </div>
                `;
            }
        }
        // Downloads logic: Only Download URL and Source Page
        if (currentType === 'downloads') {
            if (item.downloadUrl) {
                urlSection += `
                    <div class="item-url">
                        <strong>Download URL:</strong> <a href="${item.downloadUrl}" target="_blank">${shortenUrl(item.downloadUrl)}</a>
                    </div>
                `;
            }
            if (item.tabUrl || item.pageUrl || item.sourceUrl || item.referrer) {
                const sourceUrl = item.tabUrl || item.pageUrl || item.sourceUrl || item.referrer;
                urlSection += `
                    <div class="item-url">
                        <strong>Source Page:</strong> <a href="${sourceUrl}" target="_blank">${shortenUrl(sourceUrl)}</a>
                    </div>
                `;
            }
        }
        return urlSection;
    }

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function formatDate(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) return '';
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }

    function formatTime(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) return '';
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    function performSearch() {
        const query = searchBar.value.toLowerCase().trim();
        const filterByValue = filterBy.value;
        const data = allData[currentType];

        if (!query) {
            displayData(data);
            return;
        }

        const filtered = data.filter(item => {
            let displayFilename = '';
            if (item.filepath) {
                displayFilename = item.filepath.split(/[\\/]/).pop();
            } else if (item.filename) {
                displayFilename = item.filename.split(/[\\/]/).pop();
            } else {
                displayFilename = item.filename || item.name || "Untitled";
            }

            // Screenshot name clean for search
            if (currentType === 'screenshots') {
                displayFilename = displayFilename.replace(/(_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)?(\.png)?$/i, '').replace(/^screenshot_/, '');
            }

            if (filterByValue === 'all') {
                return (displayFilename || '').toLowerCase().includes(query) ||
                    (item.name || '').toLowerCase().includes(query) ||
                    (item.url || '').toLowerCase().includes(query) ||
                    (item.tabUrl || '').toLowerCase().includes(query) ||
                    (item.pageUrl || '').toLowerCase().includes(query) ||
                    (item.sourceUrl || '').toLowerCase().includes(query) ||
                    (item.downloadUrl || '').toLowerCase().includes(query) ||
                    (item.referrer || '').toLowerCase().includes(query) ||
                    (item.filepath || '').toLowerCase().includes(query) ||
                    formatDate(item.timestamp || item.dateCreated || item.downloadTime).toLowerCase().includes(query) ||
                    formatTime(item.timestamp || item.dateCreated || item.downloadTime).toLowerCase().includes(query);
            } else if (filterByValue === 'filename') {
                return (displayFilename || '').toLowerCase().includes(query) ||
                    (item.name || '').toLowerCase().includes(query);
            } else if (filterByValue === 'url') {
                return (item.url || '').toLowerCase().includes(query) ||
                    (item.tabUrl || '').toLowerCase().includes(query) ||
                    (item.pageUrl || '').toLowerCase().includes(query) ||
                    (item.sourceUrl || '').toLowerCase().includes(query) ||
                    (item.downloadUrl || '').toLowerCase().includes(query) ||
                    (item.referrer || '').toLowerCase().includes(query);
            } else if (filterByValue === 'timestamp') {
                return formatDate(item.timestamp || item.dateCreated || item.downloadTime).toLowerCase().includes(query) ||
                    formatTime(item.timestamp || item.dateCreated || item.downloadTime).toLowerCase().includes(query);
            }
            return false;
        });

        displayData(filtered);
    }

    function clearSearch() {
        searchBar.value = '';
        displayData(allData[currentType]);
    }

    function updateStats() {
        const data = allData[currentType];
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

        const todayItems = data.filter(item => {
            const timestamp = item.timestamp || item.dateCreated || item.downloadTime;
            if (!timestamp) return false;
            return new Date(timestamp) >= today;
        }).length;

        const weekItems = data.filter(item => {
            const timestamp = item.timestamp || item.dateCreated || item.downloadTime;
            if (!timestamp) return false;
            return new Date(timestamp) >= weekAgo;
        }).length;

        totalCount.textContent = data.length;
        todayCount.textContent = todayItems;
        weekCount.textContent = weekItems;
    }

    function formatTimestamp(timestamp) {
        if (!timestamp) return 'Unknown date';
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) return 'Invalid date';
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;

        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        });
    }

    function shortenUrl(url) {
        if (!url) return '';
        return url.length > 60 ? `${url.substring(0, 57)}...` : url;
    }

    function getFileExtension(filename) {
        if (!filename) return '';
        const parts = filename.split('.');
        return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
    }

    function getFileType(extension) {
        const types = {
            'png': 'PNG Image',
            'jpg': 'JPEG Image',
            'jpeg': 'JPEG Image',
            'gif': 'GIF Image',
            'webp': 'WebP Image',
            'svg': 'SVG Image',
            'bmp': 'BMP Image',
            'tiff': 'TIFF Image',
            'pdf': 'PDF Document',
            'doc': 'Word Document',
            'docx': 'Word Document',
            'xls': 'Excel Spreadsheet',
            'xlsx': 'Excel Spreadsheet',
            'ppt': 'PowerPoint',
            'pptx': 'PowerPoint',
            'zip': 'ZIP Archive',
            'rar': 'RAR Archive',
            '7z': '7-Zip Archive',
            'txt': 'Text File',
            'csv': 'CSV File',
            'json': 'JSON File',
            'mp4': 'MP4 Video',
            'avi': 'AVI Video',
            'mp3': 'MP3 Audio',
            'wav': 'WAV Audio'
        };
        return types[extension] || (extension ? extension.toUpperCase() + ' File' : '');
    }

    function displayError(message) {
        list.innerHTML = `
            <div class="error">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-bottom: 8px;">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="15" y1="9" x2="9" y2="15"/>
                    <line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
                <p>${message}</p>
            </div>
        `;
    }

    function debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        };
    }

    if (chrome && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === 'local' && (
                changes.imageDownloads ||
                changes.downloads ||
                changes.screenshots ||
                changes.smartshotHistory ||
                changes.fileDownloads ||
                changes.capturedImages ||
                changes.downloadHistory
            )) {
                loadData();
            }
        });
    }

    if (chrome && chrome.downloads && chrome.downloads.onChanged) {
        chrome.downloads.onChanged.addListener(downloadDelta => {
            if (downloadDelta.state && downloadDelta.state.current === 'complete') {
                setTimeout(() => loadData(), 1000);
            }
        });
    }
});