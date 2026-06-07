// NOAIS welcome page script - v1.1.0
//
// Localises every visible string via chrome.i18n.getMessage so the
// catalogue is the single source of truth. Wires up the two buttons:
//   - "Get started" → opens the options page (via chrome.runtime.openOptionsPage
//     with a chrome.tabs.create fallback). Then closes the welcome tab.
//   - "Take the tour" → in v1.1.0 this just scrolls back to the top of the page
//     (the tour overlay is deferred to v1.2 to keep scope sane).
//
// XSS discipline: every visible string is rendered via textContent;
// the page never assigns to innerHTML.

(function () {
  'use strict';

  function t(key) {
    try {
      if (chrome && chrome.i18n && typeof chrome.i18n.getMessage === 'function') {
        const v = chrome.i18n.getMessage(key);
        if (v) return v;
      }
    } catch (_e) { /* fall through */ }
    return key;
  }

  function setText(id, key) {
    const el = document.getElementById(id);
    if (el) el.textContent = t(key);
  }

  function localise() {
    setText('welcome-title', 'welcome_title');
    const getStarted = document.getElementById('get-started');
    if (getStarted) getStarted.textContent = t('welcome_get_started');
    const takeTour = document.getElementById('take-tour');
    if (takeTour) takeTour.textContent = t('welcome_take_tour');
  }

  function openOptions() {
    try {
      if (chrome.runtime && typeof chrome.runtime.openOptionsPage === 'function') {
        chrome.runtime.openOptionsPage(() => {
          if (chrome.runtime && chrome.runtime.lastError) {
            const url = chrome.runtime.getURL('options/options.html');
            try { chrome.tabs.create({ url }); } catch (_e) { /* ignore */ }
          }
          try { window.close(); } catch (_e) { /* ignore */ }
        });
        return;
      }
    } catch (_e) { /* fall through */ }
    try {
      const url = chrome.runtime.getURL('options/options.html');
      chrome.tabs.create({ url });
      try { window.close(); } catch (_e) { /* ignore */ }
    } catch (err) {
      console.error('NOAIS welcome: failed to open options', err);
    }
  }

  function takeTour() {
    // v1.1.0: the tour is a polite no-op that scrolls to the top so the
    // user can re-read the cards. v1.2 will add an overlay.
    try {
      if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (_e) { /* ignore */ }
  }

  function wire() {
    const getStarted = document.getElementById('get-started');
    if (getStarted && typeof getStarted.addEventListener === 'function') {
      getStarted.addEventListener('click', openOptions);
    }
    const takeTourBtn = document.getElementById('take-tour');
    if (takeTourBtn && typeof takeTourBtn.addEventListener === 'function') {
      takeTourBtn.addEventListener('click', takeTour);
    }
  }

  // The script lives at the bottom of welcome.html, so the DOM is ready.
  localise();
  wire();
})();
