// Script for warning.html page

(function() {
  'use strict';

  // Get URL, warning type, severity, reason, and blocked status from query parameters
  const params = new URLSearchParams(window.location.search);
  const targetUrl = params.get('url');
  const warningType = params.get('warningType') || '';
  const warningSeverity = params.get('warningSeverity') || 'medium';
  const reason = params.get('reason') || 'This site has been flagged for potential risks.';
  const blocked = params.get('blocked') === 'true'; // If true, warnings are blocked (no proceed option)

  // Display URL
  if (targetUrl) {
    document.getElementById('urlDisplay').textContent = targetUrl;
  }

  // Display warning types
  const warningTypesDiv = document.getElementById('warningTypes');
  if (warningType) {
    const types = warningType.split(',');
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

    let html = '<div class="warning-badges">';
    types.forEach(type => {
      const label = typeLabels[type.trim()] || type.trim();
      html += `<span class="warning-badge">${label}</span>`;
    });
    html += `<span class="severity-badge severity-${warningSeverity}">${severityLabels[warningSeverity] || warningSeverity}</span>`;
    html += '</div>';
    warningTypesDiv.innerHTML = html;
  }

  // Display reason
  document.getElementById('reasonText').textContent = decodeURIComponent(reason);

  // Handle blocked state (when blockWarnings setting is enabled)
  const proceedBtn = document.getElementById('proceedBtn');
  if (blocked) {
    // Warnings are blocked - hide proceed button, update UI
    proceedBtn.style.display = 'none';
    document.querySelector('h1').textContent = '⚠️ Website Blocked';
    document.querySelector('.subtitle').textContent = 'This website has been blocked due to warnings.';
    document.querySelector('.content').classList.add('blocked');
  } else {
    // Warnings are not blocked - show proceed button
    proceedBtn.style.display = 'inline-block';
  }

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

  // Scan again button - triggers fresh AI check
  document.getElementById('scanAgainBtn').addEventListener('click', () => {
    if (!targetUrl) return;
    
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

  // Proceed anyway button
  document.getElementById('proceedBtn').addEventListener('click', () => {
    if (targetUrl) {
      window.location.href = targetUrl;
    }
  });

  // Go back button
  document.getElementById('goBackBtn').addEventListener('click', () => {
    window.history.back();
  });
})();


