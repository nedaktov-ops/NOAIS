// NOAIS popup script - v1.1.0
// - Sync-aware toggle persistence (noais_enabled via NOAIS_SYNC → chrome.storage.sync)
// - Queries the active tab's content script for full page analysis
// - Renders the AI-likely score (0-100) with a colour-coded bar
// - Renders the hard-coded AI phrase count
// - Renders the word count for transparency
// - Renders the "On this site: ON/OFF/N/A" status
// - "Disable on this site" button → NOAIS_TOGGLE_SITE message (per-tab override)
// - "Why?" link → OPEN_WHY_PANEL → background opens chrome.sidePanel
// - "Open Settings" link → chrome.runtime.openOptionsPage()

(function () {
  'use strict';

  const STORAGE_KEYS = {
    ENABLED: 'noais_enabled',
    SENSITIVITY: 'noais_global_sensitivity',
    OVERRIDES: 'noais_site_overrides',
    TAB_OVERRIDES: 'noais_tab_overrides',
  };
  const MESSAGE_TYPE = 'NOAIS_ANALYZE_PAGE';
  const TOGGLE_SITE_TYPE = 'NOAIS_TOGGLE_SITE';
  const OPEN_WHY_TYPE = 'OPEN_WHY_PANEL';

  const toggleEl = document.getElementById('toggle');
  const statusEl = document.getElementById('toggle-label');
  const scoreEl = document.getElementById('score-value');
  const scoreBarEl = document.getElementById('score-bar-fill');
  const wordCountEl = document.getElementById('word-count');
  const countEl = document.getElementById('scan-count');
  const siteStatusEl = document.getElementById('site-status');
  const siteHostnameEl = document.getElementById('site-hostname');
  const openSettingsEl = document.getElementById('open-settings');
  const openWhyEl = document.getElementById('open-why');
  const toggleSiteEl = document.getElementById('toggle-site');

  if (
    !toggleEl || !statusEl || !scoreEl || !scoreBarEl || !wordCountEl ||
    !countEl || !siteStatusEl || !siteHostnameEl || !openSettingsEl ||
    !openWhyEl || !toggleSiteEl
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

  // sync-helper: routes reads/writes to chrome.storage.sync for the 3 sync keys
  // (noais_enabled, noais_global_sensitivity, noais_hard_mode_sites) and to
  // chrome.storage.local for everything else.
  const sync = window.NOAIS_SYNC || null;

  // ----- Localisation ----------------------------------------------------

  function t(key) {
    try {
      if (chrome && chrome.i18n && typeof chrome.i18n.getMessage === 'function') {
        const v = chrome.i18n.getMessage(key);
        if (v) return v;
      }
    } catch (_e) { /* ignore */ }
    return key;
  }

  // ----- Toggle state ----------------------------------------------------

  function renderStatus(enabled) {
    if (enabled) {
      statusEl.textContent = t('popup_active');
      statusEl.classList.add('active');
      statusEl.setAttribute('aria-label', t('popup_active_aria'));
    } else {
      statusEl.textContent = t('popup_inactive');
      statusEl.classList.remove('active');
      statusEl.setAttribute('aria-label', t('popup_inactive_aria'));
    }
  }

  function loadToggleState() {
    function apply(enabled) {
      toggleEl.checked = enabled;
      renderStatus(enabled);
    }
    try {
      if (sync) {
        sync.get(STORAGE_KEYS.ENABLED, (err, value) => {
          if (err) { apply(true); return; }
          apply(value !== false); // missing = true
        });
        return;
      }
    } catch (_e) { /* fall through */ }
    try {
      chrome.storage.local.get([STORAGE_KEYS.ENABLED], (result) => {
        const enabled = (result && result[STORAGE_KEYS.ENABLED]) !== false;
        apply(enabled);
      });
    } catch (err) {
      console.error('NOAIS popup: failed to load state', err);
      apply(true);
    }
  }

  function saveToggleState(enabled) {
    try {
      if (sync) {
        sync.set(STORAGE_KEYS.ENABLED, enabled);
        return;
      }
    } catch (_e) { /* fall through */ }
    try {
      chrome.storage.local.set({ [STORAGE_KEYS.ENABLED]: enabled }, () => {
        if (chrome.runtime && chrome.runtime.lastError) {
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
      updateToggleButton('', false);
      return;
    }
    siteHostnameEl.textContent = hostname;
    if (effective && effective.enabled) {
      siteStatusEl.classList.add('on');
      siteStatusEl.textContent = 'ON';
      updateToggleButton(hostname, true);
    } else {
      siteStatusEl.classList.add('off');
      siteStatusEl.textContent = 'OFF';
      updateToggleButton(hostname, false);
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

  // ----- Open Why panel --------------------------------------------------

  function onOpenWhy(event) {
    event.preventDefault();
    try {
      if (chrome && chrome.runtime && typeof chrome.runtime.sendMessage === 'function') {
        chrome.runtime.sendMessage({ type: OPEN_WHY_TYPE });
        try { window.close(); } catch (_e) { /* ignore */ }
        return;
      }
    } catch (_e) { /* fall through */ }
    // Last-resort fallback: open why.html in a new tab. Firefox < 145 falls
    // through to this path because chrome.sidePanel is undefined there.
    try {
      const url = (chrome.runtime.getURL && chrome.runtime.getURL('sidepanel/why.html')) || 'sidepanel/why.html';
      chrome.tabs.create({ url });
      try { window.close(); } catch (_e) { /* ignore */ }
    } catch (err) {
      console.error('NOAIS popup: failed to open why panel', err);
    }
  }

  // ----- Toggle current site (per-site disable) --------------------------

  function updateToggleButton(hostname, enabled) {
    if (!toggleSiteEl) return;
    if (enabled) {
      toggleSiteEl.textContent = t('popup_disable_site');
    } else {
      toggleSiteEl.textContent = t('popup_enable_site');
    }
  }

  function onToggleSite() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = Array.isArray(tabs) && tabs[0];
      if (!tab || typeof tab.id !== 'number') return;
      const url = tab.url || '';
      const hostname = settings ? settings.parseHostname(url) : '';
      try {
        chrome.tabs.sendMessage(tab.id, { type: TOGGLE_SITE_TYPE, hostname }, (response) => {
          if (chrome.runtime.lastError) return;
          // Update button text to reflect new state.
          const wasEnabled = toggleSiteEl.textContent === t('popup_disable_site') ||
                             toggleSiteEl.textContent === '__MSG_popup_toggle_site__';
          updateToggleButton(hostname, !wasEnabled);
          // Re-query the tab to refresh the score display.
          queryActiveTab();
        });
      } catch (err) {
        console.error('NOAIS popup: failed to send NOAIS_TOGGLE_SITE', err);
      }
    });
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
  openWhyEl.addEventListener('click', onOpenWhy);
  toggleSiteEl.addEventListener('click', onToggleSite);
})();
