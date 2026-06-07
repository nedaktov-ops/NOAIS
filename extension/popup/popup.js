// NOAIS popup script - v0.4.0
// - Toggle persistence (chrome.storage.local)
// - Queries the active tab's content script for full page analysis
// - Renders the AI-likely score (0-100) with a colour-coded bar
// - Renders the hard-coded AI phrase count
// - Renders the word count for transparency
// - Renders the "On this site: ON/OFF/N/A" status (v0.4)
// - "Open Settings" link -> chrome.runtime.openOptionsPage() (v0.4)

(function () {
  'use strict';

  const STORAGE_KEYS = {
    ENABLED: 'noais_enabled',
    SENSITIVITY: 'noais_global_sensitivity',
    OVERRIDES: 'noais_site_overrides',
  };
  const MESSAGE_TYPE = 'NOAIS_ANALYZE_PAGE';

  const toggleEl = document.getElementById('toggle');
  const statusEl = document.getElementById('toggle-label');
  const scoreEl = document.getElementById('score-value');
  const scoreBarEl = document.getElementById('score-bar-fill');
  const wordCountEl = document.getElementById('word-count');
  const countEl = document.getElementById('scan-count');
  const siteStatusEl = document.getElementById('site-status');
  const siteHostnameEl = document.getElementById('site-hostname');
  const openSettingsEl = document.getElementById('open-settings');

  if (
    !toggleEl || !statusEl || !scoreEl || !scoreBarEl || !wordCountEl ||
    !countEl || !siteStatusEl || !siteHostnameEl || !openSettingsEl
  ) {
    console.error('NOAIS popup: required DOM elements not found.');
    return;
  }

  // ----- Settings module -------------------------------------------------

  if (!window.NOAIS_SETTINGS) {
    console.error('NOAIS popup: settings module not loaded.');
    // Continue — the popup can still show the score and phrase count
    // even without per-site awareness.
  }
  const settings = window.NOAIS_SETTINGS;

  // ----- Toggle state ----------------------------------------------------

  function renderStatus(enabled) {
    if (enabled) {
      statusEl.textContent = 'Active';
      statusEl.classList.add('active');
      statusEl.setAttribute('aria-label', 'NOAIS is active');
    } else {
      statusEl.textContent = 'Inactive';
      statusEl.classList.remove('active');
      statusEl.setAttribute('aria-label', 'NOAIS is inactive');
    }
  }

  function loadToggleState() {
    try {
      chrome.storage.local.get([STORAGE_KEYS.ENABLED], (result) => {
        const enabled = Boolean(result && result[STORAGE_KEYS.ENABLED]);
        toggleEl.checked = enabled;
        renderStatus(enabled);
      });
    } catch (err) {
      console.error('NOAIS popup: failed to load state', err);
      renderStatus(false);
    }
  }

  function saveToggleState(enabled) {
    try {
      chrome.storage.local.set({ [STORAGE_KEYS.ENABLED]: enabled }, () => {
        if (chrome.runtime.lastError) {
          console.error('NOAIS popup: storage error', chrome.runtime.lastError);
        }
      });
    } catch (err) {
      console.error('NOAIS popup: failed to save state', err);
    }
  }

  // ----- Score rendering --------------------------------------------------

  function severityForScore(score) {
    if (score <= 30) return 'zero';
    if (score <= 60) return 'low';
    return 'high';
  }

  function renderScore(score) {
    const sev = severityForScore(score);
    scoreEl.classList.remove('zero', 'low', 'high', 'error');
    scoreEl.classList.add(sev);
    scoreEl.textContent = score + '%';
    scoreBarEl.classList.remove('zero', 'low', 'high', 'error');
    scoreBarEl.classList.add(sev);
    scoreBarEl.style.width = Math.max(2, Math.min(100, score)) + '%';
  }

  function renderScoreError(message) {
    scoreEl.classList.remove('zero', 'low', 'high');
    scoreEl.classList.add('error');
    scoreEl.textContent = message;
    scoreBarEl.classList.remove('zero', 'low', 'high', 'error');
    scoreBarEl.style.width = '0%';
  }

  // ----- Phrase count rendering ------------------------------------------

  function severityForCount(count) {
    if (count === 0) return 'zero';
    if (count <= 2) return 'low';
    return 'high';
  }

  function renderCount(count) {
    countEl.classList.remove('zero', 'low', 'high', 'error');
    countEl.classList.add(severityForCount(count));
    countEl.textContent = String(count);
  }

  function renderCountError(message) {
    countEl.classList.remove('zero', 'low', 'high');
    countEl.classList.add('error');
    countEl.textContent = message;
  }

  // ----- Word count rendering --------------------------------------------

  function renderWordCount(n) {
    if (typeof n === 'number' && n > 0) {
      wordCountEl.textContent = n.toLocaleString() + ' words analysed';
    } else {
      wordCountEl.textContent = '';
    }
  }

  // ----- Current-site status rendering -----------------------------------

  function renderSiteStatus(hostname, effective) {
    siteStatusEl.classList.remove('on', 'off', 'na');
    siteHostnameEl.textContent = '';
    if (!hostname) {
      siteStatusEl.classList.add('na');
      siteStatusEl.textContent = 'N/A';
      return;
    }
    siteHostnameEl.textContent = hostname;
    if (effective && effective.enabled) {
      siteStatusEl.classList.add('on');
      siteStatusEl.textContent = 'ON';
    } else {
      siteStatusEl.classList.add('off');
      siteStatusEl.textContent = 'OFF';
    }
  }

  function renderSiteStatusError(message) {
    siteStatusEl.classList.remove('on', 'off');
    siteStatusEl.classList.add('na');
    siteStatusEl.textContent = message;
    siteHostnameEl.textContent = '';
  }

  // ----- Open Settings ---------------------------------------------------

  function onOpenSettings(event) {
    event.preventDefault();
    if (chrome.runtime && typeof chrome.runtime.openOptionsPage === 'function') {
      try {
        chrome.runtime.openOptionsPage(() => {
          if (chrome.runtime.lastError) {
            // Fallback: open the page in a new tab.
            const url = (chrome.runtime.getURL && chrome.runtime.getURL('options/options.html')) || 'options/options.html';
            chrome.tabs.create({ url });
          }
        });
        return;
      } catch (_e) {
        // Fall through to fallback.
      }
    }
    try {
      const url = (chrome.runtime.getURL && chrome.runtime.getURL('options/options.html')) || 'options/options.html';
      chrome.tabs.create({ url });
    } catch (err) {
      console.error('NOAIS popup: failed to open options', err);
    }
  }

  // ----- Query active tab ------------------------------------------------

  function queryActiveTab() {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = Array.isArray(tabs) && tabs[0];
        if (!tab || typeof tab.id !== 'number') {
          renderScoreError('No active tab');
          renderCountError('—');
          renderWordCount(0);
          renderSiteStatusError('No active tab');
          return;
        }

        // 1. Compute the current-site status (parallel with content query).
        computeCurrentSiteStatus(tab.url || '');

        // 2. Query the content script for the page analysis.
        try {
          chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPE }, (response) => {
            if (chrome.runtime.lastError) {
              renderScoreError('N/A');
              renderCountError('N/A');
              renderWordCount(0);
              return;
            }
            if (response && response.ok) {
              renderScore(typeof response.score === 'number' ? response.score : 0);
              renderCount(typeof response.count === 'number' ? response.count : 0);
              renderWordCount(typeof response.wordCount === 'number' ? response.wordCount : 0);
            } else {
              const msg = (response && response.error) ? response.error : 'No response';
              renderScoreError(msg);
              renderCountError(msg);
              renderWordCount(0);
            }
          });
        } catch (err) {
          renderScoreError('Send failed');
          renderCountError('Send failed');
          renderWordCount(0);
          console.error('NOAIS popup: sendMessage failed', err);
        }
      });
    } catch (err) {
      renderScoreError('Query failed');
      renderCountError('Query failed');
      renderWordCount(0);
      renderSiteStatusError('Query failed');
      console.error('NOAIS popup: tabs.query failed', err);
    }
  }

  function computeCurrentSiteStatus(tabUrl) {
    if (!settings) {
      renderSiteStatusError('N/A');
      return;
    }
    const hostname = settings.parseHostname(tabUrl);
    if (!hostname) {
      renderSiteStatusError('N/A');
      return;
    }
    try {
      chrome.storage.local.get(
        [STORAGE_KEYS.ENABLED, STORAGE_KEYS.OVERRIDES],
        (result) => {
          if (chrome.runtime.lastError) {
            renderSiteStatusError('N/A');
            return;
          }
          const effective = settings.getEffectiveSettings(result || {}, hostname);
          renderSiteStatus(hostname, effective);
        }
      );
    } catch (err) {
      console.error('NOAIS popup: storage read for site status failed', err);
      renderSiteStatusError('N/A');
    }
  }

  // ----- Wire up ---------------------------------------------------------

  loadToggleState();
  queryActiveTab();

  toggleEl.addEventListener('change', (event) => {
    const target = /** @type {HTMLInputElement} */ (event.target);
    const enabled = Boolean(target.checked);
    renderStatus(enabled);
    saveToggleState(enabled);
  });

  openSettingsEl.addEventListener('click', onOpenSettings);
})();
