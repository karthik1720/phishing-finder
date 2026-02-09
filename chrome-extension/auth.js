// Authentication utilities for Chrome Extension

const DEFAULT_API_URL = 'http://localhost:3000';

/**
 * Get the API base URL from storage
 */
async function getApiUrl() {
  const result = await chrome.storage.sync.get(['apiUrl']);
  return result.apiUrl || DEFAULT_API_URL;
}

/**
 * Login with email and password
 */
async function login(email, password) {
  try {
    const apiUrl = await getApiUrl();
    const response = await fetch(`${apiUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Login failed');
    }

    const data = await response.json();
    
    // Store token and user info
    await chrome.storage.local.set({
      authToken: data.token,
      user: data.user,
    });

    return data;
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
}

/**
 * Register a new user
 */
async function register(email, password) {
  try {
    const apiUrl = await getApiUrl();
    const response = await fetch(`${apiUrl}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Registration failed');
    }

    const data = await response.json();
    
    // Store token and user info
    await chrome.storage.local.set({
      authToken: data.token,
      user: data.user,
    });

    return data;
  } catch (error) {
    console.error('Registration error:', error);
    throw error;
  }
}

/**
 * Logout the current user
 */
async function logout() {
  await chrome.storage.local.remove(['authToken', 'user']);
}

/**
 * Get the current authentication token
 */
async function getToken() {
  const result = await chrome.storage.local.get(['authToken']);
  return result.authToken || null;
}

/**
 * Check if user is authenticated
 */
async function isAuthenticated() {
  const token = await getToken();
  return !!token;
}

/**
 * Get current user info
 */
async function getUserInfo() {
  const result = await chrome.storage.local.get(['user']);
  return result.user || null;
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    login,
    register,
    logout,
    getToken,
    isAuthenticated,
    getUserInfo,
  };
}

// Also expose globally for browser use
if (typeof window !== 'undefined') {
  window.authAPI = {
    login,
    register,
    logout,
    getToken,
    isAuthenticated,
    getUserInfo,
  };
}

