// NOAIS — base adapter interface and shared helpers.
//
// An adapter is a plain object (or class instance) that knows how to find
// platform-specific "comment-like" elements, extract their visible text,
// and decorate them with a NOAIS badge. Adapters run in the content-script
// world, so they touch the DOM directly.
//
// Contract:
// adapter.id string, e.g. 'youtube'
// adapter.match(hostname) -> boolean
// adapter.findElements(root) -> Element[] (live or static, both OK)
// adapter.extractText(element) -> string
// adapter.decorate(element, score, count, breakdown) -> void (no innerHTML!)
//   breakdown: optional v1.1 heuristics breakdown object (serialised into
//   data-noais-breakdown on the badge so the tooltip can display it).
//
// All adapters MUST be safe to call repeatedly on the same element; they
// should check `element.dataset.noaisScored` and no-op if already scored.

(function (root) {
  'use strict';

  // Severity from a 0..100 score.
  function severityFromScore(score) {
    if (score <= 30) return 'zero';
    if (score <= 60) return 'low';
    return 'high';
  }

// Create a badge DOM element. NEVER uses innerHTML — uses textContent.
// Caller appends it; we don't touch the host element.
// v1.1 second arg: optional breakdown object. Serialised into data-noais-breakdown.
function createBadge(id, score, phraseCount, breakdown) {
  const span = document.createElement('span');
  span.className = 'noais-badge noais-badge-' + severityFromScore(score);
  span.dataset.noaisBadge = '1';
  if (breakdown) {
    try { span.dataset.noaisBreakdown = JSON.stringify(breakdown); }
    catch (_e) {}
  }
  span.setAttribute('role', 'status');
  span.setAttribute('aria-label', 'NOAIS score ' + score + ' of 100');

  const label = document.createElement('span');
  label.className = 'noais-badge-label';
  label.textContent = 'NOAIS';
  span.appendChild(label);

  const num = document.createElement('span');
  num.className = 'noais-badge-num';
  num.textContent = String(score);
  span.appendChild(num);

  if (phraseCount > 0) {
    const pc = document.createElement('span');
    pc.className = 'noais-badge-phrases';
    pc.textContent = '+' + phraseCount + ' phrase' + (phraseCount === 1 ? '' : 's');
    span.appendChild(pc);
  }

  // Carry the adapter id for tests + future debug
  span.dataset.noaisAdapter = id;
  return span;
}

  // Apply or update the severity class on the element. Idempotent.
  function applySeverityClass(element, score) {
    const sev = severityFromScore(score);
    element.classList.remove('noais-score-zero', 'noais-score-low', 'noais-score-high');
    element.classList.add('noais-score-' + sev);
  }

  // Decide whether a text is too short to score. We need *some* signal
  // but a 3-word "first!" comment should not get a badge.
  function shouldScore(text) {
    if (typeof text !== 'string') return false;
    const trimmed = text.trim();
    if (trimmed.length < 30) return false; // <30 chars
    // Also require at least 5 whitespace-separated tokens
    if (trimmed.split(/\s+/).length < 5) return false;
    return true;
  }

  const NOAIS_ADAPTERS = {
    BaseAdapter: {
      id: 'base',
      match: function () { return false; },
      findElements: function () { return []; },
      extractText: function () { return ''; },
      decorate: function () { /* noop */ }
    },
    helpers: {
      severityFromScore: severityFromScore,
      createBadge: createBadge,
      applySeverityClass: applySeverityClass,
      shouldScore: shouldScore
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    // Node test path
    module.exports = NOAIS_ADAPTERS;
  } else {
    // Browser / content-script path
    root.NOAIS_ADAPTERS = NOAIS_ADAPTERS;
  }
})(typeof window !== 'undefined' ? window : globalThis);
