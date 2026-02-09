// Content script for displaying warning banner when warnings are detected but not blocked

(function() {
  'use strict';

  // Skip extension pages and chrome:// URLs
  if (window.location.href.startsWith('chrome-extension://') || 
      window.location.href.startsWith('chrome://') ||
      window.location.href.startsWith('moz-extension://')) {
    return;
  }

  // Skip our own scanning/blocked/warning pages
  if (window.location.href.includes('scanning.html') || 
      window.location.href.includes('blocked.html') ||
      window.location.href.includes('warning.html')) {
    return;
  }

  let warningBanner = null;

  // Type labels for display
  const typeLabels = {
    'piracy': '📥 Piracy',
    'scamming': '💸 Scamming',
    'risky_links': '🔗 Risky Links',
    'scam_products': '🛒 Scam Products',
    'risky_files': '📦 Risky Files'
  };

  const severityLabels = {
    'low': 'Low Risk',
    'medium': 'Medium Risk',
    'high': 'High Risk'
  };

  // Listen for warning messages from background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'showWarning') {
      showWarningBanner(request.warningType, request.warningSeverity, request.warningReason);
      sendResponse({ success: true });
    }
    return true; // Keep channel open for async response
  });

  function showWarningBanner(warningType, warningSeverity, warningReason) {
    // Remove existing banner if present
    if (warningBanner) {
      removeWarningBanner();
    }

    // Create banner
    warningBanner = document.createElement('div');
    warningBanner.id = 'phishing-finder-warning-banner';
    
    const types = Array.isArray(warningType) ? warningType : (warningType ? [warningType] : []);
    const typeList = types.map(t => typeLabels[t.trim()] || t.trim()).join(', ');
    const severity = severityLabels[warningSeverity] || warningSeverity || 'Medium Risk';
    
    warningBanner.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 20px;">⚠️</span>
          <strong style="font-size: 14px;">Website Warning</strong>
        </div>
        <div style="font-size: 13px; color: #78350f;">
          ${typeList ? `<span>${typeList}</span>` : ''}
          ${severity ? `<span style="margin-left: 8px; padding: 2px 8px; background: #fef3c7; border-radius: 4px; font-size: 11px;">${severity}</span>` : ''}
        </div>
        ${warningReason ? `<div style="font-size: 12px; color: #92400e; margin-top: 4px; flex-basis: 100%;">${warningReason}</div>` : ''}
        <button id="phishing-finder-warning-dismiss" style="margin-left: auto; background: transparent; border: 1px solid #fde68a; color: #92400e; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">Dismiss</button>
      </div>
    `;
    
    warningBanner.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: #fffbeb;
      border-bottom: 2px solid #fde68a;
      padding: 12px 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      z-index: 999999;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      color: #92400e;
    `;

    // Dismiss button handler
    const dismissBtn = warningBanner.querySelector('#phishing-finder-warning-dismiss');
    dismissBtn.addEventListener('click', () => {
      removeWarningBanner();
    });

    // Inject into page
    document.body.insertBefore(warningBanner, document.body.firstChild);
    
    // Add padding to body to prevent content from being hidden
    document.body.style.paddingTop = `${warningBanner.offsetHeight}px`;
  }

  function removeWarningBanner() {
    if (warningBanner && warningBanner.parentNode) {
      warningBanner.parentNode.removeChild(warningBanner);
      warningBanner = null;
      // Remove padding from body
      document.body.style.paddingTop = '';
    }
  }

  // Check if we should show a warning on page load
  // This handles cases where the page was already loaded when warning was detected
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      // Request warning info from background script
      chrome.runtime.sendMessage({ action: 'getWarningForTab' }, (response) => {
        if (response && response.warning) {
          showWarningBanner(
            response.warning.warningType,
            response.warning.warningSeverity,
            response.warning.warningReason
          );
        }
      });
    });
  } else {
    // Page already loaded, check immediately
    chrome.runtime.sendMessage({ action: 'getWarningForTab' }, (response) => {
      if (response && response.warning) {
        showWarningBanner(
          response.warning.warningType,
          response.warning.warningSeverity,
          response.warning.warningReason
        );
      }
    });
  }
})();



