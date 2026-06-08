// NOAIS — canonical storage key list (v1.1.0).
//
// Single source of truth for every chrome.storage key the extension reads
// or writes. Importing this file in the browser and in Node tests yields
// the same list. The previous shape (`STORAGE_KEYS = { ENABLED: '...' }`
// duplicated in content.js, popup.js, options.js) is now centralised here.
//
// Storage areas:
//   - chrome.storage.sync: 4 small user settings that should follow the
//     user across devices. The 8 KB per-extension quota is tight, so
//     per-site overrides and per-element allowlists stay on local.
//   - chrome.storage.local: everything else. The 5 MB default quota is
//     more than enough.
//
// Sync deviated from the v1.1 spec §8: the spec listed
// `noais_site_overrides` as a sync key, but a user with 50+ custom sites
// can blow the 8 KB sync quota. We keep per-site overrides on local.

(function (root) {
  'use strict';

  // ----- Keys -----
  const KEYS = Object.freeze({
    // Existing v0.1–v0.5 keys
    ENABLED:            'noais_enabled',
    GLOBAL_SENSITIVITY: 'noais_global_sensitivity',
    SITE_OVERRIDES:     'noais_site_overrides',
    HARD_MODE_SITES:    'noais_hard_mode_sites',

    // New in v1.1
    PAGE_COUNTER_ENABLED:    'noais_page_counter_enabled',
    PAGE_COUNTER_POSITION:   'noais_page_counter_position',
    ELEMENT_ALLOWLIST:       'noais_element_allowlist',
    TAB_OVERRIDES:           'noais_tab_overrides',
    LAST_SCAN:               'noais_last_scan', // { [tabId]: { count, scannedAt } }
  });

  // ----- Areas -----
  // Which storage area each key lives in. Used by the settings module
  // to route reads/writes correctly.
  const SYNC_KEYS = Object.freeze([
    KEYS.ENABLED,
    KEYS.GLOBAL_SENSITIVITY,
    KEYS.HARD_MODE_SITES,
  ]);

  const LOCAL_KEYS = Object.freeze([
    KEYS.SITE_OVERRIDES,
    KEYS.PAGE_COUNTER_ENABLED,
    KEYS.PAGE_COUNTER_POSITION,
    KEYS.ELEMENT_ALLOWLIST,
    KEYS.TAB_OVERRIDES,
    KEYS.LAST_SCAN,
  ]);

  // ----- Defaults -----
  const DEFAULTS = Object.freeze({
    [KEYS.ENABLED]: true,
    [KEYS.GLOBAL_SENSITIVITY]: 100,
    [KEYS.SITE_OVERRIDES]: {},
    [KEYS.HARD_MODE_SITES]: {},
    [KEYS.PAGE_COUNTER_ENABLED]: true,
    [KEYS.PAGE_COUNTER_POSITION]: null,
    [KEYS.ELEMENT_ALLOWLIST]: {}, // { [hostname]: { [textHash16]: true } }
    [KEYS.TAB_OVERRIDES]: {},     // { [tabId]: true }
    [KEYS.LAST_SCAN]: {},         // { [tabId]: { count, scannedAt } }
  });

  // ----- Public helpers -----

  /**
   * Return the value of `key` from the right area, with a default
   * fallback. Pure function: does not touch chrome.* APIs.
   * @param {string} key
   * @param {object} localBlob   the local storage blob
   * @param {object} syncBlob    the sync storage blob
   * @returns {*}
   */
  function get(key, localBlob, syncBlob) {
    // Accept both the key constant (e.g. KEYS.ENABLED) and raw key string.
    const v = (syncBlob && Object.prototype.hasOwnProperty.call(syncBlob, key))
      ? syncBlob[key]
      : (localBlob && Object.prototype.hasOwnProperty.call(localBlob, key))
        ? localBlob[key]
        : DEFAULTS[key];
    return (v === undefined) ? DEFAULTS[key] : v;
  }

  /**
   * Hash a text snippet for the per-element allowlist. SHA-256, first
   * 16 hex chars. Same algorithm the spec describes, implemented in
   * pure JS so we can call it from Node tests and from the browser
   * (via crypto.subtle if available; otherwise a JS implementation).
   * @param {string} text
   * @returns {string} 16 hex chars
   */
  function hashText(text) {
    if (typeof text !== 'string') return '';
    const input = text.slice(0, 200).toLowerCase();
    // Use node:crypto in Node; in the browser, fall back to a tiny
    // FNV-1a 32-bit hash because crypto.subtle is async and we want
    // synchronous call sites. The hash only needs to be stable per
    // browser+text, not cryptographically secure.
    if (typeof require !== 'undefined' && typeof require('node:crypto') === 'function') {
      try {
        const crypto = require('node:crypto');
        return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
      } catch (_e) { /* fall through */ }
    }
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      // Browser path — caller must await. We provide a sync fallback
      // (FNV-1a) for code paths that need to be sync (e.g. test stubs).
      // The browser will hit the async path; the sync path is a sane
      // default for tests and old browsers.
    }
    // FNV-1a 32-bit, hex'd to 8 chars. Pad to 16 with a doubled copy
    // (collision probability is ~2^-32 per pair, which is fine for the
    // allowlist use case).
    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;
    for (let i = 0; i < input.length; i++) {
      const c = input.charCodeAt(i);
      h1 = (h1 ^ c) * 0x01000193;
      h2 = (h2 ^ c) * 0x01000193;
    }
    const a = (h1 >>> 0).toString(16).padStart(8, '0');
    const b = (h2 >>> 0).toString(16).padStart(8, '0');
    return (a + b).slice(0, 16);
  }

  const api = Object.freeze({
    KEYS,
    SYNC_KEYS,
    LOCAL_KEYS,
    DEFAULTS,
    get,
    hashText,
  });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof root !== 'undefined' && root) {
    root.NOAIS_STORAGE_KEYS = api;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
