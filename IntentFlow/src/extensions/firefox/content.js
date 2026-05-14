// content.js - Firefox/Manifest V2 Version
// IntentFlow Extension - Content Script

(function() {
    'use strict';
    
    console.log('💰 IntentFlow extension (Firefox) loaded on:', window.location.hostname);
    
    // ==================== CONFIGURATION ====================
    const CONFIG = {
        desktopAppPort: 8765,
        desktopAppHost: 'localhost',
        debounceDelay: 500,
        detectPriceSelectors: [
            '[data-price]',
            '.price',
            '.product-price',
            '[itemprop="price"]',
            '.amount',
            '.total',
            '.grand-total',
            '[data-testid="price"]',
            '.a-price-whole',
            '.a-price-fraction',
            '.prices',
            '.product__price',
            '.cart-item-price'
        ],
        detectDescriptionSelectors: [
            '[data-product-name]',
            '.product-title',
            '.product-name',
            '[itemprop="name"]',
            '.description',
            '.transaction-description',
            '.cart-item-name',
            '.item-name'
        ]
    };
    
    // ==================== STATE MANAGEMENT ====================
    let detectedData = {
        amount: null,
        description: null,
        url: window.location.href,
        pageTitle: document.title,
        timestamp: new Date().toISOString()
    };
    
    let debounceTimer = null;
    let observer = null;
    
    // ==================== HELPER FUNCTIONS ====================
    
    /**
     * Extract numeric amount from text
     */
    function extractAmount(text) {
        if (!text) return null;
        
        // Match currency patterns: $49.99, 49.99, €49,99, etc.
        const patterns = [
            /\$?\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/,  // $49.99 or 49.99
            /(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s?€/,     // 49.99€
            /(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s?USD/,   // 49.99 USD
            /(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s?dollars?/i
        ];
        
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                // Remove commas and convert to number
                const amount = parseFloat(match[1].replace(/,/g, ''));
                if (!isNaN(amount) && amount > 0) {
                    return amount;
                }
            }
        }
        
        return null;
    }
    
    /**
     * Clean description text
     */
    function cleanDescription(text) {
        if (!text) return null;
        return text.trim()
            .replace(/\s+/g, ' ')
            .replace(/[^\w\s\-\.]/g, '')
            .substring(0, 200);
    }
    
    /**
     * Detect price from DOM elements
     */
    function detectPrice() {
        for (const selector of CONFIG.detectPriceSelectors) {
            const elements = document.querySelectorAll(selector);
            for (const element of elements) {
                const text = element.textContent || element.value;
                const amount = extractAmount(text);
                if (amount) {
                    console.log('💰 Detected price:', amount, 'from selector:', selector);
                    return amount;
                }
            }
        }
        
        // Check entire page text as fallback
        const bodyText = document.body.innerText;
        const amount = extractAmount(bodyText);
        if (amount) {
            console.log('💰 Detected price from page text:', amount);
            return amount;
        }
        
        return null;
    }
    
    /**
     * Detect description from DOM elements
     */
    function detectDescription() {
        // Try specific selectors first
        for (const selector of CONFIG.detectDescriptionSelectors) {
            const elements = document.querySelectorAll(selector);
            for (const element of elements) {
                const text = cleanDescription(element.textContent);
                if (text && text.length > 3) {
                    console.log('📝 Detected description:', text, 'from selector:', selector);
                    return text;
                }
            }
        }
        
        // Try meta tags
        const metaTitle = document.querySelector('meta[property="og:title"]');
        if (metaTitle && metaTitle.content) {
            return cleanDescription(metaTitle.content);
        }
        
        // Use page title as fallback
        if (document.title && document.title.length > 3) {
            return cleanDescription(document.title);
        }
        
        return null;
    }
    
    /**
     * Detect transaction data from page
     */
    function detectTransactionData() {
        const price = detectPrice();
        const description = detectDescription();
        
        return {
            amount: price,
            description: description || generateDefaultDescription(),
            url: window.location.href,
            pageTitle: document.title,
            detectedAt: new Date().toISOString()
        };
    }
    
    /**
     * Generate default description based on page
     */
    function generateDefaultDescription() {
        const hostname = window.location.hostname.replace('www.', '');
        const path = window.location.pathname;
        
        if (path.includes('product') || path.includes('item')) {
            return `Purchase from ${hostname}`;
        } else if (path.includes('cart') || path.includes('checkout')) {
            return `Cart checkout at ${hostname}`;
        } else if (path.includes('subscription')) {
            return `Subscription payment to ${hostname}`;
        }
        
        return `Transaction at ${hostname}`;
    }
    
    /**
     * Send data to desktop app via WebSocket/HTTP
     */
    async function sendToDesktopApp(data) {
        try {
            // Try WebSocket first (real-time)
            if (window.moneyManagerWS && window.moneyManagerWS.readyState === WebSocket.OPEN) {
                window.moneyManagerWS.send(JSON.stringify({
                    type: 'detected_transaction',
                    data: data,
                    tab: {
                        url: window.location.href,
                        title: document.title
                    }
                }));
                console.log('📤 Sent via WebSocket:', data);
                showNotification('Transaction detected!', 'Click to add to IntentFlow');
                return true;
            }
            
            // Fallback to HTTP (Firefox handles CORS differently)
            const response = await fetch(`http://${CONFIG.desktopAppHost}:${CONFIG.desktopAppPort}/api/detect-transaction`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
                mode: 'no-cors'
            });
            
            console.log('📤 Sent via HTTP:', data);
            return true;
        } catch (error) {
            console.log('⚠️ Desktop app not running, storing locally:', error.message);
            storeLocally(data);
            return false;
        }
    }
    
    /**
     * Store data locally when desktop app is offline
     */
    function storeLocally(data) {
        const stored = localStorage.getItem('moneyManager_offlineQueue');
        const queue = stored ? JSON.parse(stored) : [];
        queue.push({
            ...data,
            storedAt: new Date().toISOString()
        });
        // Keep last 100 items
        while (queue.length > 100) queue.shift();
        localStorage.setItem('moneyManager_offlineQueue', JSON.stringify(queue));
        console.log('💾 Stored offline (queue size:', queue.length, ')');
        
        // Show badge or notification (Firefox uses browser.runtime)
        if (typeof browser !== 'undefined' && browser.runtime) {
            browser.runtime.sendMessage({
                type: 'offlineStorage',
                count: queue.length
            });
        }
    }
    
    /**
     * Show floating notification
     */
    function showNotification(title, message) {
        // Remove existing notification
        const existing = document.querySelector('.money-manager-notification');
        if (existing) existing.remove();
        
        // Create notification
        const notification = document.createElement('div');
        notification.className = 'money-manager-notification';
        notification.innerHTML = `
            <div style="
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 10000;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 12px 20px;
                border-radius: 12px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                font-size: 14px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                cursor: pointer;
                transition: transform 0.2s;
                animation: slideIn 0.3s ease-out;
            ">
                <strong>💰 ${title}</strong><br>
                <small>${message}</small>
            </div>
        `;
        
        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            .money-manager-notification:hover > div {
                transform: scale(1.05);
            }
        `;
        document.head.appendChild(style);
        
        notification.addEventListener('click', () => {
            // Open popup or quick-add form
            if (typeof browser !== 'undefined' && browser.runtime) {
                browser.runtime.sendMessage({ type: 'openQuickAdd', data: detectedData });
            } else if (typeof chrome !== 'undefined' && chrome.runtime) {
                chrome.runtime.sendMessage({ type: 'openQuickAdd', data: detectedData });
            }
            notification.remove();
        });
        
        document.body.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification && notification.parentNode) {
                notification.remove();
            }
        }, 5000);
    }
    
    /**
     * Debounced detection (avoid too many triggers)
     */
    function debouncedDetect() {
        if (debounceTimer) clearTimeout(debounceTimer);
        
        debounceTimer = setTimeout(() => {
            const newData = detectTransactionData();
            
            // Only update if amount changed significantly
            if (Math.abs((newData.amount || 0) - (detectedData.amount || 0)) > 0.01) {
                detectedData = { ...detectedData, ...newData };
                console.log('🔄 Updated detection:', detectedData);
                
                // Auto-send if amount is detected
                if (detectedData.amount) {
                    sendToDesktopApp(detectedData);
                }
            }
        }, CONFIG.debounceDelay);
    }
    
    /**
     * Setup DOM mutation observer for dynamic content
     */
    function setupObserver() {
        if (observer) observer.disconnect();
        
        observer = new MutationObserver((mutations) => {
            let shouldCheck = false;
            
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    shouldCheck = true;
                    break;
                }
                if (mutation.type === 'characterData') {
                    shouldCheck = true;
                    break;
                }
            }
            
            if (shouldCheck) {
                debouncedDetect();
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }
    
    /**
     * Connect to desktop app WebSocket
     */
    function connectWebSocket() {
        try {
            const ws = new WebSocket(`ws://${CONFIG.desktopAppHost}:${CONFIG.desktopAppPort}`);
            
            ws.onopen = () => {
                console.log('🔌 Connected to IntentFlow desktop app');
                window.moneyManagerWS = ws;
                
                // Send any queued offline data
                const stored = localStorage.getItem('moneyManager_offlineQueue');
                if (stored) {
                    const queue = JSON.parse(stored);
                    if (queue.length > 0) {
                        console.log('📤 Sending', queue.length, 'queued items...');
                        queue.forEach(item => {
                            ws.send(JSON.stringify({
                                type: 'offline_transaction',
                                data: item
                            }));
                        });
                        localStorage.removeItem('moneyManager_offlineQueue');
                    }
                }
            };
            
            ws.onerror = (error) => {
                console.log('WebSocket error:', error);
                window.moneyManagerWS = null;
            };
            
            ws.onclose = () => {
                console.log('Disconnected from desktop app');
                window.moneyManagerWS = null;
                // Try to reconnect after 30 seconds
                setTimeout(connectWebSocket, 30000);
            };
        } catch (error) {
            console.log('WebSocket connection failed:', error);
        }
    }
    
    /**
     * Listen for messages from extension popup/background
     */
    function setupMessageListener() {
        window.addEventListener('message', (event) => {
            if (event.source !== window) return;
            
            if (event.data.type === 'REQUEST_DETECTION') {
                const data = detectTransactionData();
                window.postMessage({
                    type: 'DETECTION_RESULT',
                    data: data
                }, '*');
            }
            
            if (event.data.type === 'QUICK_ADD') {
                sendToDesktopApp({
                    ...detectedData,
                    ...event.data.transaction,
                    source: 'quick_add'
                });
            }
        });
        
        // Firefox-specific: Listen for extension messages
        if (typeof browser !== 'undefined' && browser.runtime) {
            browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
                if (message.type === 'getPageData') {
                    sendResponse({ data: detectTransactionData() });
                }
                if (message.type === 'quickAdd') {
                    sendToDesktopApp(message.transaction);
                    sendResponse({ success: true });
                }
                return true;
            });
        }
    }
    
    /**
     * Add context menu for selection
     */
    function setupContextMenu() {
        document.addEventListener('mouseup', (e) => {
            const selection = window.getSelection().toString().trim();
            if (selection && selection.length > 0) {
                const amount = extractAmount(selection);
                if (amount) {
                    detectedData.amount = amount;
                    detectedData.description = selection.substring(0, 100);
                    console.log('📋 Selected amount from text:', amount);
                    
                    // Show quick-add button near selection
                    showQuickAddButton(e.clientX, e.clientY, amount);
                }
            }
        });
    }
    
    /**
     * Show quick-add button near selected text
     */
    function showQuickAddButton(x, y, amount) {
        const existing = document.querySelector('.mm-quick-add-btn');
        if (existing) existing.remove();
        
        const btn = document.createElement('div');
        btn.className = 'mm-quick-add-btn';
        btn.innerHTML = '💰 Add to IntentFlow';
        btn.style.cssText = `
            position: fixed;
            left: ${x + 10}px;
            top: ${y + 10}px;
            z-index: 10001;
            background: #667eea;
            color: white;
            padding: 8px 16px;
            border-radius: 8px;
            font-size: 12px;
            font-family: monospace;
            cursor: pointer;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            transition: all 0.2s;
        `;
        
        btn.onmouseenter = () => {
            btn.style.transform = 'scale(1.05)';
            btn.style.background = '#764ba2';
        };
        
        btn.onmouseleave = () => {
            btn.style.transform = 'scale(1)';
            btn.style.background = '#667eea';
        };
        
        btn.onclick = () => {
            sendToDesktopApp({
                amount: amount,
                description: window.getSelection().toString().substring(0, 200),
                url: window.location.href,
                source: 'context_menu'
            });
            btn.remove();
        };
        
        document.body.appendChild(btn);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (btn && btn.parentNode) btn.remove();
        }, 5000);
    }
    
    /**
     * Initialize extension
     */
    function init() {
        console.log('🚀 Initializing IntentFlow content script (Firefox)...');
        
        // Initial detection
        setTimeout(() => {
            detectedData = detectTransactionData();
            console.log('Initial detection:', detectedData);
            
            if (detectedData.amount) {
                sendToDesktopApp(detectedData);
            }
        }, 1000);
        
        // Setup observers and listeners
        setupObserver();
        setupMessageListener();
        setupContextMenu();
        connectWebSocket();
        
        // Listen for page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                debouncedDetect();
            }
        });
        
        // Listen for clicks on price-like elements
        document.addEventListener('click', (e) => {
            const target = e.target.closest('[data-price], .price, .product-price');
            if (target) {
                const amount = extractAmount(target.textContent);
                if (amount) {
                    detectedData.amount = amount;
                    sendToDesktopApp(detectedData);
                }
            }
        });
        
        console.log('✅ IntentFlow content script (Firefox) ready');
    }
    
    // Start the extension when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
})();