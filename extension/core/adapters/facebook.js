// NOAIS — Facebook adapter.
//
// Targets Facebook post + comment elements. The 2024+ FB UI uses
// [role="article"] for both posts and top-level comments in the news feed.
// Text content lives in nested <div dir="auto"> elements. We pick the
// first one that has text long enough to be the actual body (not a button
// label like "Like" / "Reply").

(function (root) {
  'use strict';

  const ADAPTER_ID = 'facebook';

  const FACEBOOK_HOSTS = ['facebook.com', 'm.facebook.com', 'fb.com', 'fb.me'];

  function match(hostname) {
    if (!hostname) return false;
    const h = String(hostname).toLowerCase();
    for (const candidate of FACEBOOK_HOSTS) {
      if (h === candidate) return true;
      if (h.endsWith('.' + candidate)) return true;
    }
    return false;
  }

  function findElements(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return [];
    return Array.from(root.querySelectorAll('[role="article"]'));
  }

  // Returns the first [dir="auto"] descendant whose text is at least 30
  // characters long. Skips "Like" / "Reply" / "Share" labels.
  function extractText(element) {
    if (!element) return '';
    if (typeof element.querySelectorAll === 'function') {
      const candidates = element.querySelectorAll('[dir="auto"]');
      for (const node of candidates) {
        const text = (node && node.textContent ? node.textContent : '').trim();
        if (text.length >= 30) return text;
      }
    }
    return (element.textContent || '').trim();
  }

  function decorate(element, score, phraseCount) {
    if (!element || !element.classList) return;
    if (element.dataset.noaisScored === '1') {
      root.NOAIS_ADAPTERS.helpers.applySeverityClass(element, score);
      return;
    }
    element.dataset.noaisScored = '1';
    root.NOAIS_ADAPTERS.helpers.applySeverityClass(element, score);

    // Append badge to the body container if we found one, else to the element.
    let host = element;
    if (typeof element.querySelectorAll === 'function') {
      const candidates = element.querySelectorAll('[dir="auto"]');
      for (const node of candidates) {
        const t = (node && node.textContent ? node.textContent : '').trim();
        if (t.length >= 30) { host = node; break; }
      }
    }
    const badge = root.NOAIS_ADAPTERS.helpers.createBadge(ADAPTER_ID, score, phraseCount || 0);
    host.appendChild(badge);
  }

  const FacebookAdapter = {
    id: ADAPTER_ID,
    match: match,
    findElements: findElements,
    extractText: extractText,
    decorate: decorate,
    shortTextMode: true
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FacebookAdapter: FacebookAdapter, FACEBOOK_HOSTS: FACEBOOK_HOSTS };
  } else {
    root.NOAIS_FACEBOOK_ADAPTER = FacebookAdapter;
  }
})(typeof window !== 'undefined' ? window : globalThis);
