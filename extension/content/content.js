// NOAIS content script - v0.2.0
// Scans the current page for common AI-generated phrases and reports the
// total count to the popup on demand. Pure on-device, no network calls.

(function () {
  'use strict';

  // Five hard-coded AI-typical phrases. Case-insensitive.
  // These are phrases humans almost never use, but AI assistants often do.
  const AI_PHRASES = [
    'as an ai language model',
    'i am an ai',
    "i'm an ai",
    "i don't have personal",
    'i cannot browse',
  ];

  /**
   * Count the number of times any AI phrase appears in the page text.
   * Uses innerText (visible text only), scans once per call.
   * @returns {number}
   */
  function countAiPhrases() {
    const text = (document.body && document.body.innerText) || '';
    if (!text) return 0;
    let total = 0;
    for (const phrase of AI_PHRASES) {
      // Escape regex special chars.
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'gi');
      const matches = text.match(regex);
      if (matches) total += matches.length;
    }
    return total;
  }

  // Log once on load so the headless test can confirm the script ran.
  try {
    console.log(
      `[NOAIS content] v0.2.0 loaded on ${location.href}; initial count: ${countAiPhrases()}`
    );
  } catch (e) {
    /* innerText may throw on detached documents; ignore */
  }

  // Listen for popup requests.
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message !== 'object') return false;
    if (message.type === 'NOAIS_GET_PHRASE_COUNT') {
      try {
        const count = countAiPhrases();
        sendResponse({ ok: true, count });
      } catch (err) {
        sendResponse({ ok: false, error: String(err && err.message ? err.message : err) });
      }
      return false; // synchronous response
    }
    return false;
  });
})();
