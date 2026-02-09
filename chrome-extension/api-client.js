// API client for communicating with the backend
const DEFAULT_API_URL = 'http://localhost:3000/api/check-url';

/**
 * Gets the configured API URL from storage, or uses default
 */
async function getApiUrl() {
  const result = await chrome.storage.sync.get(['apiUrl']);
  return result.apiUrl || DEFAULT_API_URL;
}

/**
 * Get authentication token from storage
 */
async function getAuthToken() {
  const result = await chrome.storage.local.get(['authToken']);
  return result.authToken || null;
}

/**
 * Checks if a URL is phishing by calling the backend API
 * @param {string} url - The URL to check
 * @returns {Promise<{isPhishing: boolean, reason?: string, cached?: boolean}>}
 */
async function checkUrl(url) {
  try {
    const apiUrl = await getApiUrl();
    const token = await getAuthToken();
    
    const headers = {
      'Content-Type': 'application/json',
    };
    
    // Include JWT token if available
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      // Handle 401 (unauthorized) - token might be expired
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

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { checkUrl, getApiUrl, getAuthToken };
}

