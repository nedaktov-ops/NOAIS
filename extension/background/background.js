// NOAIS background service worker - v1.1.0
//
// Responsibilities (v1.0 → v1.1):
//   - Log the installation reason (only on actual install / update events).
//   - On first install, open the welcome page (options/welcome.html).
//   - Wire the chrome.commands.onCommand keyboard shortcut listener.
//   - Open the side panel ("Why am I seeing this?") on
//     chrome.runtime.onMessage type OPEN_WHY_PANEL.
//   - Clean up per-tab overrides + scan results when a tab closes.
//
// Service workers in MV3 are short-lived; this file does not hold any
// long-running state. Every event handler is self-contained.

'use strict';

// Pull in the keyboard shortcut module. importScripts is synchronous in
// MV3 service workers and runs at module-evaluation time, so the listener
// is registered before any chrome.* event fires.
try {
  // eslint-disable-next-line no-undef
  importScripts('keyboard-shortcut.js');
} catch (e) {
  console.warn('[NOAIS] importScripts(keyboard-shortcut.js) failed', e);
}

// ----- One-shot install log + first-run welcome -----
chrome.runtime.onInstalled.addListener((details) => {
  const reason = (details && details.reason) ? details.reason : 'unknown';

  // Only log on actual extension lifecycle events (install/update).
  // chrome_update and shared_module_update fire on browser wakeup and
  // are misleading — the extension itself has not changed.
  if (reason !== 'install' && reason !== 'update') return;

  let version = '1.1.1';
  try {
    if (chrome.runtime && typeof chrome.runtime.getManifest === 'function') {
      const m = chrome.runtime.getManifest();
      if (m && m.version) version = m.version;
    }
  } catch (_e) { /* ignore */ }
  console.log(`[NOAIS] v${version} installed (reason: ${reason})`);

  if (reason === 'install') {
    try {
      chrome.tabs.create({ url: chrome.runtime.getURL('options/welcome.html') });
    } catch (e) {
      console.warn('[NOAIS] failed to open welcome page', e);
    }
  }
});

// ----- "Why am I seeing this?" side panel opener -----
// The popup (and the content-script tooltip in subagent A's territory)
// sends { type: 'OPEN_WHY_PANEL' } via chrome.runtime.sendMessage. We
// open chrome.sidePanel if available (Chrome 114+, Firefox 145+),
// otherwise fall back to a new tab pointing at the same HTML.
chrome.runtime.onMessage.addListener((message, sender, _sendResponse) => {
  if (!message || typeof message !== 'object') return false;
  if (message.type !== 'OPEN_WHY_PANEL') return false;
  const tabId = sender && sender.tab && typeof sender.tab.id === 'number'
    ? sender.tab.id
    : null;
  try {
    if (chrome.sidePanel && typeof chrome.sidePanel.open === 'function' && tabId !== null) {
      chrome.sidePanel.open({ tabId });
    } else {
      const url = chrome.runtime.getURL('sidepanel/why.html') + (tabId !== null ? ('?tabId=' + tabId) : '');
      chrome.tabs.create({ url });
    }
  } catch (e) {
    console.warn('[NOAIS] OPEN_WHY_PANEL failed', e);
  }
  return false;
});

// ----- Tab cleanup: drop per-tab overrides + scan results when a tab closes -----
chrome.tabs.onRemoved.addListener((tabId) => {
  try {
    chrome.storage.local.get(['noais_tab_overrides', 'noais_last_scan'], (result) => {
      if (chrome.runtime && chrome.runtime.lastError) return;
      const overrides = (result && result.noais_tab_overrides && typeof result.noais_tab_overrides === 'object')
        ? Object.assign({}, result.noais_tab_overrides)
        : {};
      const scans = (result && result.noais_last_scan && typeof result.noais_last_scan === 'object')
        ? Object.assign({}, result.noais_last_scan)
        : {};
      let changed = false;
      if (Object.prototype.hasOwnProperty.call(overrides, tabId)) {
        delete overrides[tabId];
        changed = true;
      }
      if (Object.prototype.hasOwnProperty.call(scans, tabId)) {
        delete scans[tabId];
        changed = true;
      }
      if (changed) {
        chrome.storage.local.set({
          noais_tab_overrides: overrides,
          noais_last_scan: scans,
        });
      }
    });
  } catch (e) {
    // tabs.onRemoved fires even during browser shutdown; ignore errors.
  }
});
