// Background service worker for phishing detection

// API client functions
const DEFAULT_API_URL = 'http://localhost:3000/api/check-url';

async function getApiUrl() {
  const result = await chrome.storage.sync.get(['apiUrl']);
  return result.apiUrl || DEFAULT_API_URL;
}

async function getAuthToken() {
  const result = await chrome.storage.local.get(['authToken']);
  return result.authToken || null;
}

async function checkUrl(url) {
  try {
    // Check if user is logged in (authentication required)
    const token = await getAuthToken();
    
    if (!token) {
      // User not logged in - fail open (allow navigation)
      console.log('[background] User not logged in, skipping URL check');
      return {
        isPhishing: false,
        cached: false,
        error: 'Authentication required',
      };
    }

    const apiUrl = await getApiUrl();
    
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`, // Required
    };
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      // Handle 401 (unauthorized) - token expired or invalid
      if (response.status === 401) {
        // Clear invalid token
        await chrome.storage.local.remove(['authToken', 'user']);
        console.log('[background] Authentication failed, cleared token');
      }
      // Fail open - allow navigation if API fails
      return {
        isPhishing: false,
        cached: false,
        error: `API returned ${response.status}`,
      };
    }

    const data = await response.json();
    return {
      isPhishing: data.isPhishing || false,
      reason: data.reason,
      cached: data.cached || false,
      confidence: data.confidence,
      hasWarning: data.hasWarning || false,
      warningType: data.warningType,
      warningSeverity: data.warningSeverity,
      warningReason: data.warningReason,
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

// Cache for in-memory URL checks (per session)
const urlCache = new Map();

// Set of URLs currently being checked
const pendingChecks = new Set();

// Map to store warning info per tab (for content script banner)
const tabWarnings = new Map();

/**
 * Extracts the base domain from a URL (e.g., chatgpt.com from https://chatgpt.com/c/123)
 */
function getBaseDomain(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    // Remove 'www.' prefix if present
    const domain = hostname.replace(/^www\./, '');
    
    // Return protocol + domain (no path, no query params)
    return `${urlObj.protocol}//${domain}`;
  } catch {
    // Fallback: try to extract domain from string
    const match = url.match(/https?:\/\/([^\/]+)/i);
    if (match) {
      const hostname = match[1].toLowerCase().replace(/^www\./, '');
      const protocol = url.startsWith('https') ? 'https://' : 'http://';
      return `${protocol}${hostname}`;
    }
    return url;
  }
}

/**
 * Normalizes a URL for consistent checking
 */
function normalizeUrl(url) {
  try {
    const urlObj = new URL(url);
    urlObj.pathname = urlObj.pathname.replace(/\/$/, '');
    urlObj.hostname = urlObj.hostname.toLowerCase();
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'fbclid', 'gclid'];
    trackingParams.forEach(param => urlObj.searchParams.delete(param));
    return urlObj.toString();
  } catch {
    return url.toLowerCase().replace(/\/$/, '');
  }
}

/**
 * Gets the extension URL for a resource
 */
function getExtensionUrl(path) {
  return chrome.runtime.getURL(path);
}

/**
 * Checks if a URL should be blocked
 */
async function shouldBlockUrl(url) {
  const normalizedUrl = normalizeUrl(url);

  // Check in-memory cache first
  if (urlCache.has(normalizedUrl)) {
    return urlCache.get(normalizedUrl);
  }

  // Skip if already checking
  if (pendingChecks.has(normalizedUrl)) {
    return null; // Still checking
  }

  // Mark as pending
  pendingChecks.add(normalizedUrl);

  try {
    const result = await checkUrl(normalizedUrl);
    
    // Cache the result
    urlCache.set(normalizedUrl, result);
    
    return result;
  } catch (error) {
    console.error('Error in shouldBlockUrl:', error);
    // Fail open
    return { isPhishing: false };
  } finally {
    pendingChecks.delete(normalizedUrl);
  }
}

// Track tabs that are being processed to avoid infinite redirects
const processingTabs = new Set();
// Track redirects to prevent loops
const redirectedTabs = new Map();

