// pairing.js - Firefox/Manifest V2 Version
// Money Manager Extension - Pairing Screen

(function() {
    'use strict';

    // Use browser API for Firefox
    const browserAPI = (typeof browser !== 'undefined') ? browser : chrome;
    
    // ==================== DOM Elements ====================
    const elements = {
        step1: document.getElementById('step1'),
        step2: document.getElementById('step2'),
        step3: document.getElementById('step3'),
        step1Content: document.getElementById('step1Content'),
        step2Content: document.getElementById('step2Content'),
        step3Content: document.getElementById('step3Content'),
        host: document.getElementById('host'),
        port: document.getElementById('port'),
        testConnectionBtn: document.getElementById('testConnectionBtn'),
        nextToPairBtn: document.getElementById('nextToPairBtn'),
        connectionStatus: document.getElementById('connectionStatus'),
        pairingCode: document.getElementById('pairingCode'),
        pairingTimer: document.getElementById('pairingTimer'),
        pairingStatus: document.getElementById('pairingStatus'),
        backToConnectBtn: document.getElementById('backToConnectBtn'),
        regenerateCodeBtn: document.getElementById('regenerateCodeBtn'),
        goToExtensionBtn: document.getElementById('goToExtensionBtn'),
        helpLink: document.getElementById('helpLink')
    };

    // ==================== State ====================
    let currentStep = 1;
    let currentPairingCode = null;
    let codeExpiry = null;
    let timerInterval = null;
    let wsConnection = null;
    let isConnected = false;

    // ==================== Storage Keys ====================
    const STORAGE_KEYS = {
        SETTINGS: 'moneyManagerSettings',
        PAIRED: 'moneyManager_paired'
    };

    // ==================== Step Management ====================

    function goToStep(step) {
        elements.step1.classList.remove('active', 'completed');
        elements.step2.classList.remove('active', 'completed');
        elements.step3.classList.remove('active', 'completed');
        
        elements.step1Content.classList.add('hidden');
        elements.step2Content.classList.add('hidden');
        elements.step3Content.classList.add('hidden');
        
        if (step === 1) {
            elements.step1.classList.add('active');
            elements.step1Content.classList.remove('hidden');
        } else if (step === 2) {
            elements.step1.classList.add('completed');
            elements.step2.classList.add('active');
            elements.step2Content.classList.remove('hidden');
        } else if (step === 3) {
            elements.step1.classList.add('completed');
            elements.step2.classList.add('completed');
            elements.step3.classList.add('active');
            elements.step3Content.classList.remove('hidden');
        }
        
        currentStep = step;
    }

    // ==================== Connection Functions ====================

    async function testConnection() {
        const host = elements.host.value.trim();
        const port = parseInt(elements.port.value);
        
        if (!host) {
            showConnectionStatus(false, 'Please enter a host address');
            return;
        }
        
        if (isNaN(port) || port < 1 || port > 65535) {
            showConnectionStatus(false, 'Please enter a valid port number (1-65535)');
            return;
        }
        
        showConnectionStatus('loading', 'Testing connection...');
        
        try {
            const ws = new WebSocket(`ws://${host}:${port}`);
            
            const timeout = setTimeout(() => {
                ws.close();
                showConnectionStatus(false, 'Connection timeout. Make sure desktop app is running.');
            }, 5000);
            
            ws.onopen = () => {
                clearTimeout(timeout);
                isConnected = true;
                showConnectionStatus(true, 'Connected successfully!');
                elements.nextToPairBtn.disabled = false;
                
                saveSettings(host, port);
                
                ws.close();
            };
            
            ws.onerror = () => {
                clearTimeout(timeout);
                showConnectionStatus(false, 'Failed to connect. Check if desktop app is running.');
                elements.nextToPairBtn.disabled = true;
            };
            
        } catch (error) {
            showConnectionStatus(false, 'Connection error: ' + error.message);
            elements.nextToPairBtn.disabled = true;
        }
    }

    function showConnectionStatus(status, message) {
        const statusDiv = elements.connectionStatus;
        
        if (status === 'loading') {
            statusDiv.innerHTML = `
                <div class="status-icon">⏳</div>
                <div class="status-title">Testing Connection...</div>
                <div class="status-message">${message}</div>
            `;
        } else if (status === true) {
            statusDiv.innerHTML = `
                <div class="status-icon">✅</div>
                <div class="status-title">Connected!</div>
                <div class="status-message">${message}</div>
                <div class="status-details">Ready to pair with desktop app</div>
            `;
            statusDiv.style.background = '#f0fdf4';
        } else {
            statusDiv.innerHTML = `
                <div class="status-icon">❌</div>
                <div class="status-title">Connection Failed</div>
                <div class="status-message">${message}</div>
                <div class="status-details">Make sure Money Manager desktop app is running</div>
            `;
            statusDiv.style.background = '#fef2f2';
        }
    }

    async function saveSettings(host, port) {
        try {
            const settings = {
                host: host,
                port: port,
                autoDetect: true,
                showNotifications: true,
                paired: true
            };
            
            await browserAPI.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: settings });
            console.log('Settings saved');
            return true;
        } catch (error) {
            console.error('Error saving settings:', error);
            return false;
        }
    }

    async function loadSettings() {
        try {
            const result = await browserAPI.storage.sync.get([STORAGE_KEYS.SETTINGS]);
            if (result[STORAGE_KEYS.SETTINGS]) {
                const settings = result[STORAGE_KEYS.SETTINGS];
                if (elements.host) elements.host.value = settings.host || 'localhost';
                if (elements.port) elements.port.value = settings.port || 8765;
                return settings;
            }
        } catch (error) {
            console.error('Error loading settings:', error);
        }
        return null;
    }

    // ==================== Pairing Functions ====================

    function generatePairingCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    async function startPairing() {
        const host = elements.host.value.trim();
        const port = parseInt(elements.port.value);
        
        currentPairingCode = generatePairingCode();
        codeExpiry = Date.now() + 5 * 60 * 1000;
        
        elements.pairingCode.textContent = currentPairingCode;
        
        startTimer();
        connectForPairing(host, port);
        updatePairingStatus('waiting', 'Waiting for desktop app to confirm pairing...');
        goToStep(2);
    }

    function startTimer() {
        if (timerInterval) clearInterval(timerInterval);
        
        timerInterval = setInterval(() => {
            const remaining = codeExpiry - Date.now();
            
            if (remaining <= 0) {
                clearInterval(timerInterval);
                elements.pairingTimer.textContent = 'Code expired! Please regenerate.';
                elements.pairingTimer.style.color = '#ef4444';
                
                if (wsConnection) wsConnection.close();
                updatePairingStatus('expired', 'Pairing code expired. Click "Regenerate Code" to try again.');
            } else {
                const minutes = Math.floor(remaining / 60000);
                const seconds = Math.floor((remaining % 60000) / 1000);
                elements.pairingTimer.textContent = `Expires in: ${minutes}:${seconds.toString().padStart(2, '0')}`;
                elements.pairingTimer.style.color = '#ef4444';
            }
        }, 1000);
    }

    function connectForPairing(host, port) {
        if (wsConnection) wsConnection.close();
        
        try {
            wsConnection = new WebSocket(`ws://${host}:${port}`);
            
            wsConnection.onopen = () => {
                console.log('WebSocket connected for pairing');
                wsConnection.send(JSON.stringify({
                    type: 'pairing_request',
                    code: currentPairingCode,
                    extensionId: browserAPI.runtime.id,
                    timestamp: Date.now()
                }));
            };
            
            wsConnection.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    handlePairingMessage(data);
                } catch (error) {
                    console.error('Error parsing message:', error);
                }
            };
            
            wsConnection.onerror = (error) => {
                console.error('WebSocket error:', error);
                updatePairingStatus('error', 'Connection error. Make sure desktop app is running.');
            };
            
            wsConnection.onclose = () => {
                console.log('WebSocket closed');
                if (currentStep === 2) {
                    updatePairingStatus('error', 'Connection lost. Click "Back" to reconnect.');
                }
            };
            
        } catch (error) {
            console.error('Failed to connect:', error);
            updatePairingStatus('error', 'Failed to connect to desktop app.');
        }
    }

    function handlePairingMessage(data) {
        switch (data.type) {
            case 'pairing_confirmed':
                clearInterval(timerInterval);
                updatePairingStatus('success', 'Pairing confirmed! Redirecting...');
                markAsPaired();
                
                setTimeout(() => {
                    goToStep(3);
                    if (wsConnection) wsConnection.close();
                }, 1500);
                break;
                
            case 'pairing_rejected':
                updatePairingStatus('error', 'Pairing rejected. Please try again.');
                break;
                
            case 'pairing_invalid_code':
                updatePairingStatus('error', 'Invalid pairing code. Please regenerate and try again.');
                break;
        }
    }

    function updatePairingStatus(status, message) {
        const statusDiv = elements.pairingStatus;
        
        switch (status) {
            case 'waiting':
                statusDiv.innerHTML = `
                    <div class="status-icon">⏳</div>
                    <div class="status-title">Waiting for Pairing...</div>
                    <div class="status-message">${message}</div>
                `;
                statusDiv.style.background = '#eff6ff';
                break;
                
            case 'success':
                statusDiv.innerHTML = `
                    <div class="status-icon">✅</div>
                    <div class="status-title">Pairing Successful!</div>
                    <div class="status-message">${message}</div>
                `;
                statusDiv.style.background = '#f0fdf4';
                break;
                
            case 'error':
                statusDiv.innerHTML = `
                    <div class="status-icon">❌</div>
                    <div class="status-title">Pairing Failed</div>
                    <div class="status-message">${message}</div>
                `;
                statusDiv.style.background = '#fef2f2';
                break;
                
            case 'expired':
                statusDiv.innerHTML = `
                    <div class="status-icon">⏰</div>
                    <div class="status-title">Code Expired</div>
                    <div class="status-message">${message}</div>
                `;
                statusDiv.style.background = '#fef3c7';
                break;
        }
    }

    async function markAsPaired() {
        try {
            await browserAPI.storage.sync.set({ [STORAGE_KEYS.PAIRED]: true });
            console.log('Marked as paired');
            return true;
        } catch (error) {
            console.error('Error marking as paired:', error);
            return false;
        }
    }

    function regenerateCode() {
        if (timerInterval) clearInterval(timerInterval);
        
        currentPairingCode = generatePairingCode();
        codeExpiry = Date.now() + 5 * 60 * 1000;
        
        elements.pairingCode.textContent = currentPairingCode;
        startTimer();
        
        const host = elements.host.value.trim();
        const port = parseInt(elements.port.value);
        connectForPairing(host, port);
        
        updatePairingStatus('waiting', 'New pairing code generated. Enter it in desktop app.');
    }

    // ==================== Navigation Functions ====================

    function goToExtension() {
        window.close();
        if (browserAPI.runtime.openOptionsPage) {
            browserAPI.runtime.openOptionsPage();
        }
    }

    function openHelp() {
        browserAPI.tabs.create({ url: 'https://docs.moneymanager.app/pairing' });
    }

    // ==================== Event Listeners ====================

    function setupEventListeners() {
        if (elements.testConnectionBtn) {
            elements.testConnectionBtn.addEventListener('click', testConnection);
        }
        
        if (elements.nextToPairBtn) {
            elements.nextToPairBtn.addEventListener('click', startPairing);
        }
        
        if (elements.backToConnectBtn) {
            elements.backToConnectBtn.addEventListener('click', () => {
                if (timerInterval) clearInterval(timerInterval);
                if (wsConnection) wsConnection.close();
                goToStep(1);
            });
        }
        
        if (elements.regenerateCodeBtn) {
            elements.regenerateCodeBtn.addEventListener('click', regenerateCode);
        }
        
        if (elements.goToExtensionBtn) {
            elements.goToExtensionBtn.addEventListener('click', goToExtension);
        }
        
        if (elements.helpLink) {
            elements.helpLink.addEventListener('click', (e) => {
                e.preventDefault();
                openHelp();
            });
        }
        
        if (elements.host) {
            elements.host.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') testConnection();
            });
        }
        
        if (elements.port) {
            elements.port.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') testConnection();
            });
        }
    }

    // ==================== Check if Already Paired ====================

    async function checkAlreadyPaired() {
        try {
            const result = await browserAPI.storage.sync.get([STORAGE_KEYS.PAIRED, STORAGE_KEYS.SETTINGS]);
            if (result[STORAGE_KEYS.PAIRED] && result[STORAGE_KEYS.SETTINGS]) {
                window.close();
                return true;
            }
        } catch (error) {
            console.error('Error checking paired status:', error);
        }
        return false;
    }

    // ==================== Initialization ====================

    async function init() {
        console.log('🚀 Pairing screen initializing (Firefox)...');
        
        const isPaired = await checkAlreadyPaired();
        if (isPaired) return;
        
        await loadSettings();
        setupEventListeners();
        goToStep(1);
        
        setTimeout(() => {
            testConnection();
        }, 500);
        
        console.log('✅ Pairing screen ready');
    }
    
    init();
})();