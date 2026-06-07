// NOAIS popup script - v0.2.0
// - Loads/saves the enable/disable toggle (chrome.storage.local)
// - Queries the active tab's content script for the AI-phrase count
// - Renders the count with a colour-coded severity class

(function () {
  'use strict';

  const STORAGE_KEY = 'noais_enabled';
  const MESSAGE_TYPE = 'NOAIS_GET_PHRASE_COUNT';

  const toggleEl = document.getElementById('toggle');
  const statusEl = document.getElementById('toggle-label');
  const countEl = document.getElementById('scan-count');

  if (!toggleEl || !statusEl || !countEl) {
    console.error('NOAIS popup: required DOM elements not found.');
    return;
  }

  // --- Toggle state -----------------------------------------------------

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
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        const enabled = Boolean(result && result[STORAGE_KEY]);
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
      chrome.storage.local.set({ [STORAGE_KEY]: enabled }, () => {
        if (chrome.runtime.lastError) {
          console.error('NOAIS popup: storage error', chrome.runtime.lastError);
        }
      });
    } catch (err) {
      console.error('NOAIS popup: failed to save state', err);
    }
  }

  // --- AI phrase count --------------------------------------------------

  function severityFor(count) {
    if (count === 0) return 'zero';
    if (count <= 2) return 'low';
    return 'high';
  }

  function renderCount(count) {
    countEl.classList.remove('zero', 'low', 'high', 'error');
    countEl.classList.add(severityFor(count));
    countEl.textContent = String(count);
  }

  function renderCountError(message) {
    countEl.classList.remove('zero', 'low', 'high');
    countEl.classList.add('error');
    countEl.textContent = message;
  }

  function queryActiveTabCount() {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = Array.isArray(tabs) && tabs[0];
        if (!tab || typeof tab.id !== 'number') {
          renderCountError('No active tab');
          return;
        }
        try {
          chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPE }, (response) => {
            if (chrome.runtime.lastError) {
              // No content script on this page (e.g. chrome://, about:, PDF, store).
              renderCountError('N/A');
              return;
            }
            if (response && typeof response.count === 'number') {
              renderCount(response.count);
            } else {
              renderCountError('No response');
            }
          });
        } catch (err) {
          renderCountError('Send failed');
          console.error('NOAIS popup: sendMessage failed', err);
        }
      });
    } catch (err) {
      renderCountError('Query failed');
      console.error('NOAIS popup: tabs.query failed', err);
    }
  }

  // --- Wire up ----------------------------------------------------------

  loadToggleState();
  queryActiveTabCount();

  toggleEl.addEventListener('change', (event) => {
    const target = /** @type {HTMLInputElement} */ (event.target);
    const enabled = Boolean(target.checked);
    renderStatus(enabled);
    saveToggleState(enabled);
  });
})();
