// browser-extension/background.js

// Store connection to desktop app
let desktopPort = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// Try to connect to desktop app
function connectToDesktop() {
  try {
    // Try to connect to local desktop app
    desktopPort = chrome.runtime.connectNative('com.moneymanager.desktop');
    
    desktopPort.onMessage.addListener((message) => {
      console.log('Received from desktop:', message);
      handleDesktopMessage(message);
    });
    
    desktopPort.onDisconnect.addListener(() => {
      console.log('Disconnected from desktop');
      desktopPort = null;
      
      // Attempt to reconnect
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        setTimeout(connectToDesktop, 5000);
      }
    });
    
    reconnectAttempts = 0;
    updateIcon('connected');
    
  } catch (error) {
    console.log('Desktop app not running');
    updateIcon('disconnected');
  }
}

// Handle messages from desktop
function handleDesktopMessage(message) {
  switch (message.type) {
    case 'BUDGET_UPDATE':
      // Broadcast to popup if open
      chrome.runtime.sendMessage({ type: 'BUDGET_UPDATE', data: message.data });
      break;
      
    case 'TRANSACTION_ADDED':
      showNotification('Transaction Added', `$${message.data.amount} - ${message.data.payee}`);
      break;
      
    case 'LOW_BALANCE':
      showNotification('Low Balance Alert', message.data.message, 'warning');
      break;
  }
}

// Show notification
function showNotification(title, message, type = 'info') {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: title,
    message: message,
    priority: type === 'warning' ? 2 : 0
  });
}

// Update extension icon based on connection status
function updateIcon(status) {
  const iconPath = status === 'connected' 
    ? 'icons/icon128.png'
    : 'icons/icon128-disconnected.png';
  
  chrome.action.setIcon({ path: iconPath });
}

// Listen for tab updates to detect shopping sites
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    checkForShoppingSite(tabId, tab.url);
  }
});

// Check if current tab is a shopping site
function checkForShoppingSite(tabId, url) {
  const shoppingSites = [
    'amazon.com',
    'walmart.com',
    'target.com',
    'bestbuy.com',
    'ebay.com'
  ];
  
  const isShoppingSite = shoppingSites.some(site => url.includes(site));
  
  if (isShoppingSite) {
    // Enable page action or send message to content script
    chrome.tabs.sendMessage(tabId, { 
      type: 'SHOPPING_SITE_DETECTED',
      url: url
    });
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'GET_BUDGET_DATA':
      if (desktopPort) {
        desktopPort.postMessage({ type: 'GET_BUDGET_DATA' });
        sendResponse({ status: 'requested' });
      } else {
        sendResponse({ status: 'disconnected' });
      }
      break;
      
    case 'ADD_TRANSACTION':
      if (desktopPort) {
        desktopPort.postMessage({ 
          type: 'ADD_TRANSACTION', 
          data: message.data 
        });
        sendResponse({ status: 'sent' });
      } else {
        sendResponse({ status: 'disconnected' });
      }
      break;
      
    case 'CHECK_CONNECTION':
      sendResponse({ connected: !!desktopPort });
      break;
  }
  
  return true;
});

// Initialize connection
connectToDesktop();

// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('Money Manager extension installed');
  
  // Set default settings
  chrome.storage.sync.set({
    autoDetectPrices: true,
    showNotifications: true,
    defaultAccount: null
  });
});