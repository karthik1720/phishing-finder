// Script for options.html

(function() {
  'use strict';

  const autoScanToggle = document.getElementById('autoScanToggle');
  const blockWarningsToggle = document.getElementById('blockWarningsToggle');
  const statusDiv = document.getElementById('status');

  // Load saved settings
  chrome.storage.sync.get(['autoScan', 'blockWarnings'], (result) => {
    const autoScan = result.autoScan !== false; // Default to true
    const blockWarnings = result.blockWarnings === true; // Default to false
    autoScanToggle.checked = autoScan;
    blockWarningsToggle.checked = blockWarnings;
  });

  // Save settings when auto-scan toggle changes
  autoScanToggle.addEventListener('change', (e) => {
    const autoScan = e.target.checked;
    chrome.storage.sync.get(['blockWarnings'], (current) => {
      chrome.storage.sync.set({ autoScan, blockWarnings: current.blockWarnings || false }, () => {
        showStatus('Settings saved successfully!', 'success');
        
        // Notify background script of the change
        chrome.runtime.sendMessage({
          action: 'settingsUpdated',
          autoScan: autoScan,
          blockWarnings: current.blockWarnings || false
        });
      });
    });
  });

  // Save settings when block warnings toggle changes
  blockWarningsToggle.addEventListener('change', (e) => {
    const blockWarnings = e.target.checked;
    chrome.storage.sync.get(['autoScan'], (current) => {
      chrome.storage.sync.set({ autoScan: current.autoScan !== false, blockWarnings }, () => {
        showStatus('Settings saved successfully!', 'success');
        
        // Notify background script of the change
        chrome.runtime.sendMessage({
          action: 'settingsUpdated',
          autoScan: current.autoScan !== false,
          blockWarnings: blockWarnings
        });
      });
    });
  });

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    setTimeout(() => {
      statusDiv.className = 'status';
    }, 3000);
  }
})();

