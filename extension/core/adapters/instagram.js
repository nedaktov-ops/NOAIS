// NOAIS — Instagram adapter.
//
// Targets Instagram post and reel containers. Instagram's 2024+ web UI
// uses <article> for each post in the feed (and nested <article> nodes
// for carousel slides, quoted shares, etc.). Text bodies live in
// <div dir="auto"> descendants. We pick the first one whose text is at
// least 30 characters long — that skips button labels and reactions
// while still catching short-form captions.

(function (root) {
  'use strict';

  const ADAPTER_ID = 'instagram';

  // Hostname match. Matches bare apex, www, m, and any subdomain.
  // 'notinstagram.com' is correctly rejected because we require a leading
  // dot before the suffix.
  function match(hostname) {
    if (!hostname) return false;
    const h = String(hostname).toLowerCase();
    if (h === 'instagram.com') return true;
    if (h === 'www.instagram.com') return true;
    if (h === 'm.instagram.com') return true;
    if (h.endsWith('.instagram.com')) return true;
    return false;
  }

  // Walk the tree and gather ALL <article> elements, including nested
  // ones (carousel slides, quoted shares, etc.). Done explicitly so the
  // gather is robust regardless of any browser quirks in querySelectorAll.
  function findElements(root) {
    if (!root) return [];
    const out = [];
    walk(root, out);
    return out;
  }

  function walk(node, out) {
    if (!node) return;
    if (node.tagName === 'ARTICLE') out.push(node);
    const children = node.children || [];
    for (const c of children) walk(c, out);
  }

  // Returns the first [dir="auto"] descendant whose trimmed text is at
  // least 30 characters long. Returns null when no descendant qualifies
  // (caller can short-circuit instead of scoring a button label).
  function extractText(element) {
    if (!element || typeof element.querySelectorAll !== 'function') return null;
    const candidates = element.querySelectorAll('[dir="auto"]');
    for (const node of candidates) {
      const text = (node && node.textContent ? node.textContent : '').trim();
      if (text.length >= 30) return text;
    }
    return null;
  }

  function decorate(element, score, phraseCount) {
    if (!element || !element.classList) return;
    if (element.dataset.noaisScored === '1') {
      root.NOAIS_ADAPTERS.helpers.applySeverityClass(element, score);
      return;
    }
    element.dataset.noaisScored = '1';
    root.NOAIS_ADAPTERS.helpers.applySeverityClass(element, score);

    // Append the badge to the body container if we found one, else to
    // the article element itself.
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

  const InstagramAdapter = {
    id: ADAPTER_ID,
    match: match,
    findElements: findElements,
    extractText: extractText,
    decorate: decorate,
    shortTextMode: true
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { InstagramAdapter: InstagramAdapter };
  } else {
    root.NOAIS_INSTAGRAM_ADAPTER = InstagramAdapter;
  }
})(typeof window !== 'undefined' ? window : globalThis);
