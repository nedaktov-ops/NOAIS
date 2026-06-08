// NOAIS content script - v1.1.1
// Scans the current page for AI-generated content using:
//   1. Hard-coded AI-phrase counter (v0.2, kept for backwards compat).
//   2. Heuristic statistical analysis (v0.3, v0.4 sensitivity-aware).
//   3. Per-site + global settings (v0.4): early-return if site is disabled.
//   4. Platform-specific adapters (v0.5): per-element scoring + decoration.
//   5. v1.1 UI modules: page counter, badge tooltip, element allowlist.
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

  // ----- v1.1: Per-element allowlist check -----
  // Returns true if the element's text is allowlisted (user chose
  // "Don't show this" for a similar element on the same host).
  function isElementAllowlisted(text) {
    try {
      if (!window.NOAIS_ELEMENT_ALLOWLIST || !window.NOAIS_STORAGE_KEYS) return false;
      const hash = window.NOAIS_STORAGE_KEYS.hashText(text);
      return window.NOAIS_ELEMENT_ALLOWLIST.isAllowed(location.hostname, hash);
    } catch (_e) { return false; }
  }

  // ----- v1.1: Scored elements tracker (for page counter) -----
  let scoredElements = [];

  function resetScoredElements() {
    scoredElements = [];
  }

  // ----- v1.1: Badge tooltip instance (created after DOM is ready) -----
  let badgeTooltip = null;

  function initBadgeTooltip() {
    if (badgeTooltip) return;
    if (!window.NOAIS_BADGE_TOOLTIP) return;
    try {
      badgeTooltip = window.NOAIS_BADGE_TOOLTIP.create({
        document: document,
        allowlist: window.NOAIS_ELEMENT_ALLOWLIST || null,
        sendMessage: function (msg) {
          try { chrome.runtime.sendMessage(msg); } catch (_e) { /* ignore */ }
        },
    getHostname: function () { return location.hostname || 'localhost'; },
        viewport: { width: window.innerWidth || 1024, height: window.innerHeight || 768 },
      });
    } catch (_e) { badgeTooltip = null; }
  }

  function attachBadgeTooltip(element) {
    if (!badgeTooltip) return;
    try {
      const badgeEl = element.querySelector('.noais-badge');
      if (badgeEl) badgeTooltip.attach(badgeEl);
    } catch (_e) { /* non-fatal */ }
  }

  // ----- v1.1: Page counter (created + mounted after initial scan) -----
  let pageCounter = null;

  function initPageCounter() {
    if (pageCounter) return;
    if (!window.NOAIS_PAGE_COUNTER) return;
    if (!effective.enabled) return;
    try {
      if (window.NOAIS_PAGE_COUNTER.shouldHide({
        protocol: location.protocol,
        href: location.href,
        enabled: effective.enabled,
      })) return;
    } catch (_e) { return; }
    try {
      pageCounter = window.NOAIS_PAGE_COUNTER.create({
        document: document,
        getCount: function () { return scoredElements.length; },
        getItems: function () {
          return scoredElements.slice(0, 50).map(function (r) {
            return { score: r.score, text: r.text };
          });
        },
      });
      pageCounter.mount();
      pageCounter.update();
    } catch (_e) { pageCounter = null; }
  }

  function updatePageCounter() {
    if (pageCounter) {
      try { pageCounter.update(); } catch (_e) { /* ignore */ }
    }
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
    // v0.5: YouTube. v0.6: Facebook. v0.7: Instagram + TikTok.
    const candidates = [
      window.NOAIS_YOUTUBE_ADAPTER,
      window.NOAIS_FACEBOOK_ADAPTER,
      window.NOAIS_INSTAGRAM_ADAPTER,
      window.NOAIS_TIKTOK_ADAPTER,
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
    // v1.1: Skip if element text is allowlisted.
    if (isElementAllowlisted(text)) {
      element.dataset.noaisAllowlisted = '1';
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
      adapter.decorate(element, Number(result.score) || 0, count, (result.breakdown || null));
      // v1.1: Attach badge tooltip to the newly created badge.
      attachBadgeTooltip(element);
      // Hard mode = dim + blur the element.
      if (effective.hardMode && element.classList) {
        element.classList.add('noais-hard');
      } else if (element.classList) {
        element.classList.remove('noais-hard');
      }
    } catch (e) {
      console.warn('[NOAIS] adapter.decorate failed', e);
    }
    const record = { score: Number(result.score) || 0, count: count, wordCount: Number(result.wordCount) || 0, text: text, element: element };
    scoredElements.push(record);
    // v1.1: Update page counter widget after each new scored element.
    updatePageCounter();
    return record;
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
    for (const k of keys) if (changes[k]) { refreshEffective(); persistPageScore(); return; }
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
    // v1.1: Respond with scored element count for the page counter.
    if (message.type === 'NOAIS_GET_SCORED_COUNT') {
      try {
        sendResponse({ ok: true, count: scoredElements.length });
      } catch (err) {
        sendResponse({ ok: false, count: 0, error: String(err) });
      }
      return false;
    }
    // v1.1.2: Toggle site override (per-site enable/disable from popup).
    if (message.type === 'NOAIS_TOGGLE_SITE') {
      try {
        const hostname = message.hostname || (location.hostname || '').toLowerCase();
        if (!hostname) {
          sendResponse({ ok: false, error: 'no hostname' });
          return true;
        }
        chrome.storage.local.get(['noais_site_overrides'], (result) => {
          const overrides = (result && result.noais_site_overrides && typeof result.noais_site_overrides === 'object')
            ? Object.assign({}, result.noais_site_overrides)
            : {};
          // Flip this site's override directly, regardless of global state.
          // If the key is absent or true → disable (false). If false → enable (true).
          const currentlyDisabled = overrides[hostname] === false;
          overrides[hostname] = currentlyDisabled ? true : false;
          chrome.storage.local.set({ noais_site_overrides: overrides }, () => {
            if (chrome.runtime.lastError) {
              sendResponse({ ok: false, error: String(chrome.runtime.lastError.message) });
              return;
            }
            refreshEffective();
            // Re-scan with the new effective settings.
            setTimeout(() => {
              resetScoredElements();
              const adapter = pickAdapter(getEffectiveHostname());
              if (adapter) scanWithAdapter(adapter);
              persistPageScore();
            }, 50);
            sendResponse({ ok: true, enabled: !currentlyDisabled });
          });
        });
        return true; // keep channel open for async sendResponse
      } catch (err) {
        sendResponse({ ok: false, error: String(err) });
        return true;
      }
    }
    return false;
  });

  // ----- Storage listener + initial scan -----
  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(onStorageChanged);
  }
  refreshEffective();

  // v1.1: Hydrate the element allowlist from storage at startup.
  // This is async and best-effort; if it fails, allowlisting still works
  // (just not persisted across sessions until the next load).
  try {
    if (window.NOAIS_ELEMENT_ALLOWLIST && typeof window.NOAIS_ELEMENT_ALLOWLIST._loadFromStorage === 'function') {
      window.NOAIS_ELEMENT_ALLOWLIST._loadFromStorage().catch(function () {});
    }
  } catch (_e) { /* non-fatal */ }

  // Initial scan + observer. Use a small delay so the DOM is ready.
  setTimeout(() => {
    try {
      // v1.1: Init the badge tooltip once the DOM is available.
      initBadgeTooltip();
      // v1.1: Reset scored elements before each adapter scan cycle.
      resetScoredElements();
      const adapter = pickAdapter(getEffectiveHostname());
      if (adapter) {
        const n = scanWithAdapter(adapter);
        startObserver(adapter);
        console.log(`[NOAIS] v0.5.0 adapter "${adapter.id}" initial scan: ${n} elements`);
      }
      // v1.1: Init + mount the page counter after the initial scan.
      initPageCounter();
      // v1.1.2: Persist page score for the sidepanel.
      persistPageScore();
    } catch (e) {
      console.warn('[NOAIS] initial scan failed', e);
    }
  }, 100);

  // ----- Persist page score for sidepanel (v1.1.2) -----
  // Saves the current page analysis to chrome.storage.local and broadcasts
  // a NOAIS_PAGE_SCORE message so the sidepanel (why.js) can display it.
  function persistPageScore() {
    if (!settingsLoaded) return;
    try {
      const result = analyzePage();
      if (!result.ok) return;
      const payload = {
        score: result.score,
        breakdown: result.breakdown,
        wordCount: result.wordCount,
        phraseCount: result.count,
        hostname: location.hostname,
      };
      chrome.storage.local.set({
        noais_page_score: result.score,
        noais_page_breakdown: result.breakdown,
      }, () => {
        if (chrome.runtime.lastError) return;
      });
      try {
        chrome.runtime.sendMessage({ type: 'NOAIS_PAGE_SCORE', payload: payload });
      } catch (_e) { /* background may not be ready */ }
    } catch (_e) { /* non-fatal */ }
  }

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
      console.log(`[NOAIS content] v1.1.1 loaded on ${location.href}; phrases: ${r.count}, ${status}, sensitivity: ${effective.sensitivity}, hardMode: ${effective.hardMode}${note}`);
    } catch (e) { /* innerText may throw on detached documents; ignore */ }
  }
})();
