// NOAIS settings module - v0.4.0
// Pure logic. No DOM, no chrome.* APIs. Testable in plain Node.
// Exposes window.NOAIS_SETTINGS:
//   - CURATED_HOSTS              (array of 7 lowercase hostnames)
//   - parseHostname(url)        (string -> lowercase hostname or '')
//   - matches(hostname, rule)    (suffix match, returns boolean)
//   - mergeSettings(overrides)  (curated defaults + user overrides)
//   - getEffectiveSettings(blob, hostname)  ({enabled, sensitivity, site})
//   - normalizeHostnameInput(input)  (freeform -> normalized hostname or null)
//
// All public functions are defensive: bad inputs return safe defaults, never throw.

(function () {
  'use strict';

  // The 7 curated platforms. Code constant, NOT stored in chrome.storage.
  // A future release that adds an 8th entry automatically appears for all users.
  const CURATED_HOSTS = Object.freeze([
    'youtube.com',
    'facebook.com',
    'instagram.com',
    'tiktok.com',
    'twitter.com',
    'reddit.com',
    'linkedin.com',
  ]);

  // Valid hostname label: 1-63 chars, alphanumeric + hyphen, not starting/ending with hyphen.
  // Full hostname: one or more labels joined by dots. (We do not accept bare TLDs.)
  const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;
  const MAX_HOSTNAME_LEN = 253;

  /**
   * Parse a URL string and return the hostname, lowercased. Returns '' for
   * URLs without a hostname (file://, chrome://, about:, malformed, etc.).
   * Only http(s) URLs are treated as "sites"; other protocols always return ''.
   * This is defensive against URL-parser discrepancies between Node 18 and
   * Chromium for non-special schemes like chrome: and file:.
   * @param {string} url
   * @returns {string}
   */
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

  /**
   * Suffix match: does `hostname` (already lowercased) belong to `rule`?
   * Exact match or any subdomain. Rejects lookalikes (notyoutube.com).
   * @param {string} hostname
   * @param {string} rule
   * @returns {boolean}
   */
  function matches(hostname, rule) {
    if (typeof hostname !== 'string' || typeof rule !== 'string') return false;
    if (hostname.length === 0 || rule.length === 0) return false;
    const h = hostname.toLowerCase();
    const r = rule.toLowerCase();
    return h === r || h.endsWith('.' + r);
  }

  /**
   * Merge curated defaults with user overrides. Returns a flat
   * `{ hostname: boolean }` map suitable for lookups.
   * @param {object|null|undefined} overrides - user-set overrides from storage
   * @returns {object}
   */
  function mergeSettings(overrides) {
    const out = {};
    for (const h of CURATED_HOSTS) out[h] = true;
    if (overrides && typeof overrides === 'object' && !Array.isArray(overrides)) {
      for (const k of Object.keys(overrides)) {
        if (typeof k === 'string' && k.length > 0) {
          out[k.toLowerCase()] = Boolean(overrides[k]);
        }
      }
    }
    return out;
  }

  /**
   * Compute the effective settings for a given hostname.
   * Returns `{ enabled: boolean, sensitivity: 0-100, site: string|null }`.
   * The popup and content script both call this.
   * @param {object|null|undefined} stored - raw chrome.storage.local blob
   * @param {string} hostname - location.hostname (or '' for chrome://, about:)
   * @returns {{enabled:boolean, sensitivity:number, site:(string|null)}}
   */
  function getEffectiveSettings(stored, hostname) {
    const blob = stored && typeof stored === 'object' ? stored : {};
    const globalEnabled = blob.noais_enabled !== false; // missing = true
    const rawSens = blob.noais_global_sensitivity;
    const sensitivity = (typeof rawSens === 'number' && rawSens >= 0 && rawSens <= 100)
      ? rawSens
      : 100;

    const overrides = (blob.noais_site_overrides && typeof blob.noais_site_overrides === 'object')
      ? blob.noais_site_overrides
      : null;
    const merged = mergeSettings(overrides);

    // Find the matching rule for this hostname (longest match wins, just in case).
    let matchedSite = null;
    if (hostname && typeof hostname === 'string' && hostname.length > 0) {
      const h = hostname.toLowerCase();
      for (const rule of Object.keys(merged)) {
        if (matches(h, rule)) {
          if (matchedSite === null || rule.length > matchedSite.length) {
            matchedSite = rule;
          }
        }
      }
    }

    let siteEnabled = true;
    if (matchedSite !== null) {
      siteEnabled = merged[matchedSite] !== false; // missing override = true
    }

    return {
      enabled: globalEnabled && siteEnabled,
      sensitivity,
      site: matchedSite,
    };
  }

  /**
   * Normalize freeform user input ("Add custom site" field) into a clean
   * hostname. Accepts raw hostnames, full URLs, paths, ports. Returns null
   * if the input cannot be parsed into a valid hostname.
   * @param {string} input
   * @returns {string|null}
   */
  function normalizeHostnameInput(input) {
    if (typeof input !== 'string') return null;
    let s = input.trim();
    if (s.length === 0) return null;

    // If it looks like a URL with a protocol, parse it. Otherwise prepend https://
    // and try to parse.
    let hostname = '';
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
      hostname = parseHostname(s);
    } else {
      hostname = parseHostname('https://' + s);
    }
    if (!hostname) return null;

    // Strip a leading dot.
    if (hostname.startsWith('.')) hostname = hostname.slice(1);

    // Validate.
    if (hostname.length > MAX_HOSTNAME_LEN) return null;
    if (!HOSTNAME_RE.test(hostname)) return null;

    return hostname;
  }

  // Expose to content scripts and tests in the same isolated world.
  if (typeof window !== 'undefined') {
    window.NOAIS_SETTINGS = Object.freeze({
      CURATED_HOSTS,
      parseHostname,
      matches,
      mergeSettings,
      getEffectiveSettings,
      normalizeHostnameInput,
    });
  }

  // Also export for Node tests (CommonJS).
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      CURATED_HOSTS,
      parseHostname,
      matches,
      mergeSettings,
      getEffectiveSettings,
      normalizeHostnameInput,
    };
  }
})();