/**
 * Get auto-scan setting from storage
 */
async function getAutoScanSetting() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['autoScan'], (result) => {
      // Default to true if not set
      resolve(result.autoScan !== false);
    });
  });
}

/**
 * Gets the blockWarnings setting from storage
 */
async function getBlockWarningsSetting() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['blockWarnings'], (result) => {
      // Default to false if not set
      resolve(result.blockWarnings === true);
    });
  });
}

/**
 * Intercepts navigation using tabs API (Manifest V3 compatible)
 */
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only process when URL changes and page starts loading
  if (changeInfo.status !== 'loading' || !tab.url) {
    return;
  }

  // Check if user is logged in (authentication required)
  const token = await getAuthToken();
  if (!token) {
    console.log('[background] User not logged in, skipping URL check');
    return; // Fail open - allow navigation if not logged in
  }

  // Check if auto-scan is enabled
  const autoScan = await getAutoScanSetting();
  if (!autoScan) {
    console.log('[background] Auto-scan is disabled, skipping automatic check');
    return;
  }

  const url = tab.url;

  // Skip extension pages and chrome:// URLs
  if (url.startsWith('chrome-extension://') || url.startsWith('chrome://') || url.startsWith('moz-extension://')) {
    return;
  }

  // Skip our own scanning/blocked/warning pages
  if (url.includes('scanning.html') || url.includes('blocked.html') || url.includes('warning.html')) {
    // Clear redirect tracking when user reaches scanning/blocked/warning page
    redirectedTabs.delete(tabId);
    return;
  }

  // Skip if already processing this tab
  if (processingTabs.has(tabId)) {
    return;
  }

  // Skip if we just redirected this tab (prevent loops)
  if (redirectedTabs.has(tabId) && redirectedTabs.get(tabId) === url) {
    return;
  }

  // Get base domain for checking (e.g., https://chatgpt.com)
  const baseDomain = getBaseDomain(url);
  console.log('[background] Checking base domain:', baseDomain, 'for URL:', url);

  // Check in-memory cache first (by base domain)
  if (urlCache.has(baseDomain)) {
    const cachedResult = urlCache.get(baseDomain);
    if (cachedResult && cachedResult.isPhishing) {
      // Block immediately if cached as phishing
      processingTabs.add(tabId);
      redirectedTabs.set(tabId, url);
      const blockedUrl = getExtensionUrl(`blocked.html?url=${encodeURIComponent(url)}&reason=${encodeURIComponent(cachedResult.reason || 'Phishing site detected')}`);
      try {
        await chrome.tabs.update(tabId, { url: blockedUrl });
      } catch (error) {
        console.error('Error redirecting to blocked page:', error);
      }
      processingTabs.delete(tabId);
      return;
    }
    
    // Check for warnings if not phishing
    if (cachedResult && cachedResult.hasWarning) {
      const blockWarnings = await getBlockWarningsSetting();
      if (blockWarnings) {
        // Block warnings if user setting is enabled
        processingTabs.add(tabId);
        redirectedTabs.set(tabId, url);
        const warningUrl = getExtensionUrl(
          `warning.html?url=${encodeURIComponent(url)}` +
          `&warningType=${encodeURIComponent(cachedResult.warningType ? cachedResult.warningType.join(',') : '')}` +
          `&warningSeverity=${encodeURIComponent(cachedResult.warningSeverity || 'medium')}` +
          `&reason=${encodeURIComponent(cachedResult.warningReason || cachedResult.reason || 'This site has been flagged for potential risks.')}` +
          `&blocked=true`
        );
        try {
          await chrome.tabs.update(tabId, { url: warningUrl });
        } catch (error) {
          console.error('Error redirecting to warning page:', error);
        }
        processingTabs.delete(tabId);
        return;
      } else {
        // Allow navigation but store warning info for banner
        // Store warning info for content script
        const warningInfo = {
          warningType: cachedResult.warningType || [],
          warningSeverity: cachedResult.warningSeverity,
          warningReason: cachedResult.warningReason || cachedResult.reason
        };
        tabWarnings.set(tabId, warningInfo);
        
        chrome.tabs.sendMessage(tabId, {
          action: 'showWarning',
          warningType: warningInfo.warningType,
          warningSeverity: warningInfo.warningSeverity,
          warningReason: warningInfo.warningReason
        }).catch(() => {
          // Content script might not be ready yet, that's okay
        });
        redirectedTabs.delete(tabId);
        return;
      }
    }
    
    // Safe domain in cache, allow navigation
    redirectedTabs.delete(tabId);
    return;
  }

  // Not in memory cache - check DB cache via API before redirecting to scanning page
  console.log('[background] Not in memory cache, checking DB cache...');
  try {
    // Get auth token (required)
    const token = await getAuthToken();
    if (!token) {
      console.log('[background] User not logged in, skipping DB cache check');
      // Fail open - allow navigation if not logged in
      redirectedTabs.delete(tabId);
      return;
    }

    const apiUrl = await getApiUrl();
    const dbCheckResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`, // Required
      },
      body: JSON.stringify({ url: baseDomain, checkOnly: true }),
    });

    if (dbCheckResponse.ok) {
      const dbResult = await dbCheckResponse.json();
      
      if (dbResult.notFound) {
        // Not in DB cache, redirect to scanning page to trigger AI check
        console.log('[background] Not in DB cache, redirecting to scanning page');
        processingTabs.add(tabId);
        redirectedTabs.set(tabId, url);
        const scanningUrl = getExtensionUrl(`scanning.html?url=${encodeURIComponent(url)}&baseDomain=${encodeURIComponent(baseDomain)}`);
        try {
          await chrome.tabs.update(tabId, { url: scanningUrl });
        } catch (error) {
          console.error('Error redirecting to scanning page:', error);
        }
        processingTabs.delete(tabId);
        return;
      }

      // Found in DB cache, use it immediately
      if (dbResult.cached && dbResult.isPhishing !== undefined) {
        console.log('[background] Found in DB cache:', { 
          isPhishing: dbResult.isPhishing, 
          hasWarning: dbResult.hasWarning,
          cached: true 
        });
        
        // Cache in memory for future use
        urlCache.set(baseDomain, dbResult);
        
        if (dbResult.isPhishing) {
          // Block if phishing
          processingTabs.add(tabId);
          redirectedTabs.set(tabId, url);
          const blockedUrl = getExtensionUrl(`blocked.html?url=${encodeURIComponent(url)}&reason=${encodeURIComponent(dbResult.reason || 'Phishing site detected')}`);
          try {
            await chrome.tabs.update(tabId, { url: blockedUrl });
          } catch (error) {
            console.error('Error redirecting to blocked page:', error);
          }
          processingTabs.delete(tabId);
          return;
        } else if (dbResult.hasWarning) {
          // Check warning handling
          const blockWarnings = await getBlockWarningsSetting();
          if (blockWarnings) {
            // Block warnings if user setting is enabled
            processingTabs.add(tabId);
            redirectedTabs.set(tabId, url);
            const warningUrl = getExtensionUrl(
              `warning.html?url=${encodeURIComponent(url)}` +
              `&warningType=${encodeURIComponent(Array.isArray(dbResult.warningType) ? dbResult.warningType.join(',') : (dbResult.warningType || ''))}` +
              `&warningSeverity=${encodeURIComponent(dbResult.warningSeverity || 'medium')}` +
              `&reason=${encodeURIComponent(dbResult.warningReason || dbResult.reason || 'This site has been flagged for potential risks.')}` +
              `&blocked=true`
            );
            try {
              await chrome.tabs.update(tabId, { url: warningUrl });
            } catch (error) {
              console.error('Error redirecting to warning page:', error);
            }
            processingTabs.delete(tabId);
            return;
          } else {
            // Allow navigation but show warning banner
            // Store warning info for content script
            const warningInfo = {
              warningType: Array.isArray(dbResult.warningType) ? dbResult.warningType : (dbResult.warningType ? [dbResult.warningType] : []),
              warningSeverity: dbResult.warningSeverity,
              warningReason: dbResult.warningReason || dbResult.reason
            };
            tabWarnings.set(tabId, warningInfo);
            
            chrome.tabs.sendMessage(tabId, {
              action: 'showWarning',
              warningType: warningInfo.warningType,
              warningSeverity: warningInfo.warningSeverity,
              warningReason: warningInfo.warningReason
            }).catch(() => {
              // Content script might not be ready yet, that's okay
            });
            redirectedTabs.delete(tabId);
            return;
          }
        } else {
          // Safe, allow navigation
          redirectedTabs.delete(tabId);
          return;
        }
      }
    }
  } catch (error) {
    console.error('[background] Error checking DB cache:', error);
    // On error, fall through to scanning page
  }

  // Fallback: redirect to scanning page if DB check failed or returned unexpected result
  console.log('[background] Redirecting to scanning page (fallback)');
  processingTabs.add(tabId);
  redirectedTabs.set(tabId, url);
  const scanningUrl = getExtensionUrl(`scanning.html?url=${encodeURIComponent(url)}&baseDomain=${encodeURIComponent(baseDomain)}`);
  try {
    await chrome.tabs.update(tabId, { url: scanningUrl });
  } catch (error) {
    console.error('Error redirecting to scanning page:', error);
  }
  processingTabs.delete(tabId);
});

/**
 * Clean up tracking when tabs are closed
 */
chrome.tabs.onRemoved.addListener((tabId) => {
  processingTabs.delete(tabId);
  redirectedTabs.delete(tabId);
});

/**
 * Handles messages from content scripts or popup
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkUrl') {
    shouldBlockUrl(request.url).then(result => {
      sendResponse(result);
    });
    return true; // Keep channel open for async response
  }

  if (request.action === 'getApiUrl') {
    chrome.storage.sync.get(['apiUrl'], (result) => {
      sendResponse({ apiUrl: result.apiUrl || 'http://localhost:3000/api/check-url' });
    });
    return true;
  }

  if (request.action === 'setApiUrl') {
    chrome.storage.sync.set({ apiUrl: request.apiUrl }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (request.action === 'cacheResult') {
    // Cache by base domain instead of full URL
    const baseDomain = request.baseDomain || getBaseDomain(request.url);
    urlCache.set(baseDomain, request.result);
    console.log('[background] Cached result for base domain:', baseDomain);
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'clearCache') {
    // Clear cache for a specific URL or base domain
    if (request.url) {
      const baseDomain = getBaseDomain(request.url);
      urlCache.delete(baseDomain);
      console.log('[background] Cleared cache for base domain:', baseDomain);
      sendResponse({ success: true, clearedDomain: baseDomain });
    } else {
      // Clear all cache
      urlCache.clear();
      console.log('[background] Cleared all cache');
      sendResponse({ success: true });
    }
    return true;
  }

  if (request.action === 'settingsUpdated') {
    // Settings were updated, log it
    console.log('[background] Settings updated, autoScan:', request.autoScan);
    
    // Notify all tabs about the settings change
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          action: 'settingsUpdated',
          autoScan: request.autoScan
        }).catch(() => {
          // Ignore errors (e.g., extension pages, chrome:// pages)
        });
      });
    });
    
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'getAutoScan') {
    getAutoScanSetting().then(autoScan => {
      sendResponse({ autoScan });
    });
    return true;
  }

  if (request.action === 'setWarningForTab') {
    if (request.tabId && request.warning) {
      tabWarnings.set(request.tabId, request.warning);
    }
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'getWarningForTab') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        const tabId = tabs[0].id;
        const warning = tabWarnings.get(tabId);
        sendResponse({ warning: warning || null });
      } else {
        sendResponse({ warning: null });
      }
    });
    return true;
  }
});

// Clear cache on extension startup
chrome.runtime.onStartup.addListener(() => {
  urlCache.clear();
  pendingChecks.clear();
  tabWarnings.clear();
});

// Also clear cache when extension is installed/updated
chrome.runtime.onInstalled.addListener(() => {
  urlCache.clear();
  pendingChecks.clear();
  tabWarnings.clear();
});

// Clean up tab warnings when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  tabWarnings.delete(tabId);
});

