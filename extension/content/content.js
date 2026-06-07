// NOAIS content script - v0.4.0
// Scans the current page for AI-generated content using three methods:
//   1. Hard-coded AI-phrase counter (v0.2, kept for backwards compat).
//   2. Heuristic statistical analysis (v0.3): burstiness, TTR, entropy, hapax.
//   3. Per-site + global settings (v0.4): early-return if site is disabled;
//      sensitivity multiplier passed to heuristics.analyzeText.
//
// Pure on-device, no network calls, no models.
//
// Listens for chrome.storage.onChanged so toggling a site in the options
// page (in another tab) takes effect immediately on the next popup query,
// without requiring a page reload.

(function () {
  'use strict';

  // Five hard-coded AI-typical phrases. Case-insensitive.
  const AI_PHRASES = [
    'as an ai language model',
    'i am an ai',
    "i'm an ai",
    "i don't have personal",
    'i cannot browse',
  ];

  // Storage keys.
  const STORAGE_KEYS = [
    'noais_enabled',
    'noais_global_sensitivity',
    'noais_site_overrides',
  ];

  // Effective settings cache. Refreshed on load and on storage.onChanged.
  let effective = {
    enabled: true,
    sensitivity: 100,
    site: null, // matched curated/custom site for the current hostname, or null
  };
  let settingsLoaded = false;

  /**
   * Count occurrences of the hard-coded AI phrases in the given text.
   * @param {string} text
   * @returns {number}
   */
  function countAiPhrasesInText(text) {
    if (!text) return 0;
    let total = 0;
    for (const phrase of AI_PHRASES) {
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'gi');
      const matches = text.match(regex);
      if (matches) total += matches.length;
    }
    return total;
  }

  /**
   * Read the storage keys relevant to this page and update `effective`.
   * Defensive: any failure leaves `effective` at its previous value
   * (which defaults to enabled=true, sensitivity=100).
   */
  function refreshEffective() {
    try {
      chrome.storage.local.get(STORAGE_KEYS, (result) => {
        if (chrome.runtime.lastError) {
          // Stay at default. Log but don't break the page.
          console.warn('[NOAIS] storage read failed; using defaults', chrome.runtime.lastError);
          settingsLoaded = true;
          return;
        }
        const s = window.NOAIS_SETTINGS;
        if (!s || typeof s.getEffectiveSettings !== 'function') {
          settingsLoaded = true;
          return;
        }
        effective = s.getEffectiveSettings(result || {}, location.hostname);
        settingsLoaded = true;
      });
    } catch (err) {
      console.warn('[NOAIS] storage read threw; using defaults', err);
      settingsLoaded = true;
    }
  }

  /**
   * Run the full analysis on the current page's visible text.
   * @returns {{ok:boolean, count:number, score:number, wordCount:number, breakdown:object, error?:string, disabled?:boolean}}
   */
  function analyzePage() {
    if (!settingsLoaded) {
      // Storage hasn't returned yet. Be safe: return an empty result.
      return { ok: false, count: 0, score: 0, wordCount: 0, breakdown: {}, error: 'Settings not loaded yet' };
    }
    if (!effective.enabled) {
      return {
        ok: true,
        count: 0,
        score: 0,
        wordCount: 0,
        breakdown: { reason: 'Site disabled', site: effective.site },
        disabled: true,
      };
    }
    const text = (document.body && document.body.innerText) || '';
    const count = countAiPhrasesInText(text);

    const heuristics = window.NOAIS_HEURISTICS;
    if (!heuristics || typeof heuristics.analyzeText !== 'function') {
      return { ok: false, count, score: 0, wordCount: 0, breakdown: {}, error: 'Heuristics module not loaded' };
    }

    try {
      const result = heuristics.analyzeText(text, { sensitivity: effective.sensitivity });
      return {
        ok: true,
        count,
        score: Number(result.score) || 0,
        wordCount: Number(result.wordCount) || 0,
        breakdown: result.breakdown || {},
        site: effective.site,
        sensitivity: effective.sensitivity,
      };
    } catch (err) {
      return { ok: false, count, score: 0, wordCount: 0, breakdown: {}, error: String(err && err.message ? err.message : err) };
    }
  }

  /**
   * Live sync: when the user toggles a site or changes sensitivity in the
   * options page (a different tab), pick up the change so the next popup
   * query reflects it.
   */
  function onStorageChanged(changes, area) {
    if (area !== 'local') return;
    if (!changes.noais_enabled && !changes.noais_global_sensitivity && !changes.noais_site_overrides) return;
    refreshEffective();
  }

  // ----- Message handler -----------------------------------------------

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message !== 'object') return false;
    if (message.type === 'NOAIS_ANALYZE_PAGE') {
      try {
        sendResponse(analyzePage());
      } catch (err) {
        sendResponse({ ok: false, count: 0, score: 0, wordCount: 0, breakdown: {}, error: String(err) });
      }
      return false; // synchronous
    }
    // Backwards-compat: v0.2 popup used NOAIS_GET_PHRASE_COUNT.
    if (message.type === 'NOAIS_GET_PHRASE_COUNT') {
      try {
        sendResponse({ ok: true, count: countAiPhrasesInText((document.body && document.body.innerText) || '') });
      } catch (err) {
        sendResponse({ ok: false, count: 0, error: String(err) });
      }
      return false;
    }
    return false;
  });

  // ----- Storage listener + initial load -------------------------------

  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(onStorageChanged);
  }
  refreshEffective();

  // ----- One-shot load log (testable) ----------------------------------

  // Defer the log slightly so the initial storage read has a chance to complete
  // and the message is informative. If storage read finishes later, we don't
  // re-log; the popup will query for fresh data anyway.
  setTimeout(() => {
    try {
      const r = analyzePage();
      const status = r.disabled ? `DISABLED (site=${r.breakdown && r.breakdown.site})` : `score=${r.score}/100, words=${r.wordCount}`;
      console.log(`[NOAIS content] v0.4.0 loaded on ${location.href}; phrases: ${r.count}, ${status}, sensitivity: ${effective.sensitivity}`);
    } catch (e) {
      /* innerText may throw on detached documents; ignore */
    }
  }, 50);
})();
