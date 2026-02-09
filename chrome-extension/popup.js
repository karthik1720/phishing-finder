// Script for popup.html

(function() {
  'use strict';

  const statusDiv = document.getElementById('statusDiv');
  const currentUrlDiv = document.getElementById('currentUrl');
  const scanCurrentBtn = document.getElementById('scanCurrentBtn');
  const openSettingsBtn = document.getElementById('openSettingsBtn');
  const scanResultDiv = document.getElementById('scanResult');
  const resultHeader = document.getElementById('resultHeader');
  const resultDetails = document.getElementById('resultDetails');

  // Auth elements
  const authSection = document.getElementById('authSection');
  const authTabs = document.querySelectorAll('.auth-tab');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const loggedInView = document.getElementById('loggedInView');
  const loginEmail = document.getElementById('loginEmail');
  const loginPassword = document.getElementById('loginPassword');
  const registerEmail = document.getElementById('registerEmail');
  const registerPassword = document.getElementById('registerPassword');
  const loginBtn = document.getElementById('loginBtn');
  const registerBtn = document.getElementById('registerBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const loginError = document.getElementById('loginError');
  const registerError = document.getElementById('registerError');
  const userEmail = document.getElementById('userEmail');

  const DEFAULT_API_URL = 'http://localhost:3000/api/check-url';

  // Check auth state on load
  async function checkAuthState() {
    // Wait for auth.js to load
    if (typeof isAuthenticated === 'undefined' && typeof window.authAPI === 'undefined') {
      setTimeout(checkAuthState, 100);
      return;
    }
    
    const auth = typeof window !== 'undefined' && window.authAPI ? window.authAPI : { isAuthenticated, getUserInfo };
    const isAuth = await auth.isAuthenticated();
    if (isAuth) {
      const user = await auth.getUserInfo();
      if (user) {
        showLoggedInView(user.email);
      } else {
        showAuthForms();
      }
    } else {
      showAuthForms();
    }
  }

  const notLoggedInView = document.getElementById('notLoggedInView');

  function showLoggedInView(email) {
    notLoggedInView.classList.add('hidden');
    loggedInView.classList.remove('hidden');
    authSection.classList.add('logged-in');
    userEmail.textContent = email;
  }

  function showAuthForms() {
    notLoggedInView.classList.remove('hidden');
    loggedInView.classList.add('hidden');
    authSection.classList.remove('logged-in');
    // Reset to login tab
    loginForm.classList.add('active');
    registerForm.classList.remove('active');
    authTabs.forEach(tab => {
      if (tab.dataset.tab === 'login') {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });
  }

  // Tab switching
  authTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      authTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      if (tabName === 'login') {
        loginForm.classList.add('active');
        registerForm.classList.remove('active');
      } else {
        loginForm.classList.remove('active');
        registerForm.classList.add('active');
      }
    });
  });

  // Login handler
  loginBtn.addEventListener('click', async () => {
    const email = loginEmail.value.trim();
    const password = loginPassword.value;
    
    loginError.classList.add('hidden');
    
    if (!email || !password) {
      loginError.textContent = 'Please enter email and password';
      loginError.classList.remove('hidden');
      return;
    }

    try {
      loginBtn.disabled = true;
      loginBtn.textContent = 'Logging in...';
      const auth = typeof window !== 'undefined' && window.authAPI ? window.authAPI : { login, getUserInfo };
      await auth.login(email, password);
      const user = await auth.getUserInfo();
      showLoggedInView(user.email);
      loginEmail.value = '';
      loginPassword.value = '';
    } catch (error) {
      loginError.textContent = error.message || 'Login failed';
      loginError.classList.remove('hidden');
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = 'Login';
    }
  });

  // Register handler
  registerBtn.addEventListener('click', async () => {
    const email = registerEmail.value.trim();
    const password = registerPassword.value;
    
    registerError.classList.add('hidden');
    
    if (!email || !password) {
      registerError.textContent = 'Please enter email and password';
      registerError.classList.remove('hidden');
      return;
    }

    if (password.length < 8) {
      registerError.textContent = 'Password must be at least 8 characters';
      registerError.classList.remove('hidden');
      return;
    }

    try {
      registerBtn.disabled = true;
      registerBtn.textContent = 'Registering...';
      const auth = typeof window !== 'undefined' && window.authAPI ? window.authAPI : { register, getUserInfo };
      await auth.register(email, password);
      const user = await auth.getUserInfo();
      showLoggedInView(user.email);
      registerEmail.value = '';
      registerPassword.value = '';
    } catch (error) {
      registerError.textContent = error.message || 'Registration failed';
      registerError.classList.remove('hidden');
    } finally {
      registerBtn.disabled = false;
      registerBtn.textContent = 'Register';
    }
  });

  // Logout handler
  logoutBtn.addEventListener('click', async () => {
    const auth = typeof window !== 'undefined' && window.authAPI ? window.authAPI : { logout };
    await auth.logout();
    showAuthForms();
  });

  // Initialize auth state
  checkAuthState();

  // Load auto-scan setting
  chrome.runtime.sendMessage({ action: 'getAutoScan' }, (response) => {
    if (response && response.autoScan) {
      statusDiv.textContent = 'Auto-scan: ON';
      statusDiv.className = 'status active';
    } else {
      statusDiv.textContent = 'Auto-scan: OFF';
      statusDiv.className = 'status inactive';
    }
  });

  // Open settings button
  openSettingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Function to get base domain
  function getBaseDomain(url) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase().replace(/^www\./, '');
      return `${urlObj.protocol}//${hostname}`;
    } catch {
      return url;
    }
  }

  // Function to check URL and display result
  async function checkAndDisplayResult(url, useCheckOnly = false) {
    const baseDomain = getBaseDomain(url);
    
    // Show loading state
    scanResultDiv.className = 'scan-result loading show';
    resultHeader.innerHTML = '⏳ Checking...';
    resultDetails.textContent = useCheckOnly 
      ? 'Checking for cached scan results...'
      : 'Scanning website for phishing indicators...';

    // If checkOnly mode, skip background script cache (which might trigger scan)
    // and go directly to API with checkOnly=true
    if (useCheckOnly) {
      // Only check cache, no AI scan
      await checkViaAPI(baseDomain, true);
      return;
    }

    // For auto-scan ON mode, check background script cache first
    try {
      // Try to check via background script cache first
      chrome.runtime.sendMessage({ action: 'checkUrl', url: baseDomain }, async (cachedResult) => {
        if (chrome.runtime.lastError) {
          // No cached result in memory, check DB cache or call API
          await checkViaAPI(baseDomain, false);
          return;
        }
        
        if (cachedResult && cachedResult.isPhishing !== undefined) {
          // Found in memory cache
          displayResult(cachedResult, true);
        } else {
          // Not in memory cache, call API (will trigger AI if not cached)
          await checkViaAPI(baseDomain, false);
        }
      });
    } catch (error) {
      console.error('Error checking URL:', error);
      // Fallback to API
      await checkViaAPI(baseDomain, false);
    }
  }

  // Function to check via API
  async function checkViaAPI(url, checkOnly = false, forceRefresh = false) {
    try {
      // Check if user is logged in
      const auth = typeof window !== 'undefined' && window.authAPI ? window.authAPI : { isAuthenticated, getToken };
      const isAuth = await auth.isAuthenticated();
      
      if (!isAuth) {
        scanResultDiv.className = 'scan-result show';
        resultHeader.innerHTML = '🔒 Login Required';
        resultDetails.textContent = 'Please login to use the phishing detection service. Use the login form above.';
        return null;
      }

      const apiUrl = await new Promise((resolve) => {
        chrome.storage.sync.get(['apiUrl'], (result) => {
          resolve(result.apiUrl || DEFAULT_API_URL);
        });
      });

      // Get auth token (required)
      const authToken = await new Promise((resolve) => {
        chrome.storage.local.get(['authToken'], (result) => {
          resolve(result.authToken || null);
        });
      });

      if (!authToken) {
        scanResultDiv.className = 'scan-result show';
        resultHeader.innerHTML = '🔒 Login Required';
        resultDetails.textContent = 'Please login to use the phishing detection service. Use the login form above.';
        return null;
      }

      const requestBody = { url };
      if (checkOnly) {
        requestBody.checkOnly = true;
      }
      if (forceRefresh) {
        requestBody.forceRefresh = true;
      }

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`, // Required
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        // Handle 401 (unauthorized) - token expired or invalid
        if (response.status === 401) {
          // Clear invalid token
          await chrome.storage.local.remove(['authToken', 'user']);
          // Refresh auth state in popup
          if (typeof window !== 'undefined' && window.authAPI) {
            showAuthForms();
          }
          scanResultDiv.className = 'scan-result show';
          resultHeader.innerHTML = '🔒 Session Expired';
          resultDetails.textContent = 'Your session has expired. Please login again.';
          return null;
        }
        throw new Error(`API returned ${response.status}`);
      }

      const data = await response.json();
      
      // Handle notFound response from checkOnly mode
      if (data.notFound) {
        scanResultDiv.className = 'scan-result show';
        resultHeader.innerHTML = 'ℹ️ No Scan Result';
        resultDetails.textContent = 'This website has not been scanned yet. Click "Scan Current Page" to perform a scan.';
        return null;
      }
      
      displayResult(data, data.cached || false);
      return data; // Return result for caching
    } catch (error) {
      console.error('Error calling API:', error);
      scanResultDiv.className = 'scan-result show';
      resultHeader.innerHTML = '❌ Error';
      resultDetails.textContent = 'Unable to check URL. Please try again.';
      return null;
    }
  }

  // Function to display scan result
  function displayResult(result, cached) {
    scanResultDiv.classList.add('show');
    
    if (result.isPhishing) {
      scanResultDiv.className = 'scan-result phishing show';
      resultHeader.innerHTML = '⚠️ Phishing Detected';
      let details = 'This website has been identified as a potential phishing site.';
      if (result.reason) {
        details += `\n\nReason: ${result.reason}`;
      }
      if (result.confidence !== undefined) {
        details += `\n\nConfidence: ${(result.confidence * 100).toFixed(0)}%`;
      }
      if (cached) {
        details += '\n\n(Cached result)';
      }
      resultDetails.textContent = details;
    } else if (result.hasWarning) {
      scanResultDiv.className = 'scan-result warning show';
      resultHeader.innerHTML = '⚠️ Website Warning';
      
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
      
      let details = 'This website has been flagged for potential risks.';
      
      if (result.warningType && result.warningType.length > 0) {
        const types = Array.isArray(result.warningType) ? result.warningType : [result.warningType];
        const typeList = types.map(t => typeLabels[t.trim()] || t.trim()).join(', ');
        details += `\n\nWarning Types: ${typeList}`;
      }
      
      if (result.warningSeverity) {
        details += `\n\nSeverity: ${severityLabels[result.warningSeverity] || result.warningSeverity}`;
      }
      
      if (result.warningReason || result.reason) {
        details += `\n\nDetails: ${result.warningReason || result.reason}`;
      }
      
      if (result.confidence !== undefined) {
        details += `\n\nConfidence: ${(result.confidence * 100).toFixed(0)}%`;
      }
      
      if (cached) {
        details += '\n\n(Cached result)';
      }
      
      resultDetails.textContent = details;
    } else {
      scanResultDiv.className = 'scan-result safe show';
      resultHeader.innerHTML = '✅ Safe Website';
      let details = 'This website appears to be legitimate and safe.';
      if (result.reason) {
        details += `\n\n${result.reason}`;
      }
      if (result.confidence !== undefined) {
        details += `\n\nConfidence: ${(result.confidence * 100).toFixed(0)}%`;
      }
      if (cached) {
        details += '\n\n(Cached result)';
      }
      resultDetails.textContent = details;
    }
  }

  // Get current active tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0) {
      currentUrlDiv.textContent = 'No active tab found';
      scanCurrentBtn.disabled = true;
      return;
    }

    const currentTab = tabs[0];
    const currentUrl = currentTab.url;

    // Skip extension pages and chrome:// URLs
    if (currentUrl.startsWith('chrome-extension://') || 
        currentUrl.startsWith('chrome://') || 
        currentUrl.startsWith('moz-extension://')) {
      currentUrlDiv.textContent = 'Cannot scan extension pages';
      scanCurrentBtn.disabled = true;
      return;
    }

    // Display current URL
    currentUrlDiv.textContent = currentUrl;

    // Automatically check the page when popup opens
    // Check auto-scan setting to determine how to load results
    chrome.runtime.sendMessage({ action: 'getAutoScan' }, (response) => {
      const autoScan = response && response.autoScan !== false; // Default to true
      
      if (autoScan) {
        // Auto-scan enabled: check normally (will call AI if not cached)
        checkAndDisplayResult(currentUrl, false);
      } else {
        // Auto-scan disabled: use checkOnly to load cached results only (NO AI scan)
        // If no cached result, show message prompting user to click scan button
        checkAndDisplayResult(currentUrl, true).then((result) => {
          // If no result found and auto-scan is off, the checkAndDisplayResult
          // will already show "No Scan Result" message, so user can click scan button
        });
      }
    });

    // Scan current page button - ALWAYS triggers fresh AI scan (regardless of auto-scan setting)
    scanCurrentBtn.addEventListener('click', () => {
      const baseDomain = getBaseDomain(currentUrl);
      
      // Clear cache for this URL
      chrome.runtime.sendMessage({
        action: 'clearCache',
        url: currentUrl
      }, () => {
        // Show loading state
        scanResultDiv.className = 'scan-result loading show';
        resultHeader.innerHTML = '⏳ Scanning...';
        resultDetails.textContent = 'Performing fresh AI analysis...';
        
        // Trigger fresh scan via API with forceRefresh
        checkViaAPI(baseDomain, false, true).then((result) => {
          // Cache the new result in background script
          if (result) {
            chrome.runtime.sendMessage({
              action: 'cacheResult',
              url: currentUrl,
              baseDomain: baseDomain,
              result: result
            });
          }
        });
      });
    });
  });
})();

