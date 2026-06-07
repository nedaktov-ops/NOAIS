// NOAIS popup script - v0.1.0
// Handles the enable/disable toggle and persists state via chrome.storage.

(function () {
  'use strict';

  const STORAGE_KEY = 'noais_enabled';
  const toggleEl = document.getElementById('toggle');
  const statusEl = document.getElementById('toggle-label');

  if (!toggleEl || !statusEl) {
    console.error('NOAIS popup: required DOM elements not found.');
    return;
  }

  /**
   * Update the visible status text and class based on enabled state.
   * @param {boolean} enabled
   */
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

  /**
   * Load saved state from chrome.storage.local.
   * Falls back to false if unset.
   */
  function loadState() {
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

  /**
   * Persist the toggle state.
   * @param {boolean} enabled
   */
  function saveState(enabled) {
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

  // Initialise: load saved state.
  loadState();

  // Listen for toggle changes.
  toggleEl.addEventListener('change', (event) => {
    const target = /** @type {HTMLInputElement} */ (event.target);
    const enabled = Boolean(target.checked);
    renderStatus(enabled);
    saveState(enabled);
  });
})();
