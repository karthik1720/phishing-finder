// Script for blocked.html page

(function() {
  'use strict';

  // Get URL and reason from query parameters
  const params = new URLSearchParams(window.location.search);
  const targetUrl = params.get('url');
  const reason = params.get('reason') || 'This site has been identified as a phishing site.';

  // Display URL and reason
  if (targetUrl) {
    document.getElementById('urlDisplay').textContent = targetUrl;
  }
  document.getElementById('reasonText').textContent = decodeURIComponent(reason);

  // Scan again button - clears cache and triggers fresh AI check
  document.getElementById('scanAgainBtn').addEventListener('click', async () => {
    if (!targetUrl) return;
    
    // Get base domain for scanning
    function getBaseDomain(url) {
      try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase().replace(/^www\./, '');
        return `${urlObj.protocol}//${hostname}`;
      } catch {
        return url;
      }
    }
    
    const baseDomain = getBaseDomain(targetUrl);
    
    // Clear cache for this URL in background script
    chrome.runtime.sendMessage({
      action: 'clearCache',
      url: targetUrl
    }, () => {
      // Redirect to scanning page with forceRefresh flag to trigger fresh AI check
      const scanningUrl = chrome.runtime.getURL(
        `scanning.html?url=${encodeURIComponent(targetUrl)}&baseDomain=${encodeURIComponent(baseDomain)}&forceRefresh=true`
      );
      window.location.href = scanningUrl;
    });
  });

  // Go back button
  document.getElementById('goBackBtn').addEventListener('click', () => {
    window.history.back();
  });

  // Proceed anyway button (with warning)
  document.getElementById('proceedBtn').addEventListener('click', () => {
    if (confirm('Are you sure you want to proceed? This site has been flagged as a phishing site and may steal your personal information.')) {
      window.location.href = targetUrl;
    }
  });
})();

