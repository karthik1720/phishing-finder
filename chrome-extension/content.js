// Content script for page-level navigation detection
// This script runs in the context of web pages

(function() {
  'use strict';

  // Listen for navigation events
  let currentUrl = window.location.href;

  // Check URL when page loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkCurrentUrl);
  } else {
    checkCurrentUrl();
  }

  // Monitor URL changes (for SPAs)
  const observer = new MutationObserver(() => {
    const newUrl = window.location.href;
    if (newUrl !== currentUrl) {
      currentUrl = newUrl;
      checkCurrentUrl();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Also listen to popstate for browser navigation
  window.addEventListener('popstate', () => {
    const newUrl = window.location.href;
    if (newUrl !== currentUrl) {
      currentUrl = newUrl;
      checkCurrentUrl();
    }
  });

  function checkCurrentUrl() {
    const url = window.location.href;
    
    // Skip extension pages
    if (url.startsWith('chrome-extension://') || url.startsWith('chrome://')) {
      return;
    }

    // Send message to background script to check URL
    chrome.runtime.sendMessage(
      { action: 'checkUrl', url: url },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error communicating with background script:', chrome.runtime.lastError);
          return;
        }

        if (response && response.isPhishing) {
          // Show warning notification
          showWarning(response.reason || 'This site has been identified as a phishing site.');
        }
      }
    );
  }

  function showWarning(message) {
    // Create a warning banner at the top of the page
    const banner = document.createElement('div');
    banner.id = 'phishing-warning-banner';
    banner.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: #dc2626;
      color: white;
      padding: 12px 20px;
      text-align: center;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    `;
    banner.innerHTML = `
      <strong>⚠️ Phishing Warning:</strong> ${message}
      <button id="phishing-warning-close" style="
        margin-left: 12px;
        background: rgba(255,255,255,0.2);
        border: 1px solid rgba(255,255,255,0.3);
        color: white;
        padding: 4px 12px;
        border-radius: 4px;
        cursor: pointer;
      ">Dismiss</button>
    `;

    document.body.insertBefore(banner, document.body.firstChild);

    // Add close button handler
    const closeBtn = document.getElementById('phishing-warning-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        banner.remove();
      });
    }
  }
})();

