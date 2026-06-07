// NOAIS — YouTube adapter.
//
// Targets YouTube comment elements and decorates them with a NOAIS badge.
// Designed to be safe on the 2024+ YouTube DOM (ytd-comment-renderer custom
// elements) and degrade gracefully when those elements aren't present.

(function (root) {
  'use strict';

  const ADAPTER_ID = 'youtube';

  // Hostnames this adapter applies to. Plain suffix match (no wildcards).
  const YOUTUBE_HOSTS = ['youtube.com', 'm.youtube.com', 'youtu.be'];

  function match(hostname) {
    if (!hostname) return false;
    const h = String(hostname).toLowerCase();
    for (const candidate of YOUTUBE_HOSTS) {
      if (h === candidate) return true;
      if (h.endsWith('.' + candidate)) return true;
    }
    return false;
  }

  // Find all comment-like elements within `root`. The v0.5 scope is top-level
  // ytd-comment-renderer elements (replies are out of scope).
  function findElements(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return [];
    return Array.from(root.querySelectorAll('ytd-comment-renderer'));
  }

  // Extract the visible text of a single comment. Uses #content-text which
  // is the YouTube convention for the rendered body.
  function extractText(element) {
    if (!element) return '';
    const ct = element.querySelector('#content-text');
    if (ct && typeof ct.textContent === 'string') {
      return ct.textContent.trim();
    }
    // Fallback: use the element's own textContent minus author/buttons
    return (element.textContent || '').trim();
  }

  // Decorate: add a severity CSS class + append a badge. Idempotent.
  function decorate(element, score, phraseCount) {
    if (!element || !element.classList) return;
    if (element.dataset.noaisScored === '1') {
      // Already scored — update severity class in case sensitivity changed,
      // but don't add a second badge.
      root.NOAIS_ADAPTERS.helpers.applySeverityClass(element, score);
      return;
    }
    element.dataset.noaisScored = '1';
    root.NOAIS_ADAPTERS.helpers.applySeverityClass(element, score);

    // Append badge to the content-text child if present, else to the element.
    const host = element.querySelector('#content-text') || element;
    const badge = root.NOAIS_ADAPTERS.helpers.createBadge(ADAPTER_ID, score, phraseCount || 0);
    host.appendChild(badge);
  }

  const YouTubeAdapter = {
    id: ADAPTER_ID,
    match: match,
    findElements: findElements,
    extractText: extractText,
    decorate: decorate
  };

  if (typeof module !== 'undefined' && module.exports) {
    // Node test path: export the adapter + the hosts list for tests
    module.exports = { YouTubeAdapter: YouTubeAdapter, YOUTUBE_HOSTS: YOUTUBE_HOSTS };
  } else {
    // Browser / content-script path
    root.NOAIS_YOUTUBE_ADAPTER = YouTubeAdapter;
  }
})(typeof window !== 'undefined' ? window : globalThis);
