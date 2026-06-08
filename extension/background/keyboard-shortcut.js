// NOAIS keyboard shortcut listener - v1.1.0
//
// Wires up the chrome.commands.onCommand event so Ctrl+Shift+A toggles
// NOAIS for the current site. We:
//   1. Read the active tab and compute its hostname.
//   2. Read noais_site_overrides from local storage.
//   3. Flip the override for the current hostname (using the same
//      semantics as the options page: a curated site with no override
//      defaults to enabled, so the first toggle = false).
//   4. Write the new override back to storage.
//   5. Notify the tab's content script with NOAIS_SITE_TOGGLED so it
//      can re-scan with the new setting.
//
// Background service workers in MV3 are short-lived; this file does not
// hold any module-level state. Every chrome.commands.onCommand event
// runs a fresh read-modify-write cycle.
//
// This file is loaded by background/background.js via importScripts().

'use strict';

(function () {
  if (!chrome || !chrome.commands || !chrome.commands.onCommand) {
    // chrome.commands is unavailable in some test envs; bail silently.
    return;
  }

  // Debounce lock: prevents rapid Ctrl+Shift+A presses from causing
  // read-modify-write races in chrome.storage.local.
  let lastToggleTime = 0;
  const TOGGLE_COOLDOWN_MS = 150;

  function parseHostname(url) {
    if (typeof url !== 'string' || url.length === 0) return '';
    try {
      const u = new URL(url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
      return u.hostname.toLowerCase();
    } catch (_e) {
      return '';
    }
  }

  function toggleCurrentSite() {
    const now = Date.now();
    if (now - lastToggleTime < TOGGLE_COOLDOWN_MS) return; // debounce
    lastToggleTime = now;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        return;
      }
      const tab = Array.isArray(tabs) && tabs[0];
      if (!tab || typeof tab.id !== 'number') return;
      const hostname = parseHostname(tab.url || '');
      if (!hostname) return; // chrome:// / file:// / about: — nothing to toggle

      chrome.storage.local.get(['noais_site_overrides'], (result) => {
        if (chrome.runtime && chrome.runtime.lastError) return;
        const overrides = (result && result.noais_site_overrides && typeof result.noais_site_overrides === 'object')
          ? Object.assign({}, result.noais_site_overrides)
          : {};
        // Effective current state: if the key is not in overrides, the
        // curated default is "true" for the curated 7 hosts and also
        // "true" for unknown sites (since the master default enables
        // every site). So the first toggle always = false.
        const currentlyEnabled = overrides[hostname] !== false;
        overrides[hostname] = !currentlyEnabled;

        chrome.storage.local.set({ noais_site_overrides: overrides }, () => {
          if (chrome.runtime && chrome.runtime.lastError) return;
          try {
            chrome.tabs.sendMessage(tab.id, { type: 'NOAIS_SITE_TOGGLED' });
          } catch (_e) {
            // Content script may not be present (e.g. chrome:// page);
            // safe to ignore.
          }
        });
      });
    });
  }

  chrome.commands.onCommand.addListener((command) => {
    if (command === 'noais-toggle-site') {
      toggleCurrentSite();
    }
  });
})();
