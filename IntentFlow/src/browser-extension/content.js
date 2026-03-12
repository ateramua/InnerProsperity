// browser-extension/content.js

// Detect prices on shopping sites
function detectPrice() {
  let price = null;
  const url = window.location.hostname;
  
  // Amazon
  if (url.includes('amazon')) {
    const priceElement = document.querySelector('.a-price-whole') || 
                        document.querySelector('.a-offscreen') ||
                        document.querySelector('#priceblock_dealprice');
    if (priceElement) {
      price = parseFloat(priceElement.textContent.replace(/[^0-9.]/g, ''));
    }
  }
  
  // Walmart
  else if (url.includes('walmart')) {
    const priceElement = document.querySelector('[data-automation-id="product-price"]') ||
                        document.querySelector('.price-group');
    if (priceElement) {
      price = parseFloat(priceElement.textContent.replace(/[^0-9.]/g, ''));
    }
  }
  
  // Target
  else if (url.includes('target')) {
    const priceElement = document.querySelector('[data-test="product-price"]') ||
                        document.querySelector('.h-text-xl');
    if (priceElement) {
      price = parseFloat(priceElement.textContent.replace(/[^0-9.]/g, ''));
    }
  }
  
  // Best Buy
  else if (url.includes('bestbuy')) {
    const priceElement = document.querySelector('.priceView-customer-price') ||
                        document.querySelector('.sr-only');
    if (priceElement) {
      price = parseFloat(priceElement.textContent.replace(/[^0-9.]/g, ''));
    }
  }
  
  return price;
}

// Detect product name
function detectProductName() {
  let name = null;
  const url = window.location.hostname;
  
  // Amazon
  if (url.includes('amazon')) {
    const nameElement = document.querySelector('#productTitle');
    if (nameElement) {
      name = nameElement.textContent.trim();
    }
  }
  
  // Walmart
  else if (url.includes('walmart')) {
    const nameElement = document.querySelector('[data-automation-id="product-title"]');
    if (nameElement) {
      name = nameElement.textContent.trim();
    }
  }
  
  // Target
  else if (url.includes('target')) {
    const nameElement = document.querySelector('[data-test="product-title"]');
    if (nameElement) {
      name = nameElement.textContent.trim();
    }
  }
  
  return name;
}

// Send detected data to extension
function sendDetectedData() {
  const price = detectPrice();
  const productName = detectProductName();
  
  if (price || productName) {
    chrome.runtime.sendMessage({
      type: 'PRODUCT_DETECTED',
      data: {
        price: price,
        name: productName,
        url: window.location.href,
        site: window.location.hostname
      }
    });
  }
}

// Add quick add button to page
function addQuickAddButton() {
  const button = document.createElement('div');
  button.id = 'money-manager-quick-add';
  button.innerHTML = '💰 Quick Add to Budget';
  button.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #3B82F6;
    color: white;
    padding: 12px 20px;
    border-radius: 30px;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 9999;
    transition: all 0.2s;
  `;
  
  button.addEventListener('mouseenter', () => {
    button.style.transform = 'scale(1.05)';
  });
  
  button.addEventListener('mouseleave', () => {
    button.style.transform = 'scale(1)';
  });
  
  button.addEventListener('click', () => {
    const price = detectPrice();
    const productName = detectProductName();
    
    chrome.runtime.sendMessage({
      type: 'OPEN_QUICK_ADD',
      data: {
        price: price,
        name: productName,
        url: window.location.href
      }
    });
  });
  
  document.body.appendChild(button);
}

// Initialize
function init() {
  sendDetectedData();
  
  // Only add button on product pages
  if (window.location.pathname.includes('/dp/') || 
      window.location.pathname.includes('/product/') ||
      window.location.pathname.includes('/ip/')) {
    addQuickAddButton();
  }
}

// Run when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SHOPPING_SITE_DETECTED') {
    sendDetectedData();
  }
});