// popup.js - Firefox/Manifest V2 Version
// Money Manager Extension - Popup Script

(function() {
    'use strict';

    // Use browser API for Firefox, fallback to chrome
    const browserAPI = (typeof browser !== 'undefined') ? browser : chrome;
    
    // ==================== DOM Elements ====================
    const elements = {
        statusDot: document.getElementById('statusDot'),
        statusText: document.getElementById('statusText'),
        description: document.getElementById('description'),
        amount: document.getElementById('amount'),
        category: document.getElementById('category'),
        saveBtn: document.getElementById('saveBtn'),
        detectBtn: document.getElementById('detectBtn'),
        detectedSection: document.getElementById('detectedSection'),
        detectedAmount: document.getElementById('detectedAmount'),
        detectedDesc: document.getElementById('detectedDesc'),
        detectedSite: document.getElementById('detectedSite'),
        useDetectedBtn: document.getElementById('useDetectedBtn'),
        transactionList: document.getElementById('transactionList'),
        clearRecentBtn: document.getElementById('clearRecentBtn'),
        openSettings: document.getElementById('openSettings'),
        openDashboard: document.getElementById('openDashboard'),
        version: document.getElementById('version')
    };

    // ==================== State ====================
    let currentTab = null;
    let detectedData = null;
    let recentTransactions = [];
    let isConnected = false;

    // ==================== Storage Keys ====================
    const STORAGE_KEYS = {
        RECENT_TRANSACTIONS: 'moneyManager_recentTransactions',
        SETTINGS: 'moneyManagerSettings'
    };

    // ==================== Utility Functions ====================

    function showStatus(message, isError = false) {
        if (elements.statusText) {
            elements.statusText.textContent = message;
        }
        if (elements.statusDot) {
            if (isError) {
                elements.statusDot.classList.add('offline');
            } else {
                elements.statusDot.classList.remove('offline');
            }
        }
        
        if (message !== 'Connected' && message !== 'Disconnected') {
            setTimeout(() => {
                if (elements.statusText && isConnected) {
                    elements.statusText.textContent = 'Connected';
                } else if (elements.statusText && !isConnected) {
                    elements.statusText.textContent = 'Offline';
                }
            }, 3000);
        }
    }

    async function getCurrentTab() {
        const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
        return tabs[0];
    }

    async function sendToContentScript(tabId, message) {
        try {
            const response = await browserAPI.tabs.sendMessage(tabId, message);
            return response;
        } catch (error) {
            console.log('Content script not available:', error);
            return null;
        }
    }

    // ==================== Storage Functions ====================

    async function loadRecentTransactions() {
        try {
            const result = await browserAPI.storage.local.get([STORAGE_KEYS.RECENT_TRANSACTIONS]);
            return result[STORAGE_KEYS.RECENT_TRANSACTIONS] || [];
        } catch (error) {
            console.error('Error loading transactions:', error);
            return [];
        }
    }

    async function saveRecentTransactions(transactions) {
        try {
            await browserAPI.storage.local.set({ [STORAGE_KEYS.RECENT_TRANSACTIONS]: transactions });
            return true;
        } catch (error) {
            console.error('Error saving transactions:', error);
            return false;
        }
    }

    async function addRecentTransaction(transaction) {
        const newTransaction = {
            id: Date.now(),
            description: transaction.description,
            amount: transaction.amount,
            category: transaction.category,
            date: new Date().toISOString(),
            timestamp: Date.now()
        };
        
        recentTransactions.unshift(newTransaction);
        
        if (recentTransactions.length > 20) {
            recentTransactions = recentTransactions.slice(0, 20);
        }
        
        await saveRecentTransactions(recentTransactions);
        renderRecentTransactions();
    }

    async function clearRecentTransactions() {
        recentTransactions = [];
        await saveRecentTransactions(recentTransactions);
        renderRecentTransactions();
        showStatus('Recent transactions cleared');
    }

    // ==================== Render Functions ====================

    function renderRecentTransactions() {
        if (!elements.transactionList) return;
        
        if (recentTransactions.length === 0) {
            elements.transactionList.innerHTML = '<div class="empty-state">No recent transactions</div>';
            return;
        }
        
        const list = document.createElement('div');
        list.className = 'transaction-list';
        
        recentTransactions.forEach(transaction => {
            const item = document.createElement('div');
            item.className = 'transaction-item';
            
            const amount = parseFloat(transaction.amount);
            const isNegative = amount < 0;
            const formattedAmount = `$${Math.abs(amount).toFixed(2)}`;
            
            item.innerHTML = `
                <div class="transaction-info">
                    <div class="transaction-description">${escapeHtml(transaction.description || 'Untitled')}</div>
                    <div class="transaction-date">${formatDate(transaction.date)}</div>
                </div>
                <div class="transaction-amount ${isNegative ? 'negative' : ''}">
                    ${isNegative ? '-' : '+'}${formattedAmount}
                </div>
            `;
            
            item.addEventListener('click', () => {
                if (elements.description) elements.description.value = transaction.description;
                if (elements.amount) elements.amount.value = Math.abs(transaction.amount);
                if (elements.category) elements.category.value = transaction.category || '';
                showStatus('Loaded transaction for editing');
            });
            
            list.appendChild(item);
        });
        
        elements.transactionList.innerHTML = '';
        elements.transactionList.appendChild(list);
    }

    function formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;
        if (diff < 604800000) return `${Math.floor(diff / 86400000)} days ago`;
        
        return date.toLocaleDateString();
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ==================== Detection Functions ====================

    async function detectFromPage() {
        if (!currentTab) {
            currentTab = await getCurrentTab();
        }
        
        showStatus('Detecting...');
        
        const response = await sendToContentScript(currentTab.id, { type: 'getPageData' });
        
        if (response && response.data) {
            detectedData = response.data;
            
            if (elements.detectedSection) {
                elements.detectedSection.style.display = 'block';
            }
            
            if (elements.detectedAmount && detectedData.amount) {
                elements.detectedAmount.textContent = `$${detectedData.amount.toFixed(2)}`;
            }
            
            if (elements.detectedDesc && detectedData.description) {
                elements.detectedDesc.textContent = detectedData.description;
            }
            
            if (elements.detectedSite && detectedData.url) {
                try {
                    const url = new URL(detectedData.url);
                    elements.detectedSite.textContent = url.hostname;
                } catch (e) {
                    elements.detectedSite.textContent = detectedData.url || 'Unknown';
                }
            }
            
            showStatus('Detection complete!');
        } else {
            showStatus('No transaction detected on this page', true);
            
            if (elements.detectedSection) {
                elements.detectedSection.style.display = 'block';
                elements.detectedAmount.textContent = 'Not found';
                elements.detectedDesc.textContent = 'Try selecting text with a price';
                elements.detectedSite.textContent = 'Unknown';
            }
        }
    }

    function useDetectedData() {
        if (detectedData) {
            if (detectedData.amount && elements.amount) {
                elements.amount.value = detectedData.amount;
            }
            if (detectedData.description && elements.description) {
                elements.description.value = detectedData.description;
            }
            
            if (elements.detectedSection) {
                elements.detectedSection.style.display = 'none';
            }
            
            showStatus('Detected data applied!');
        }
    }

    // ==================== Transaction Functions ====================

    async function saveTransaction() {
        const description = elements.description?.value.trim();
        const amount = parseFloat(elements.amount?.value);
        const category = elements.category?.value;
        
        if (!description) {
            showStatus('Please enter a description', true);
            elements.description?.focus();
            return;
        }
        
        if (isNaN(amount) || amount <= 0) {
            showStatus('Please enter a valid amount', true);
            elements.amount?.focus();
            return;
        }
        
        const transaction = {
            description: description,
            amount: amount,
            category: category || 'Other',
            date: new Date().toISOString().split('T')[0],
            type: 'expense'
        };
        
        await addRecentTransaction(transaction);
        
        const sent = await sendToDesktopApp(transaction);
        
        if (sent) {
            showStatus('Transaction saved! ✅');
            
            if (elements.description) elements.description.value = '';
            if (elements.amount) elements.amount.value = '';
            if (elements.category) elements.category.value = '';
            
            if (elements.saveBtn) {
                const originalText = elements.saveBtn.textContent;
                elements.saveBtn.textContent = '✓ Saved!';
                setTimeout(() => {
                    if (elements.saveBtn) elements.saveBtn.textContent = originalText;
                }, 1500);
            }
        } else {
            showStatus('Saved locally (offline mode)', true);
        }
        
        if (elements.detectedSection) {
            elements.detectedSection.style.display = 'none';
        }
    }

    async function sendToDesktopApp(transaction) {
        try {
            const settings = await loadSettings();
            const host = settings.host || 'localhost';
            const port = settings.port || 8765;
            
            await fetch(`http://${host}:${port}/api/transaction`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...transaction,
                    source: 'extension_popup',
                    timestamp: new Date().toISOString()
                }),
                mode: 'no-cors'
            });
            
            return true;
        } catch (error) {
            console.log('Desktop app not reachable:', error);
            return false;
        }
    }

    async function loadSettings() {
        try {
            const result = await browserAPI.storage.sync.get([STORAGE_KEYS.SETTINGS]);
            if (result[STORAGE_KEYS.SETTINGS]) {
                return result[STORAGE_KEYS.SETTINGS];
            }
        } catch (error) {
            console.log('Error loading settings:', error);
        }
        
        return {
            host: 'localhost',
            port: 8765,
            autoDetect: true,
            showNotifications: true
        };
    }

    // ==================== Connection Check ====================

    async function checkConnection() {
        try {
            const settings = await loadSettings();
            await fetch(`http://${settings.host}:${settings.port}/api/ping`, {
                method: 'GET',
                mode: 'no-cors'
            });
            isConnected = true;
            showStatus('Connected');
            return true;
        } catch (error) {
            isConnected = false;
            showStatus('Offline', true);
            return false;
        }
    }

    // ==================== Navigation ====================

    function openSettings() {
        if (browserAPI.runtime.openOptionsPage) {
            browserAPI.runtime.openOptionsPage();
        } else {
            window.open(browserAPI.runtime.getURL('options.html'));
        }
    }

    function openDashboard() {
        browserAPI.tabs.create({ url: 'http://localhost:3000' });
    }

    // ==================== Event Listeners ====================

    function setupEventListeners() {
        if (elements.saveBtn) {
            elements.saveBtn.addEventListener('click', saveTransaction);
        }
        
        if (elements.detectBtn) {
            elements.detectBtn.addEventListener('click', detectFromPage);
        }
        
        if (elements.useDetectedBtn) {
            elements.useDetectedBtn.addEventListener('click', useDetectedData);
        }
        
        if (elements.clearRecentBtn) {
            elements.clearRecentBtn.addEventListener('click', clearRecentTransactions);
        }
        
        if (elements.openSettings) {
            elements.openSettings.addEventListener('click', (e) => {
                e.preventDefault();
                openSettings();
            });
        }
        
        if (elements.openDashboard) {
            elements.openDashboard.addEventListener('click', (e) => {
                e.preventDefault();
                openDashboard();
            });
        }
        
        if (elements.amount) {
            elements.amount.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    saveTransaction();
                }
            });
        }
        
        if (elements.description) {
            elements.description.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    elements.amount?.focus();
                }
            });
        }
    }

    // ==================== Auto-detect ====================

    async function autoDetect() {
        const settings = await loadSettings();
        if (settings.autoDetect !== false) {
            await detectFromPage();
        }
    }

    // ==================== Set Version ====================

    function setVersion() {
        const manifest = browserAPI.runtime.getManifest();
        if (elements.version && manifest.version) {
            elements.version.textContent = `v${manifest.version}`;
        }
    }

    // ==================== Initialization ====================

    async function init() {
        console.log('🚀 Popup initializing (Firefox)...');
        
        setVersion();
        currentTab = await getCurrentTab();
        recentTransactions = await loadRecentTransactions();
        renderRecentTransactions();
        await checkConnection();
        await autoDetect();
        setupEventListeners();
        
        setInterval(checkConnection, 30000);
        
        console.log('✅ Popup ready (Firefox)');
    }
    
    init();
})();