// NOAIS content script - v0.5.0
// Scans the current page for AI-generated content using:
//   1. Hard-coded AI-phrase counter (v0.2, kept for backwards compat).
//   2. Heuristic statistical analysis (v0.3, v0.4 sensitivity-aware).
//   3. Per-site + global settings (v0.4): early-return if site is disabled.
//   4. Platform-specific adapters (v0.5): per-element scoring + decoration.
//
// Pure on-device, no network calls, no models, no innerHTML anywhere.

(function () {
  'use strict';

  // ----- AI-phrase counter (v0.2) -----
  const AI_PHRASES = [
    'as an ai language model',
    'i am an ai',
    "i'm an ai",
    "i don't have personal",
    'i cannot browse',
  ];

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

  // ----- Storage + effective settings (v0.4) -----
  const STORAGE_KEYS = [
    'noais_enabled',
    'noais_global_sensitivity',
    'noais_site_overrides',
    'noais_hard_mode_sites', // NEW in v0.5
  ];

  let effective = {
    enabled: true,
    sensitivity: 100,
    site: null,
    hardMode: false, // NEW in v0.5
  };
  let settingsLoaded = false;

  function refreshEffective() {
    try {
      chrome.storage.local.get(STORAGE_KEYS, (result) => {
        if (chrome.runtime.lastError) {
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
        // Determine hard-mode for this site (separate storage key, not part
        // of the curated/sites settings merge).
        const hardMap = (result && result.noais_hard_mode_sites) || {};
        const host = (location.hostname || '').toLowerCase();
        effective.hardMode = !!(hardMap[host] || hardMap[s.normalizeHostnameInput(host)]);
        settingsLoaded = true;
      });
    } catch (err) {
      console.warn('[NOAIS] storage read threw; using defaults', err);
      settingsLoaded = true;
    }
  }

  // ----- Adapter dispatch (v0.5) -----
  // Pick the first adapter whose `match` returns true for the current hostname.
  // MV3 content scripts run in an isolated world, so we use a DOM data
  // attribute for the test hook (visible across worlds).
  function getEffectiveHostname() {
    const realHost = (location.hostname || '').toLowerCase();
    // Test hook: fixtures can set data-noais-test-host="youtube" on <html>
    // to simulate a particular host (file:// URLs have an empty hostname).
    // This is a no-op in production because real users never set this attr.
    try {
      const hookHost = document.documentElement &&
                       document.documentElement.dataset &&
                       document.documentElement.dataset.noaisTestHost;
      if (hookHost) return String(hookHost).toLowerCase();
    } catch (e) { /* ignore */ }
    return realHost;
  }
  function pickAdapter(hostname) {
    if (!window.NOAIS_ADAPTERS) return null;
    // The adapters self-register on the global when their script runs.
    // For v0.5, only YouTube is supported.
    const candidates = [
      window.NOAIS_YOUTUBE_ADAPTER,
      // future: window.NOAIS_FACEBOOK_ADAPTER, etc.
    ].filter(Boolean);
    const effectiveHostname = (hostname || '').toLowerCase();
    for (const a of candidates) {
      try {
        if (typeof a.match === 'function' && a.match(effectiveHostname)) return a;
      } catch (e) { /* ignore misbehaving adapters */ }
    }
    return null;
  }

  /**
   * Run a single element through the heuristics + phrase counter and
   * decorate it via the adapter. Returns the per-element result.
   */
  function scoreAndDecorate(adapter, element) {
    const text = adapter.extractText(element);
    if (!window.NOAIS_ADAPTERS.helpers.shouldScore(text)) {
      // Too short to bother. Don't add a badge.
      return null;
    }
    const heuristics = window.NOAIS_HEURISTICS;
    if (!heuristics || typeof heuristics.analyzeText !== 'function') return null;
    let result;
    try {
      // shortTextMode is opt-in per-adapter; YouTubeAdapter wants it true.
      result = heuristics.analyzeText(text, {
        sensitivity: effective.sensitivity,
        shortTextMode: !!adapter.shortTextMode,
      });
    } catch (e) {
      return null;
    }
    const count = countAiPhrasesInText(text);
    try {
      adapter.decorate(element, Number(result.score) || 0, count);
      // Hard mode = dim + blur the element.
      if (effective.hardMode && element.classList) {
        element.classList.add('noais-hard');
      } else if (element.classList) {
        element.classList.remove('noais-hard');
      }
    } catch (e) {
      console.warn('[NOAIS] adapter.decorate failed', e);
    }
    return { score: Number(result.score) || 0, count, wordCount: Number(result.wordCount) || 0 };
  }

  /**
   * Scan the page for adapter-specific elements and decorate them.
   * @returns {number} the number of elements decorated
   */
  function scanWithAdapter(adapter) {
    if (!adapter) return 0;
    let count = 0;
    let elements;
    try {
      elements = adapter.findElements(document.body);
    } catch (e) {
      return 0;
    }
    for (const el of elements) {
      if (!el || !el.dataset) continue;
      if (el.dataset.noaisScanned === '1') continue;
      el.dataset.noaisScanned = '1';
      const r = scoreAndDecorate(adapter, el);
      if (r) count++;
    }
    return count;
  }

  // ----- Page-level analysis (for popup) -----
  function analyzePage() {
    if (!settingsLoaded) {
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

  // ----- Storage + observer wiring -----
  function onStorageChanged(changes, area) {
    if (area !== 'local') return;
    const keys = ['noais_enabled', 'noais_global_sensitivity', 'noais_site_overrides', 'noais_hard_mode_sites'];
    for (const k of keys) if (changes[k]) { refreshEffective(); return; }
  }

  // Adapter scan loop. Re-runs on MutationObserver events. Throttled to
  // avoid running on every keystroke.
  let scanScheduled = false;
  function scheduleScan(adapter) {
    if (scanScheduled) return;
    scanScheduled = true;
    // Use rAF when available so we don't block input.
    const sched = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (cb) => setTimeout(cb, 16);
    sched(() => {
      scanScheduled = false;
      try { scanWithAdapter(adapter); } catch (e) { /* ignore */ }
    });
  }

  function startObserver(adapter) {
    if (!adapter || !window.MutationObserver) return;
    const obs = new MutationObserver(() => scheduleScan(adapter));
    try {
      obs.observe(document.body, { childList: true, subtree: true });
    } catch (e) { /* body might be unavailable briefly */ }
  }

  // ----- Message handler -----
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message !== 'object') return false;
    if (message.type === 'NOAIS_ANALYZE_PAGE') {
      try {
        sendResponse(analyzePage());
      } catch (err) {
        sendResponse({ ok: false, count: 0, score: 0, wordCount: 0, breakdown: {}, error: String(err) });
      }
      return false;
    }
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

  // ----- Storage listener + initial scan -----
  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(onStorageChanged);
  }
  refreshEffective();

  // Initial scan + observer. Use a small delay so the DOM is ready.
  setTimeout(() => {
    try {
      const adapter = pickAdapter(getEffectiveHostname());
      if (adapter) {
        const n = scanWithAdapter(adapter);
        startObserver(adapter);
        console.log(`[NOAIS] v0.5.0 adapter "${adapter.id}" initial scan: ${n} elements`);
      }
    } catch (e) {
      console.warn('[NOAIS] initial adapter scan failed', e);
    }
  }, 100);

  // ----- One-shot load log (testable) -----
  // Wait until storage is loaded so the log is informative. Poll briefly
  // (up to ~250ms), then log whatever we have. If settings never load
  // (e.g. in a headless test), still log within 250ms with a note.
  setTimeout(() => {
    if (!settingsLoaded) {
      setTimeout(() => logLoadState(), 200);
    } else {
      logLoadState();
    }
  }, 50);

  function logLoadState() {
    try {
      const r = analyzePage();
      const status = r.disabled
        ? `DISABLED (site=${r.breakdown && r.breakdown.site})`
        : `score=${r.score}/100, words=${r.wordCount}`;
      const note = settingsLoaded ? '' : ' (settings not yet loaded)';
      console.log(`[NOAIS content] v0.5.0 loaded on ${location.href}; phrases: ${r.count}, ${status}, sensitivity: ${effective.sensitivity}, hardMode: ${effective.hardMode}${note}`);
    } catch (e) { /* innerText may throw on detached documents; ignore */ }
  }
})();
