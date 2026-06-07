// NOAIS background service worker - v0.1.0
// Minimal: logs installation. v0.2+ will add content-script orchestration.
// Note: defaults are set by popup.js on first run, not here, because MV3
// service workers can be terminated before async callbacks resolve.

'use strict';

chrome.runtime.onInstalled.addListener((details) => {
  const reason = (details && details.reason) ? details.reason : 'unknown';
  console.log(`[NOAIS] v0.1.0 installed (reason: ${reason})`);
});
