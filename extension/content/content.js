// NOAIS content script - v0.3.0
// Scans the current page for AI-generated content using two methods:
//   1. Hard-coded AI-phrase counter (v0.2, kept for backwards compat).
//   2. Heuristic statistical analysis (v0.3): burstiness, TTR, entropy, hapax.
// Pure on-device, no network calls, no models.

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
   * Run the full analysis on the current page's visible text.
   * @returns {{ok:boolean, count:number, score:number, wordCount:number, breakdown:object, error?:string}}
   */
  function analyzePage() {
    const text = (document.body && document.body.innerText) || '';
    const count = countAiPhrasesInText(text);

    const heuristics =
      typeof window !== 'undefined' ? window.NOAIS_HEURISTICS : null;
    if (!heuristics || typeof heuristics.analyzeText !== 'function') {
      return { ok: false, count, score: 0, wordCount: 0, breakdown: {}, error: 'Heuristics module not loaded' };
    }

    try {
      const result = heuristics.analyzeText(text);
      return {
        ok: true,
        count,
        score: Number(result.score) || 0,
        wordCount: Number(result.wordCount) || 0,
        breakdown: result.breakdown || {},
      };
    } catch (err) {
      return { ok: false, count, score: 0, wordCount: 0, breakdown: {}, error: String(err && err.message ? err.message : err) };
    }
  }

  // Log once on load so the headless test can confirm the script ran.
  try {
    const r = analyzePage();
    console.log(
      `[NOAIS content] v0.3.0 loaded on ${location.href}; phrases: ${r.count}, score: ${r.score}/100, words: ${r.wordCount}`
    );
  } catch (e) {
    /* innerText may throw on detached documents; ignore */
  }

  // Listen for popup requests.
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
})();
