document.addEventListener("DOMContentLoaded", async () => {
    let currentType = 'screenshots';
    let allData = {
        screenshots: [],
        downloads: []
    };
    let stickyNotes = {}; // Store sticky notes by item ID

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

    // Enhanced data validation functions
    function isValidDownloadUrl(url) {
        if (!url) return false;
        
        // Reject blob URLs as they're temporary and unreachable
        if (url.startsWith('blob:')) return false;
        
        // Reject data URLs for downloads (they're usually screenshots)
        if (url.startsWith('data:')) return false;
        
        // Only allow http/https URLs
        return url.startsWith('http://') || url.startsWith('https://');
    }

    function isRecentDownload(timestamp, maxDaysOld = 30) {
        if (!timestamp) return false;
        
        const now = new Date();
        const downloadDate = new Date(timestamp);
        
        // Check if timestamp is valid
        if (isNaN(downloadDate.getTime())) return false;
        
        // Check if download is not in the future (invalid timestamp)
        if (downloadDate > now) return false;
        
        // Check if download is within acceptable range (not too old)
        const daysDiff = (now - downloadDate) / (1000 * 60 * 60 * 24);
        return daysDiff <= maxDaysOld;
    }

    function hasValidFileInfo(item) {
        // Must have a filename and size
        const hasFilename = item.filename || item.filepath || item.name;
        const hasSize = item.size || item.fileSize || item.totalBytes;
        
        return hasFilename && hasSize;
    }

    async function loadData() {
        try {
            showLoading();
            
            // Get data from multiple potential storage locations
            const data = await new Promise(resolve => {
                chrome.storage.local.get({
                    downloadHistory: [],
                    downloads: [],
                    fileDownloads: [],
                    smartshotHistory: []
                }, resolve);
            });

            let allItems = [];
            
            // Combine all download sources
            if (data.downloadHistory) allItems = allItems.concat(data.downloadHistory);
            if (data.downloads) allItems = allItems.concat(data.downloads);
            if (data.fileDownloads) allItems = allItems.concat(data.fileDownloads);
            if (data.smartshotHistory) allItems = allItems.concat(data.smartshotHistory);

            // Remove duplicates first
            allItems = removeDuplicates(allItems);

            // Filter screenshots with enhanced validation
            allData.screenshots = allItems.filter(item => {
                if (!hasValidFileInfo(item)) return false;
                
                let fname = '';
                if (item.filepath) {
                    fname = item.filepath.split(/[\\/]/).pop();
                } else if (item.filename) {
                    fname = item.filename.split(/[\\/]/).pop();
                } else {
                    fname = item.filename || '';
                }
                fname = fname.toLowerCase();

                const isScreenshot = (
                    fname.includes('screenshot') ||
                    fname.includes('capture') ||
                    fname.includes('screen') ||
                    (item.url && item.url.startsWith('data:image/')) ||
                    (item.filepath && (
                        item.filepath.toLowerCase().includes('screenshot') ||
                        item.filepath.toLowerCase().includes('screen') ||
                        item.filepath.toLowerCase().includes('capture')
                    ))
                );

                return isScreenshot && (item.size || item.fileSize || item.totalBytes);
            });

            // Filter downloads with strict validation
            allData.downloads = allItems.filter(item => {
                // Must have valid file info
                if (!hasValidFileInfo(item)) return false;
                
                let fname = '';
                if (item.filepath) {
                    fname = item.filepath.split(/[\\/]/).pop();
                } else if (item.filename) {
                    fname = item.filename.split(/[\\/]/).pop();
                } else {
                    fname = item.filename || '';
                }
                fname = fname.toLowerCase();

                // Exclude screenshots
                const isScreenshot = (
                    fname.includes('screenshot') ||
                    fname.includes('capture') ||
                    fname.includes('screen') ||
                    (item.url && item.url.startsWith('data:image/')) ||
                    (item.filepath && (
                        item.filepath.toLowerCase().includes('screenshot') ||
                        item.filepath.toLowerCase().includes('screen') ||
                        item.filepath.toLowerCase().includes('capture')
                    ))
                );

                if (isScreenshot) return false;

                // Must have either a valid download URL or be a recent download
                const hasValidUrl = isValidDownloadUrl(item.downloadUrl) || isValidDownloadUrl(item.url);
                const isRecent = isRecentDownload(item.timestamp || item.dateCreated || item.downloadTime);
                
                // For downloads without valid URLs, only include if they're very recent (last 7 days)
                if (!hasValidUrl) {
                    return isRecentDownload(item.timestamp || item.dateCreated || item.downloadTime, 7);
                }

                return true;
            });

            // Additional filtering to remove suspicious entries
            allData.downloads = allData.downloads.filter(item => {
                const timestamp = item.timestamp || item.dateCreated || item.downloadTime;
                
                // Remove items with timestamps that don't make sense
                if (timestamp) {
                    const downloadDate = new Date(timestamp);
                    const now = new Date();
                    
                    // Remove future dates
                    if (downloadDate > now) return false;
                    
                    // Remove very old dates that are likely corrupted (older than 1 year)
                    const yearAgo = new Date();
                    yearAgo.setFullYear(yearAgo.getFullYear() - 1);
                    if (downloadDate < yearAgo) return false;
                }

                // Remove items with suspicious filenames that have old dates but recent timestamps
                let fname = '';
                if (item.filepath) {
                    fname = item.filepath.split(/[\\/]/).pop();
                } else if (item.filename) {
                    fname = item.filename.split(/[\\/]/).pop();
                } else {
                    fname = item.filename || '';
                }

                // Check for date mismatch in filename vs timestamp
                const filenameMatch = fname.match(/20\d{2}/); // Match years like 2024, 2023, etc.
                if (filenameMatch && timestamp) {
                    const filenameYear = parseInt(filenameMatch[0]);
                    const timestampYear = new Date(timestamp).getFullYear();
                    
                    // If filename has old year but timestamp is recent, it might be corrupted data
                    if (Math.abs(filenameYear - timestampYear) > 1) {
                        console.warn('Suspicious date mismatch, excluding:', fname, filenameYear, timestampYear);
                        return false;
                    }
                }

                return true;
            });

            // Add unique IDs to items for sticky notes
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

            // Sort by timestamp (most recent first)
            allData.screenshots.sort((a, b) => {
                const timeA = new Date(a.timestamp || a.dateCreated || a.downloadTime || 0);
                const timeB = new Date(b.timestamp || b.dateCreated || b.downloadTime || 0);
                return timeB - timeA;
            });

            allData.downloads.sort((a, b) => {
                const timeA = new Date(a.timestamp || a.dateCreated || a.downloadTime || 0);
                const timeB = new Date(b.timestamp || b.dateCreated || b.downloadTime || 0);
                return timeB - timeA;
            });

            displayData(allData[currentType]);
            updateStats();
            
            console.log(`Loaded ${allData.screenshots.length} screenshots and ${allData.downloads.length} downloads`);
        } catch (error) {
            console.error('Error loading data:', error);
            displayError(`Failed to load history. Error: ${error.message}`);
        }
    }

    function generateItemId(item, index) {
        // Generate a unique ID based on item properties
        let fname = '';
        if (item.filepath) {
            fname = item.filepath.split(/[\\/]/).pop();
        } else if (item.filename) {
            fname = item.filename.split(/[\\/]/).pop();
        } else {
            fname = item.filename || '';
        }
        
        const timestamp = item.timestamp || item.dateCreated || item.downloadTime || Date.now();
        const size = item.size || item.fileSize || item.totalBytes || 0;
        
        return `${fname.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}_${size}_${index}`.substring(0, 50);
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
        // Add event listeners for sticky note previews (click to edit)
        document.querySelectorAll('.sticky-note-preview').forEach(preview => {
            preview.addEventListener('click', function() {
                const itemId = this.dataset.itemId;
                showStickyNoteEditor(itemId);
            });
        });

        // Add event listeners for save/cancel buttons
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

        // Handle Enter key in textarea (Ctrl+Enter to save)
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
                // Enhanced duplicate detection for downloads
                const size = item.size || item.fileSize || item.totalBytes || 0;
                const timestamp = item.timestamp || item.dateCreated || item.downloadTime || '';
                const url = item.downloadUrl || item.url || '';
                key = `${fname}-${size}-${timestamp}-${url.substring(0, 50)}`;
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

            // Sticky note content
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

        // Initialize sticky note event listeners after rendering
        setTimeout(() => initializeStickyNoteListeners(), 100);
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
            } else if (item.url && isValidDownloadUrl(item.url)) {
                urlSection += `
                    <div class="item-url">
                        <strong>File URL:</strong> <a href="${item.url}" target="_blank">${shortenUrl(item.url)}</a>
                    </div>
                `;
            }
            if (item.tabUrl || item.pageUrl || item.sourceUrl || item.referrer) {
                const sourceUrl = item.tabUrl || item.pageUrl || item.sourceUrl || item.referrer;
                if (isValidDownloadUrl(sourceUrl)) {
                    urlSection += `
                        <div class="item-url">
                            <strong>Source Page:</strong> <a href="${sourceUrl}" target="_blank">${shortenUrl(sourceUrl)}</a>
                        </div>
                    `;
                }
            }
            if (item.originalUrl && !item.originalUrl.startsWith('data:') && item.originalUrl !== item.url && isValidDownloadUrl(item.originalUrl)) {
                urlSection += `
                    <div class="item-url">
                        <strong>Image URL:</strong> <a href="${item.originalUrl}" target="_blank">${shortenUrl(item.originalUrl)}</a>
                    </div>
                `;
            }
        }
        // Downloads logic: Only show valid URLs
        if (currentType === 'downloads') {
            if (item.downloadUrl && isValidDownloadUrl(item.downloadUrl)) {
                urlSection += `
                    <div class="item-url">
                        <strong>Download URL:</strong> <a href="${item.downloadUrl}" target="_blank">${shortenUrl(item.downloadUrl)}</a>
                    </div>
                `;
            } else if (!isValidDownloadUrl(item.downloadUrl) && item.downloadUrl) {
                // Show that URL is not accessible
                urlSection += `
                    <div class="item-url">
                        <strong>Download URL:</strong> <span style="color: #9ca3af;">[URL no longer accessible]</span>
                    </div>
                `;
            }
            if (item.tabUrl || item.pageUrl || item.sourceUrl || item.referrer) {
                const sourceUrl = item.tabUrl || item.pageUrl || item.sourceUrl || item.referrer;
                if (isValidDownloadUrl(sourceUrl)) {
                    urlSection += `
                        <div class="item-url">
                            <strong>Source Page:</strong> <a href="${sourceUrl}" target="_blank">${shortenUrl(sourceUrl)}</a>
                        </div>
                    `;
                }
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

            // Also search in sticky notes
            const noteText = stickyNotes[item.id] || '';

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
                    noteText.toLowerCase().includes(query) ||
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

    // Add cleanup function for old/invalid data
    async function cleanupStorageData() {
        try {
            const data = await new Promise(resolve => {
                chrome.storage.local.get({
                    downloadHistory: []
                }, resolve);
            });

            let cleanedHistory = data.downloadHistory.filter(item => {
                // Remove items with invalid timestamps
                const timestamp = item.timestamp || item.dateCreated || item.downloadTime;
                if (timestamp) {
                    const date = new Date(timestamp);
                    const now = new Date();
                    
                    // Removing future dates or very old dates (older than 2 years)
                    if (date > now || date < new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000)) {
                        console.log('Removing invalid timestamp item:', item.filename, timestamp);
                        return false;
                    }
                }

                // Keep valid items
                return hasValidFileInfo(item);
            });

            if (cleanedHistory.length !== data.downloadHistory.length) {
                console.log(`Cleaned ${data.downloadHistory.length - cleanedHistory.length} invalid items from storage`);
                await new Promise(resolve => {
                    chrome.storage.local.set({ downloadHistory: cleanedHistory }, resolve);
                });
            }
        } catch (error) {
            console.error('Error cleaning up storage data:', error);
        }
    }

    //  cleanup on initialization 
    cleanupStorageData();

    // Storage change listeners
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

    if (chrome && chrome.downloads && chrome.downloads.onChanged) {
        chrome.downloads.onChanged.addListener(downloadDelta => {
            if (downloadDelta.state && downloadDelta.state.current === 'complete') {
                setTimeout(() => loadData(), 1000);
            }
        });
    }
});
