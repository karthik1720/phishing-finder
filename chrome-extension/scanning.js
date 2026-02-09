// Script for scanning.html page

(async function() {
  'use strict';

  const DEFAULT_API_URL = 'http://localhost:3000/api/check-url';

  async function getApiUrl() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['apiUrl'], (result) => {
        resolve(result.apiUrl || DEFAULT_API_URL);
      });
    });
  }

  async function getAuthToken() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['authToken'], (result) => {
        resolve(result.authToken || null);
      });
    });
  }

  async function checkUrl(url, forceRefresh = false, checkOnly = false) {
    try {
      // Check if user is logged in (authentication required)
      const token = await getAuthToken();
      if (!token) {
        throw new Error('Authentication required. Please login to use the phishing detection service.');
      }

      const apiUrl = await getApiUrl();
      const requestBody = { url };
      if (checkOnly) {
        requestBody.checkOnly = true;
      }
      if (forceRefresh) {
        requestBody.forceRefresh = true;
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`, // Required
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        // Handle 401 (unauthorized)
        if (response.status === 401) {
          // Clear invalid token
          await chrome.storage.local.remove(['authToken', 'user']);
          throw new Error('Session expired. Please login again.');
        }
        throw new Error(`API returned ${response.status}`);
      }

      const data = await response.json();
      return {
        isPhishing: data.isPhishing || false,
        hasWarning: data.hasWarning || false,
        warningType: data.warningType || [],
        warningSeverity: data.warningSeverity,
        warningReason: data.warningReason,
        reason: data.reason,
        cached: data.cached || false,
        confidence: data.confidence,
      };
    } catch (error) {
      console.error('Error checking URL:', error);
      // Fail open - allow navigation if API fails
      return {
        isPhishing: false,
        cached: false,
        error: error.message,
      };
    }
  }

  // Get URL, baseDomain, and forceRefresh from query parameters
  const params = new URLSearchParams(window.location.search);
  const targetUrl = params.get('url');
  const baseDomain = params.get('baseDomain') || targetUrl;
  const forceRefresh = params.get('forceRefresh') === 'true';

  if (!targetUrl || !baseDomain) {
    console.error('[scanning] Missing URL or baseDomain parameters');
    document.querySelector('h1').textContent = 'Error';
    document.querySelector('.subtitle').textContent = 'Invalid URL parameters';
    setTimeout(() => {
      window.history.back();
    }, 2000);
    return;
  }

  if (document.getElementById('urlDisplay')) {
    document.getElementById('urlDisplay').textContent = targetUrl;
  }

  // Check base domain with backend API (not full URL)
  // Wait for check to complete before proceeding
  console.log('[scanning] Checking base domain:', baseDomain, 'for URL:', targetUrl, 'forceRefresh:', forceRefresh);
  
  // Add timeout to prevent infinite waiting (30 seconds)
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error('Scan timeout - taking too long'));
    }, 30000);
  });

  try {
    const result = await Promise.race([
      checkUrl(baseDomain, forceRefresh, false),
      timeoutPromise
    ]);
    
    // Cache the result in background script by base domain
    chrome.runtime.sendMessage({
      action: 'cacheResult',
      url: targetUrl,
      baseDomain: baseDomain,
      result: result
    });

    if (result.error && result.error.includes('Authentication')) {
      // Authentication error - show error and redirect to login
      document.querySelector('h1').textContent = 'Authentication Required';
      document.querySelector('.subtitle').textContent = result.error;
      document.querySelector('.loading-spinner').style.display = 'none';
      
      // Add a button to open extension popup for login
      const button = document.createElement('button');
      button.textContent = 'Open Extension to Login';
      button.style.cssText = 'margin-top: 20px; padding: 10px 20px; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer;';
      button.onclick = () => {
        chrome.runtime.openOptionsPage();
      };
      document.querySelector('.content').appendChild(button);
      return; // Don't redirect
    }

    if (result.isPhishing) {
      // BLOCKED - Redirect to blocked page (user cannot proceed)
      const blockedUrl = chrome.runtime.getURL(
        `blocked.html?url=${encodeURIComponent(targetUrl)}&reason=${encodeURIComponent(result.reason || 'Phishing site detected')}`
      );
      window.location.href = blockedUrl;
    } else if (result.hasWarning) {
      // Check if user wants to block warnings
      const blockWarnings = await new Promise((resolve) => {
        chrome.storage.sync.get(['blockWarnings'], (result) => {
          resolve(result.blockWarnings === true);
        });
      });
      
      if (blockWarnings) {
        // BLOCKED - Block warnings if setting is enabled (user cannot proceed)
        const warningUrl = chrome.runtime.getURL(
          `warning.html?url=${encodeURIComponent(targetUrl)}` +
          `&warningType=${encodeURIComponent(Array.isArray(result.warningType) ? result.warningType.join(',') : (result.warningType || ''))}` +
          `&warningSeverity=${encodeURIComponent(result.warningSeverity || 'medium')}` +
          `&reason=${encodeURIComponent(result.warningReason || result.reason || 'This site has been flagged for potential risks.')}` +
          `&blocked=true`
        );
        window.location.href = warningUrl;
      } else {
        // WARNING - Show warning page with proceed/go back options
        const warningUrl = chrome.runtime.getURL(
          `warning.html?url=${encodeURIComponent(targetUrl)}` +
          `&warningType=${encodeURIComponent(Array.isArray(result.warningType) ? result.warningType.join(',') : (result.warningType || ''))}` +
          `&warningSeverity=${encodeURIComponent(result.warningSeverity || 'medium')}` +
          `&reason=${encodeURIComponent(result.warningReason || result.reason || 'This site has been flagged for potential risks.')}` +
          `&blocked=false`
        );
        window.location.href = warningUrl;
      }
    } else {
      // SAFE - Redirect to original destination
      window.location.href = targetUrl;
    }
  } catch (error) {
    console.error('[scanning] Error checking URL:', error);
    // Fail open - allow navigation on error
    const h1 = document.querySelector('h1');
    const subtitle = document.querySelector('.subtitle');
    const spinner = document.querySelector('.loading-spinner');
    
    if (h1) h1.textContent = 'Error';
    if (subtitle) subtitle.textContent = error.message || 'Unable to verify website. Proceeding with caution...';
    if (spinner) spinner.style.display = 'none';
    
    // Redirect after short delay
    setTimeout(() => {
      if (targetUrl) {
        window.location.href = targetUrl;
      } else {
        window.history.back();
      }
    }, 2000);
  }
})();

