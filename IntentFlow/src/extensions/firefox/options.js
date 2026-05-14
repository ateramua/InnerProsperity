// options.js - Firefox/Manifest V2 Version
// IntentFlow Extension - Options Page

(function() {
    'use strict';

    // Default settings (same as Chrome version)
    const DEFAULT_SETTINGS = {
        host: 'localhost',
        port: 8765,
        autoReconnect: true,
        autoDetect: true,
        showNotifications: true,
        detectionDelay: 500,
        confidenceThreshold: 70,
        priceSelectors: [
            '[data-price]',
            '.price',
            '.product-price',
            '[itemprop="price"]',
            '.amount',
            '.total',
            '.grand-total',
            '[data-testid="price"]',
            '.a-price-whole'
        ],
        descriptionSelectors: [
            '[data-product-name]',
            '.product-title',
            '.product-name',
            '[itemprop="name"]',
            '.description',
            '.transaction-description'
        ],
        filterMode: 'all',
        whitelist: [],
        blacklist: [],
        theme: 'auto',
        primaryColor: '#667eea',
        notificationPosition: 'bottom-right',
        stats: {
            transactionsCaptured: 0,
            detectionAccuracy: 0,
            lastReset: null
        }
    };

    // Use browser.storage for Firefox (or fallback to chrome.storage)
    const storage = (typeof browser !== 'undefined' && browser.storage) ? browser.storage.sync : chrome.storage.sync;
    
    // DOM Elements (same as Chrome version)
    const elements = {
        host: document.getElementById('host'),
        port: document.getElementById('port'),
        autoReconnect: document.getElementById('autoReconnect'),
        autoDetect: document.getElementById('autoDetect'),
        showNotifications: document.getElementById('showNotifications'),
        detectionDelay: document.getElementById('detectionDelay'),
        delayValue: document.getElementById('delayValue'),
        confidenceThreshold: document.getElementById('confidenceThreshold'),
        confidenceValue: document.getElementById('confidenceValue'),
        priceSelectorsList: document.getElementById('priceSelectorsList'),
        descSelectorsList: document.getElementById('descSelectorsList'),
        filterMode: document.getElementById('filterMode'),
        whitelistGroup: document.getElementById('whitelistGroup'),
        blacklistGroup: document.getElementById('blacklistGroup'),
        whitelistList: document.getElementById('whitelistList'),
        blacklistList: document.getElementById('blacklistList'),
        theme: document.getElementById('theme'),
        primaryColor: document.getElementById('primaryColor'),
        notificationPosition: document.getElementById('notificationPosition'),
        statTransactions: document.getElementById('statTransactions'),
        statOffline: document.getElementById('statOffline'),
        statSites: document.getElementById('statSites'),
        statAccuracy: document.getElementById('statAccuracy'),
        saveBtn: document.getElementById('saveBtn'),
        cancelBtn: document.getElementById('cancelBtn'),
        resetAll: document.getElementById('resetAll'),
        exportSettings: document.getElementById('exportSettings'),
        importSettings: document.getElementById('importSettings'),
        importFile: document.getElementById('importFile'),
        resetStats: document.getElementById('resetStats'),
        addPriceSelector: document.getElementById('addPriceSelector'),
        addDescSelector: document.getElementById('addDescSelector'),
        addWhitelist: document.getElementById('addWhitelist'),
        addBlacklist: document.getElementById('addBlacklist'),
        newPriceSelector: document.getElementById('newPriceSelector'),
        newDescSelector: document.getElementById('newDescSelector'),
        newWhitelist: document.getElementById('newWhitelist'),
        newBlacklist: document.getElementById('newBlacklist')
    };

    let currentSettings = { ...DEFAULT_SETTINGS };

    // ==================== UTILITY FUNCTIONS ====================
    // (Same as Chrome version, but using browser.storage)

    function showStatus(message, isError = false) {
        const status = document.createElement('div');
        status.className = `status-message ${isError ? 'error' : ''}`;
        status.textContent = message;
        document.body.appendChild(status);
        
        setTimeout(() => {
            status.style.animation = 'slideOutRight 0.3s ease-out';
            setTimeout(() => status.remove(), 300);
        }, 3000);
    }

    function saveToStorage(settings) {
        return new Promise((resolve) => {
            storage.set({ moneyManagerSettings: settings }).then(() => {
                showStatus('Settings saved successfully!');
                resolve(true);
            }).catch((error) => {
                console.error('Error saving settings:', error);
                showStatus('Error saving settings: ' + error.message, true);
                resolve(false);
            });
        });
    }

    function loadFromStorage() {
        return new Promise((resolve) => {
            storage.get(['moneyManagerSettings']).then((result) => {
                if (result.moneyManagerSettings) {
                    const merged = { ...DEFAULT_SETTINGS, ...result.moneyManagerSettings };
                    resolve(merged);
                } else {
                    resolve(DEFAULT_SETTINGS);
                }
            }).catch((error) => {
                console.error('Error loading settings:', error);
                resolve(DEFAULT_SETTINGS);
            });
        });
    }

    // ==================== RENDER FUNCTIONS ====================
    // (Same as Chrome version - identical code)

    function renderPriceSelectors() {
        if (!elements.priceSelectorsList) return;
        
        elements.priceSelectorsList.innerHTML = '';
        currentSettings.priceSelectors.forEach((selector, index) => {
            const item = document.createElement('div');
            item.className = 'selector-item';
            item.innerHTML = `
                <span class="selector-text">${escapeHtml(selector)}</span>
                <button class="remove-selector" data-type="price" data-index="${index}">✕</button>
            `;
            elements.priceSelectorsList.appendChild(item);
        });
        
        document.querySelectorAll('.remove-selector[data-type="price"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(btn.dataset.index);
                currentSettings.priceSelectors.splice(index, 1);
                renderPriceSelectors();
            });
        });
    }

    function renderDescriptionSelectors() {
        if (!elements.descSelectorsList) return;
        
        elements.descSelectorsList.innerHTML = '';
        currentSettings.descriptionSelectors.forEach((selector, index) => {
            const item = document.createElement('div');
            item.className = 'selector-item';
            item.innerHTML = `
                <span class="selector-text">${escapeHtml(selector)}</span>
                <button class="remove-selector" data-type="desc" data-index="${index}">✕</button>
            `;
            elements.descSelectorsList.appendChild(item);
        });
        
        document.querySelectorAll('.remove-selector[data-type="desc"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(btn.dataset.index);
                currentSettings.descriptionSelectors.splice(index, 1);
                renderDescriptionSelectors();
            });
        });
    }

    function renderWhitelist() {
        if (!elements.whitelistList) return;
        
        elements.whitelistList.innerHTML = '';
        currentSettings.whitelist.forEach((site, index) => {
            const item = document.createElement('div');
            item.className = 'selector-item';
            item.innerHTML = `
                <span class="selector-text">${escapeHtml(site)}</span>
                <button class="remove-selector" data-type="whitelist" data-index="${index}">✕</button>
            `;
            elements.whitelistList.appendChild(item);
        });
        
        document.querySelectorAll('.remove-selector[data-type="whitelist"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(btn.dataset.index);
                currentSettings.whitelist.splice(index, 1);
                renderWhitelist();
            });
        });
    }

    function renderBlacklist() {
        if (!elements.blacklistList) return;
        
        elements.blacklistList.innerHTML = '';
        currentSettings.blacklist.forEach((site, index) => {
            const item = document.createElement('div');
            item.className = 'selector-item';
            item.innerHTML = `
                <span class="selector-text">${escapeHtml(site)}</span>
                <button class="remove-selector" data-type="blacklist" data-index="${index}">✕</button>
            `;
            elements.blacklistList.appendChild(item);
        });
        
        document.querySelectorAll('.remove-selector[data-type="blacklist"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(btn.dataset.index);
                currentSettings.blacklist.splice(index, 1);
                renderBlacklist();
            });
        });
    }

    function updateUIFromSettings() {
        elements.host.value = currentSettings.host;
        elements.port.value = currentSettings.port;
        elements.autoReconnect.checked = currentSettings.autoReconnect;
        elements.autoDetect.checked = currentSettings.autoDetect;
        elements.showNotifications.checked = currentSettings.showNotifications;
        elements.detectionDelay.value = currentSettings.detectionDelay;
        elements.delayValue.textContent = currentSettings.detectionDelay + 'ms';
        elements.confidenceThreshold.value = currentSettings.confidenceThreshold;
        elements.confidenceValue.textContent = currentSettings.confidenceThreshold + '%';
        elements.filterMode.value = currentSettings.filterMode;
        toggleFilterMode(currentSettings.filterMode);
        elements.theme.value = currentSettings.theme;
        elements.primaryColor.value = currentSettings.primaryColor;
        elements.notificationPosition.value = currentSettings.notificationPosition;
        
        renderPriceSelectors();
        renderDescriptionSelectors();
        renderWhitelist();
        renderBlacklist();
        updateStatsDisplay();
    }

    function updateStatsDisplay() {
        const stats = currentSettings.stats || DEFAULT_SETTINGS.stats;
        elements.statTransactions.textContent = stats.transactionsCaptured || 0;
        elements.statAccuracy.textContent = (stats.detectionAccuracy || 0) + '%';
        
        // Firefox uses browser.storage.local
        const localStorage = (typeof browser !== 'undefined' && browser.storage) ? browser.storage.local : chrome.storage.local;
        localStorage.get(['moneyManager_offlineQueue']).then((result) => {
            const queue = result.moneyManager_offlineQueue || [];
            elements.statOffline.textContent = queue.length;
        }).catch(() => {
            elements.statOffline.textContent = '0';
        });
        
        elements.statSites.textContent = currentSettings.whitelist.length + currentSettings.blacklist.length || 'N/A';
    }

    function toggleFilterMode(mode) {
        if (mode === 'whitelist') {
            elements.whitelistGroup.style.display = 'block';
            elements.blacklistGroup.style.display = 'none';
        } else if (mode === 'blacklist') {
            elements.whitelistGroup.style.display = 'none';
            elements.blacklistGroup.style.display = 'block';
        } else {
            elements.whitelistGroup.style.display = 'none';
            elements.blacklistGroup.style.display = 'none';
        }
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ==================== EVENT HANDLERS ====================
    // (Same as Chrome version)

    async function saveSettings() {
        currentSettings.host = elements.host.value;
        currentSettings.port = parseInt(elements.port.value);
        currentSettings.autoReconnect = elements.autoReconnect.checked;
        currentSettings.autoDetect = elements.autoDetect.checked;
        currentSettings.showNotifications = elements.showNotifications.checked;
        currentSettings.detectionDelay = parseInt(elements.detectionDelay.value);
        currentSettings.confidenceThreshold = parseInt(elements.confidenceThreshold.value);
        currentSettings.filterMode = elements.filterMode.value;
        currentSettings.theme = elements.theme.value;
        currentSettings.primaryColor = elements.primaryColor.value;
        currentSettings.notificationPosition = elements.notificationPosition.value;
        
        await saveToStorage(currentSettings);
        
        // Notify background script (Firefox uses browser.runtime)
        const runtime = (typeof browser !== 'undefined' && browser.runtime) ? browser.runtime : chrome.runtime;
        runtime.sendMessage({ type: 'settingsUpdated', settings: currentSettings });
    }

    async function resetAllSettings() {
        if (confirm('Are you sure you want to reset all settings to default? This cannot be undone.')) {
            currentSettings = { ...DEFAULT_SETTINGS };
            updateUIFromSettings();
            await saveToStorage(currentSettings);
            showStatus('All settings reset to default');
        }
    }

    async function exportSettings() {
        const data = {
            version: '1.0.0',
            exportDate: new Date().toISOString(),
            settings: currentSettings
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `money-manager-settings-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showStatus('Settings exported successfully!');
    }

    function importSettings() {
        elements.importFile.click();
    }

    async function handleImportFile(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                if (imported.settings) {
                    currentSettings = { ...DEFAULT_SETTINGS, ...imported.settings };
                    updateUIFromSettings();
                    await saveToStorage(currentSettings);
                    showStatus('Settings imported successfully!');
                } else {
                    showStatus('Invalid settings file', true);
                }
            } catch (error) {
                showStatus('Error parsing settings file: ' + error.message, true);
            }
        };
        reader.readAsText(file);
        elements.importFile.value = '';
    }

    async function resetStats() {
        if (confirm('Reset all statistics? This will clear transaction counts and accuracy data.')) {
            currentSettings.stats = {
                transactionsCaptured: 0,
                detectionAccuracy: 0,
                lastReset: new Date().toISOString()
            };
            await saveToStorage(currentSettings);
            updateStatsDisplay();
            showStatus('Statistics reset successfully');
        }
    }

    // ==================== EVENT LISTENERS ====================

    function setupEventListeners() {
        elements.detectionDelay.addEventListener('input', (e) => {
            elements.delayValue.textContent = e.target.value + 'ms';
        });
        
        elements.confidenceThreshold.addEventListener('input', (e) => {
            elements.confidenceValue.textContent = e.target.value + '%';
        });
        
        elements.filterMode.addEventListener('change', (e) => {
            toggleFilterMode(e.target.value);
        });
        
        elements.addPriceSelector.addEventListener('click', () => {
            const selector = elements.newPriceSelector.value.trim();
            if (selector) {
                currentSettings.priceSelectors.push(selector);
                renderPriceSelectors();
                elements.newPriceSelector.value = '';
            }
        });
        
        elements.addDescSelector.addEventListener('click', () => {
            const selector = elements.newDescSelector.value.trim();
            if (selector) {
                currentSettings.descriptionSelectors.push(selector);
                renderDescriptionSelectors();
                elements.newDescSelector.value = '';
            }
        });
        
        elements.addWhitelist.addEventListener('click', () => {
            const site = elements.newWhitelist.value.trim().toLowerCase();
            if (site && !currentSettings.whitelist.includes(site)) {
                currentSettings.whitelist.push(site);
                renderWhitelist();
                elements.newWhitelist.value = '';
            }
        });
        
        elements.addBlacklist.addEventListener('click', () => {
            const site = elements.newBlacklist.value.trim().toLowerCase();
            if (site && !currentSettings.blacklist.includes(site)) {
                currentSettings.blacklist.push(site);
                renderBlacklist();
                elements.newBlacklist.value = '';
            }
        });
        
        elements.saveBtn.addEventListener('click', saveSettings);
        elements.cancelBtn.addEventListener('click', () => window.close());
        elements.resetAll.addEventListener('click', resetAllSettings);
        elements.exportSettings.addEventListener('click', exportSettings);
        elements.importSettings.addEventListener('click', importSettings);
        elements.importFile.addEventListener('change', handleImportFile);
        elements.resetStats.addEventListener('click', resetStats);
    }

    // ==================== INITIALIZATION ====================

    async function init() {
        // Set version (Firefox uses browser.runtime)
        const versionElement = document.getElementById('version');
        if (versionElement) {
            const runtime = (typeof browser !== 'undefined' && browser.runtime) ? browser.runtime : chrome.runtime;
            if (runtime && runtime.getManifest) {
                const manifest = runtime.getManifest();
                versionElement.textContent = `Version ${manifest.version}`;
            }
        }
        
        currentSettings = await loadFromStorage();
        updateUIFromSettings();
        setupEventListeners();
        
        console.log('✅ Options page initialized (Firefox)');
    }
    
    init();
})();