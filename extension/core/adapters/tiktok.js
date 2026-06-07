// NOAIS — TikTok adapter.
//
// Targets TikTok comment elements. The current TikTok web UI uses
// stable [data-e2e] test hooks: [data-e2e="comment-item"] for the
// container and [data-e2e="comment-text"] for the body. We fall back
// to the first <p>/<span> descendant with >= 30 chars in case TikTok
// renames their e2e hooks in a future release.

(function (root) {
  'use strict';

  const ADAPTER_ID = 'tiktok';

  function match(hostname) {
    if (!hostname) return false;
    const h = String(hostname).toLowerCase();
    if (h === 'tiktok.com') return true;
    if (h === 'www.tiktok.com') return true;
    if (h === 'm.tiktok.com') return true;
    if (h.endsWith('.tiktok.com')) return true;
    return false;
  }

  function findElements(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return [];
    return Array.from(root.querySelectorAll('[data-e2e="comment-item"]'));
  }

  // Primary: first [data-e2e="comment-text"] descendant.
  // Fallback: first <p> or <span> descendant whose trimmed textContent
  // is at least 30 characters. Returns '' if nothing qualifies.
  function extractText(element) {
    if (!element) return '';
    if (typeof element.querySelectorAll === 'function') {
      const primary = element.querySelectorAll('[data-e2e="comment-text"]');
      for (const node of primary) {
        const text = (node && node.textContent ? node.textContent : '').trim();
        if (text) return text;
      }
      const fallback = element.querySelectorAll('p, span');
      for (const node of fallback) {
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

    // Append badge into the body container if we can find one,
    // otherwise into the element itself.
    let host = element;
    if (typeof element.querySelectorAll === 'function') {
      const primary = element.querySelectorAll('[data-e2e="comment-text"]');
      for (const node of primary) {
        const t = (node && node.textContent ? node.textContent : '').trim();
        if (t) { host = node; break; }
      }
      if (host === element) {
        const fallback = element.querySelectorAll('p, span');
        for (const node of fallback) {
          const t = (node && node.textContent ? node.textContent : '').trim();
          if (t.length >= 30) { host = node; break; }
        }
      }
    }
    const badge = root.NOAIS_ADAPTERS.helpers.createBadge(ADAPTER_ID, score, phraseCount || 0);
    host.appendChild(badge);
  }

  const TikTokAdapter = {
    id: ADAPTER_ID,
    match: match,
    findElements: findElements,
    extractText: extractText,
    decorate: decorate,
    shortTextMode: true
  };

  const TIKTOK_HOSTS = ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com'];

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TikTokAdapter: TikTokAdapter, TIKTOK_HOSTS: TIKTOK_HOSTS };
  } else {
    root.NOAIS_TIKTOK_ADAPTER = TikTokAdapter;
  }
})(typeof window !== 'undefined' ? window : globalThis);
