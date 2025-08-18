document.addEventListener("DOMContentLoaded", async () => {
    let currentType = 'screenshots';
    let allData = {
        screenshots: [],
        downloads: []
    };
    let stickyNotes = {};
    let extensionInstallDate = null;

    const list = document.getElementById("list");
    const searchBar = document.getElementById("searchBar");
    const filterBy = document.getElementById("filterBy");
    const searchBtn = document.getElementById("searchBtn");
    const clearBtn = document.getElementById("clearBtn");
    const totalCount = document.getElementById("totalCount");
    const todayCount = document.getElementById("todayCount");
    const weekCount = document.getElementById("weekCount");

    initializeEventListeners();
    await loadExtensionInstallDate();
    await loadData();
    await loadStickyNotes();

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

    // NEW: Extension install date tracking
    async function loadExtensionInstallDate() {
        try {
            const data = await new Promise(resolve => {
                chrome.storage.local.get({ extensionInstallDate: null }, resolve);
            });
            
            if (!data.extensionInstallDate) {
                // Set install date to now if not set
                extensionInstallDate = Date.now();
                await new Promise(resolve => {
                    chrome.storage.local.set({ extensionInstallDate: extensionInstallDate }, resolve);
                });
            } else {
                extensionInstallDate = data.extensionInstallDate;
            }
        } catch (error) {
            console.error('Error loading install date:', error);
            extensionInstallDate = Date.now();
        }
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

    function isValidDownloadUrl(url) {
        if (!url) return false;
        if (url.startsWith('blob:')) return false;
        if (url.startsWith('data:')) return false;
        if (url.startsWith('chrome://')) return false;
        if (url.startsWith('chrome-extension://')) return false;
        return url.startsWith('http://') || url.startsWith('https://');
    }

    function hasValidFileInfo(item) {
        const hasFilename = item.filename || item.filepath || item.name;
        const hasSize = item.size || item.fileSize || item.totalBytes;
        return hasFilename && hasSize;
    }

    // FIXED: Better timestamp validation with extension install date
    function validateTimestamp(timestamp) {
        if (!timestamp) return null;
        
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) return null;
        
        const now = new Date();
        const oneDayFuture = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        
        // Check if download is before extension was installed
        if (extensionInstallDate && date.getTime() < extensionInstallDate) {
            console.log(`Filtering pre-extension download: ${date} < ${new Date(extensionInstallDate)}`);
            return null;
        }
        
        // Don't allow future dates
        if (date > oneDayFuture) {
            return null;
        }
        
        return timestamp;
    }

    async function loadData() {
        try {
            showLoading();
            
            const data = await new Promise(resolve => {
                chrome.storage.local.get({
                    downloadHistory: [],
                    downloads: [],
                    fileDownloads: [],
                    smartshotHistory: []
                }, resolve);
            });

            let allItems = [];
            
            if (data.downloadHistory) allItems = allItems.concat(data.downloadHistory);
            if (data.downloads) allItems = allItems.concat(data.downloads);
            if (data.fileDownloads) allItems = allItems.concat(data.fileDownloads);
            if (data.smartshotHistory) allItems = allItems.concat(data.smartshotHistory);

            // FIXED: Remove duplicates with better logic
            allItems = removeDuplicatesAdvanced(allItems);

            allData.screenshots = allItems.filter(item => {
                if (!hasValidFileInfo(item)) return false;
                
                const filename = extractCleanFilename(item);
                const isScreenshot = (
                    filename.includes('screenshot') ||
                    filename.includes('capture') ||
                    filename.includes('screen') ||
                    (item.url && item.url.startsWith('data:image/')) ||
                    (item.filepath && (
                        item.filepath.toLowerCase().includes('screenshot') ||
                        item.filepath.toLowerCase().includes('screen') ||
                        item.filepath.toLowerCase().includes('capture')
                    ))
                );

                return isScreenshot;
            });

            allData.downloads = allItems.filter(item => {
                if (!hasValidFileInfo(item)) return false;
                
                const filename = extractCleanFilename(item);
                const isScreenshot = (
                    filename.includes('screenshot') ||
                    filename.includes('capture') ||
                    filename.includes('screen') ||
                    (item.url && item.url.startsWith('data:image/'))
                );

                return !isScreenshot;
            });

            // FIXED: Apply timestamp validation and filter invalid entries
            allData.downloads = allData.downloads.filter(item => {
                const originalTimestamp = item.timestamp || item.dateCreated || item.downloadTime;
                const validTimestamp = validateTimestamp(originalTimestamp);
                
                if (!validTimestamp) return false;
                
                item.validatedTimestamp = validTimestamp;
                return true;
            });

            allData.screenshots = allData.screenshots.filter(item => {
                const originalTimestamp = item.timestamp || item.dateCreated || item.downloadTime;
                const validTimestamp = validateTimestamp(originalTimestamp);
                
                if (!validTimestamp) return false;
                item.validatedTimestamp = validTimestamp;
                return true;
            });

            // Generate unique IDs
            allData.screenshots.forEach((item, index) => {
                if (!item.id) {
                    item.id = `screenshot_${generateItemId(item, index)}`;
                }
            });

            allData.downloads.forEach((item, index) => {
                if (!item.id) {
                    item.id = `download_${generateItemId(item, index)}`;
                }
            });

            // Sort by validated timestamp
            allData.screenshots.sort((a, b) => {
                const timeA = new Date(a.validatedTimestamp);
                const timeB = new Date(b.validatedTimestamp);
                return timeB - timeA;
            });

            allData.downloads.sort((a, b) => {
                const timeA = new Date(a.validatedTimestamp);
                const timeB = new Date(b.validatedTimestamp);
                return timeB - timeA;
            });

            displayData(allData[currentType]);
            updateStats();
            
        } catch (error) {
            console.error('Error loading data:', error);
            displayError(`Failed to load history. Error: ${error.message}`);
        }
    }

    // NEW: Extract clean filename helper
    function extractCleanFilename(item) {
        let filename = '';
        if (item.filepath) {
            filename = item.filepath.split(/[\\/]/).pop();
        } else if (item.filename) {
            filename = item.filename.split(/[\\/]/).pop();
        } else {
            filename = item.filename || item.name || '';
        }
        return filename.toLowerCase();
    }

    // FIXED: Advanced duplicate removal
    function removeDuplicatesAdvanced(items) {
        const duplicateGroups = new Map();
        
        // Group items by filename and size
        items.forEach((item, index) => {
            const filename = extractCleanFilename(item);
            const size = item.size || item.fileSize || item.totalBytes || 0;
            const key = `${filename}-${size}`;
            
            if (!duplicateGroups.has(key)) {
                duplicateGroups.set(key, []);
            }
            duplicateGroups.get(key).push({...item, originalIndex: index});
        });
        
        const filteredItems = [];
        
        duplicateGroups.forEach((group, key) => {
            if (group.length === 1) {
                filteredItems.push(group[0]);
            } else {
                // For duplicates, keep the one with most recent valid timestamp
                const validItems = group.filter(item => {
                    const timestamp = item.timestamp || item.dateCreated || item.downloadTime;
                    return validateTimestamp(timestamp) !== null;
                });
                
                if (validItems.length === 0) {
                    // If no valid timestamps, skip all
                    return;
                }
                
                // Sort by timestamp and keep most recent
                const sortedItems = validItems.sort((a, b) => {
                    const timeA = new Date(a.timestamp || a.dateCreated || a.downloadTime);
                    const timeB = new Date(b.timestamp || b.dateCreated || b.downloadTime);
                    return timeB - timeA;
                });
                
                filteredItems.push(sortedItems[0]);
                console.log(`Removed ${group.length - 1} duplicate(s) of: ${key}`);
            }
        });
        
        return filteredItems;
    }

    function generateItemId(item, index) {
        const filename = extractCleanFilename(item);
        const timestamp = item.validatedTimestamp || item.timestamp || item.dateCreated || item.downloadTime || Date.now();
        const size = item.size || item.fileSize || item.totalBytes || 0;
        
        return `${filename.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}_${size}_${index}`.substring(0, 50);
    }

    async function loadStickyNotes() {
        try {
            const data = await new Promise(resolve => {
                chrome.storage.local.get({ stickyNotes: {} }, resolve);
            });
            stickyNotes = data.stickyNotes || {};
        } catch (error) {
            console.error('Failed to load sticky notes:', error);
            stickyNotes = {};
        }
    }

    async function saveStickyNotes() {
        try {
            await new Promise(resolve => {
                chrome.storage.local.set({ stickyNotes }, resolve);
            });
        } catch (error) {
            console.error('Failed to save sticky notes:', error);
        }
    }

    function initializeStickyNoteListeners() {
        document.querySelectorAll('.sticky-note-preview').forEach(preview => {
            preview.addEventListener('click', function() {
                const itemId = this.dataset.itemId;
                showStickyNoteEditor(itemId);
            });
        });

        document.querySelectorAll('.sticky-note-save').forEach(button => {
            button.addEventListener('click', function() {
                const itemId = this.dataset.itemId;
                saveStickyNote(itemId);
            });
        });

        document.querySelectorAll('.sticky-note-cancel').forEach(button => {
            button.addEventListener('click', function() {
                const itemId = this.dataset.itemId;
                hideStickyNoteEditor(itemId);
            });
        });

        document.querySelectorAll('.sticky-note-textarea').forEach(textarea => {
            textarea.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault();
                    const itemId = this.dataset.itemId;
                    saveStickyNote(itemId);
                }
                if (e.key === 'Escape') {
                    e.preventDefault();
                    const itemId = this.dataset.itemId;
                    hideStickyNoteEditor(itemId);
                }
            });
        });
    }

    function showStickyNoteEditor(itemId) {
        const preview = document.querySelector(`.sticky-note-preview[data-item-id="${itemId}"]`);
        const editor = document.querySelector(`.sticky-note-editor[data-item-id="${itemId}"]`);
        const textarea = document.querySelector(`.sticky-note-textarea[data-item-id="${itemId}"]`);
        
        if (preview && editor && textarea) {
            preview.style.display = 'none';
            editor.classList.add('active');
            textarea.value = stickyNotes[itemId] || '';
            textarea.focus();
        }
    }

    function hideStickyNoteEditor(itemId) {
        const preview = document.querySelector(`.sticky-note-preview[data-item-id="${itemId}"]`);
        const editor = document.querySelector(`.sticky-note-editor[data-item-id="${itemId}"]`);
        
        if (preview && editor) {
            preview.style.display = 'flex';
            editor.classList.remove('active');
            updateStickyNotePreview(itemId);
        }
    }

    function saveStickyNote(itemId) {
        const textarea = document.querySelector(`.sticky-note-textarea[data-item-id="${itemId}"]`);
        
        if (textarea) {
            const noteText = textarea.value.trim();
            if (noteText) {
                stickyNotes[itemId] = noteText;
            } else {
                delete stickyNotes[itemId];
            }
            
            saveStickyNotes();
            hideStickyNoteEditor(itemId);
        }
    }

    function updateStickyNotePreview(itemId) {
        const preview = document.querySelector(`.sticky-note-preview[data-item-id="${itemId}"]`);
        const previewText = document.querySelector(`.sticky-note-preview-text[data-item-id="${itemId}"]`);
        
        if (preview && previewText) {
            const noteText = stickyNotes[itemId];
            if (noteText) {
                previewText.textContent = noteText;
                preview.classList.remove('empty');
            } else {
                previewText.textContent = 'Click to add a note...';
                preview.classList.add('empty');
            }
        }
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
            // FIXED: Better filename display logic
            let displayFilename = getDisplayFilename(item);

            let fileSize = 'Unknown size';
            if (item.size) fileSize = typeof item.size === 'number' ? formatFileSize(item.size) : item.size;
            else if (item.fileSize) fileSize = typeof item.fileSize === 'number' ? formatFileSize(item.fileSize) : item.fileSize;
            else if (item.totalBytes) fileSize = typeof item.totalBytes === 'number' ? formatFileSize(item.totalBytes) : item.totalBytes;

            const fileExtension = getFileExtension(displayFilename || '');
            const fileType = getFileType(fileExtension);
            const dimensions = item.dimensions || item.resolution || null;

            const timestamp = item.validatedTimestamp;
            const dateStr = formatDate(timestamp);
            const timeStr = formatTime(timestamp);

            let dateTimeLabel = '';
            if (currentType === 'screenshots') {
                dateTimeLabel = `<span class="date-label">Captured at:</span> <span class="date">${dateStr}</span> <span class="time">${timeStr}</span>`;
            } else {
                dateTimeLabel = `<span class="date-label">Downloaded at:</span> <span class="date">${dateStr}</span> <span class="time">${timeStr}</span>`;
            }

            const itemId = item.id;
            const noteText = stickyNotes[itemId] || '';
            const stickyNoteHtml = `
                <div class="sticky-note-container">
                    <div class="sticky-note-preview${!noteText ? ' empty' : ''}" data-item-id="${itemId}">
                        <span class="sticky-note-preview-text" data-item-id="${itemId}">
                            ${noteText || 'Click to add a note...'}
                        </span>
                        <span class="sticky-note-edit-icon">✏️</span>
                    </div>
                    <div class="sticky-note-editor" data-item-id="${itemId}">
                        <textarea 
                            class="sticky-note-textarea" 
                            data-item-id="${itemId}" 
                            placeholder="Add your notes here... (Ctrl+Enter to save, Esc to cancel)"
                        ></textarea>
                        <div class="sticky-note-actions">
                            <button class="sticky-note-save" data-item-id="${itemId}">Save</button>
                            <button class="sticky-note-cancel" data-item-id="${itemId}">Cancel</button>
                        </div>
                    </div>
                </div>
            `;

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
                        ${stickyNoteHtml}
                    </div>
                </div>
            `;
        }).join('');

        setTimeout(() => initializeStickyNoteListeners(), 100);
    }

    // NEW: Better filename display logic
    function getDisplayFilename(item) {
        if (currentType === 'downloads') {
            // Priority: filename > suggestedFilename > name > filepath basename
            return item.filename || 
                   item.suggestedFilename || 
                   item.name || 
                   (item.filepath ? item.filepath.split(/[\\/]/).pop() : '') || 
                   "Untitled";
        } else {
            // For screenshots
            let filename = '';
            if (item.filepath) {
                filename = item.filepath.split(/[\\/]/).pop();
            } else if (item.filename) {
                filename = item.filename.split(/[\\/]/).pop();
            } else {
                filename = item.filename || item.name || "Untitled";
            }
            
            // Clean up screenshot filename
            return filename
                .replace(/^screenshot_/, '')
                .replace(/_{2,}/g, '_')
                .replace(/(_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)?(\.png)?$/i, '.png');
        }
    }

    // FIXED: Better URL section with accurate URL detection
    function generateUrlSection(item) {
        let urlSection = '';
        
        if (currentType === 'screenshots') {
            if (item.url && item.url.startsWith('data:')) {
                const dataType = item.url.substring(5, item.url.indexOf(';')) || 'image';
                urlSection += `
                    <div class="item-url">
                        <strong>Image:</strong> <span style="color: #6b7280;">[${dataType.toUpperCase()} - Captured Screenshot]</span>
                    </div>
                `;
            } else if (item.url && isValidDownloadUrl(item.url)) {
                urlSection += `
                    <div class="item-url">
                        <strong>File URL:</strong> <a href="${item.url}" target="_blank">${shortenUrl(item.url)}</a>
                    </div>
                `;
            }
            
            const sourceUrl = item.tabUrl || item.pageUrl || item.sourceUrl || item.referrer;
            if (sourceUrl && isValidDownloadUrl(sourceUrl)) {
                urlSection += `
                    <div class="item-url">
                        <strong>Source Page:</strong> <a href="${sourceUrl}" target="_blank">${shortenUrl(sourceUrl)}</a>
                    </div>
                `;
            }
            
            if (item.originalUrl && !item.originalUrl.startsWith('data:') && 
                item.originalUrl !== item.url && isValidDownloadUrl(item.originalUrl)) {
                urlSection += `
                    <div class="item-url">
                        <strong>Image URL:</strong> <a href="${item.originalUrl}" target="_blank">${shortenUrl(item.originalUrl)}</a>
                    </div>
                `;
            }
        }
        
        if (currentType === 'downloads') {
            // FIXED: Better download URL detection and display
            const downloadUrl = item.url || item.downloadUrl || item.finalUrl;
            
            if (downloadUrl && isValidDownloadUrl(downloadUrl)) {
                // Check if URL is still accessible (basic check)
                urlSection += `
                    <div class="item-url">
                        <strong>Download URL:</strong> <a href="${downloadUrl}" target="_blank">${shortenUrl(downloadUrl)}</a>
                    </div>
                `;
            } else if (downloadUrl) {
                // We have a URL but it's not valid (blob, data, etc.)
                urlSection += `
                    <div class="item-url">
                        <strong>Download URL:</strong> <span style="color: #9ca3af;">[URL no longer accessible]</span>
                    </div>
                `;
            }
            
            // FIXED: Better source URL logic
            const sourceUrl = item.referrer || item.tabUrl || item.pageUrl || item.sourceUrl;
            if (sourceUrl && isValidDownloadUrl(sourceUrl) && sourceUrl !== downloadUrl) {
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
            const displayFilename = getDisplayFilename(item);
            const noteText = stickyNotes[item.id] || '';
            const searchTimestamp = item.validatedTimestamp;

            if (filterByValue === 'all') {
                return (displayFilename || '').toLowerCase().includes(query) ||
                    (item.name || '').toLowerCase().includes(query) ||
                    (item.suggestedFilename || '').toLowerCase().includes(query) ||
                    (item.url || '').toLowerCase().includes(query) ||
                    (item.tabUrl || '').toLowerCase().includes(query) ||
                    (item.pageUrl || '').toLowerCase().includes(query) ||
                    (item.sourceUrl || '').toLowerCase().includes(query) ||
                    (item.downloadUrl || '').toLowerCase().includes(query) ||
                    (item.referrer || '').toLowerCase().includes(query) ||
                    (item.filepath || '').toLowerCase().includes(query) ||
                    noteText.toLowerCase().includes(query) ||
                    formatDate(searchTimestamp).toLowerCase().includes(query) ||
                    formatTime(searchTimestamp).toLowerCase().includes(query);
            } else if (filterByValue === 'filename') {
                return (displayFilename || '').toLowerCase().includes(query) ||
                    (item.name || '').toLowerCase().includes(query) ||
                    (item.suggestedFilename || '').toLowerCase().includes(query);
            } else if (filterByValue === 'url') {
                return (item.url || '').toLowerCase().includes(query) ||
                    (item.tabUrl || '').toLowerCase().includes(query) ||
                    (item.pageUrl || '').toLowerCase().includes(query) ||
                    (item.sourceUrl || '').toLowerCase().includes(query) ||
                    (item.downloadUrl || '').toLowerCase().includes(query) ||
                    (item.referrer || '').toLowerCase().includes(query);
            } else if (filterByValue === 'timestamp') {
                return formatDate(searchTimestamp).toLowerCase().includes(query) ||
                    formatTime(searchTimestamp).toLowerCase().includes(query);
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
            const timestamp = item.validatedTimestamp;
            if (!timestamp) return false;
            return new Date(timestamp) >= today;
        }).length;

        const weekItems = data.filter(item => {
            const timestamp = item.validatedTimestamp;
            if (!timestamp) return false;
            return new Date(timestamp) >= weekAgo;
        }).length;

        totalCount.textContent = data.length;
        todayCount.textContent = todayItems;
        weekCount.textContent = weekItems;
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
            'wav': 'WAV Audio',
            'exe': 'Executable File',
            'msi': 'Windows Installer'
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

    // NEW: Clean up old/invalid storage data
    async function cleanupStorageData() {
        try {
            const data = await new Promise(resolve => {
                chrome.storage.local.get({
                    downloadHistory: [],
                    downloads: [],
                    fileDownloads: [],
                    smartshotHistory: []
                }, resolve);
            });

            let needsUpdate = false;
            const cleanedData = {};

            // Clean each storage array
            ['downloadHistory', 'downloads', 'fileDownloads', 'smartshotHistory'].forEach(key => {
                if (data[key]) {
                    const originalLength = data[key].length;
                    
                    const cleaned = data[key].filter(item => {
                        // Remove items without valid file info
                        if (!hasValidFileInfo(item)) return false;
                        
                        // Remove items with invalid timestamps (pre-extension)
                        const timestamp = item.timestamp || item.dateCreated || item.downloadTime;
                        if (!validateTimestamp(timestamp)) return false;
                        
                        return true;
                    });
                    
                    cleanedData[key] = cleaned;
                    
                    if (cleaned.length !== originalLength) {
                        needsUpdate = true;
                        console.log(`Cleaned ${key}: ${originalLength} -> ${cleaned.length} items`);
                    }
                }
            });

            if (needsUpdate) {
                await new Promise(resolve => {
                    chrome.storage.local.set(cleanedData, resolve);
                });
                console.log('Storage cleanup completed');
            }
        } catch (error) {
            console.error('Error cleaning up storage data:', error);
        }
    }

    // Run cleanup on load
    cleanupStorageData();

    // Listen for storage changes
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
            if (areaName === 'local' && changes.stickyNotes) {
                loadStickyNotes();
            }
        });
    }

    // Listen for download completion
    if (chrome && chrome.downloads && chrome.downloads.onChanged) {
        chrome.downloads.onChanged.addListener(downloadDelta => {
            if (downloadDelta.state && downloadDelta.state.current === 'complete') {
                setTimeout(() => loadData(), 1000);
            }
        });
    }
});
