// NOAIS popup script - v0.3.0
// - Toggle persistence (chrome.storage.local)
// - Queries the active tab's content script for full page analysis
// - Renders the AI-likely score (0-100) with a colour-coded bar
// - Renders the hard-coded AI phrase count
// - Renders the word count for transparency

(function () {
  'use strict';

  const STORAGE_KEY = 'noais_enabled';
  const MESSAGE_TYPE = 'NOAIS_ANALYZE_PAGE';

  const toggleEl = document.getElementById('toggle');
  const statusEl = document.getElementById('toggle-label');
  const scoreEl = document.getElementById('score-value');
  const scoreBarEl = document.getElementById('score-bar-fill');
  const wordCountEl = document.getElementById('word-count');
  const countEl = document.getElementById('scan-count');

  if (!toggleEl || !statusEl || !scoreEl || !scoreBarEl || !wordCountEl || !countEl) {
    console.error('NOAIS popup: required DOM elements not found.');
    return;
  }

  // --- Toggle state -----------------------------------------------------

  function renderStatus(enabled) {
    if (enabled) {
      statusEl.textContent = 'Active';
      statusEl.classList.add('active');
      statusEl.setAttribute('aria-label', 'NOAIS is active');
    } else {
      statusEl.textContent = 'Inactive';
      statusEl.classList.remove('active');
      statusEl.setAttribute('aria-label', 'NOAIS is inactive');
    }
  }

  function loadToggleState() {
    try {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        const enabled = Boolean(result && result[STORAGE_KEY]);
        toggleEl.checked = enabled;
        renderStatus(enabled);
      });
    } catch (err) {
      console.error('NOAIS popup: failed to load state', err);
      renderStatus(false);
    }
  }

  function saveToggleState(enabled) {
    try {
      chrome.storage.local.set({ [STORAGE_KEY]: enabled }, () => {
        if (chrome.runtime.lastError) {
          console.error('NOAIS popup: storage error', chrome.runtime.lastError);
        }
      });
    } catch (err) {
      console.error('NOAIS popup: failed to save state', err);
    }
  }

  // --- Score rendering --------------------------------------------------

  function severityForScore(score) {
    if (score <= 30) return 'zero';
    if (score <= 60) return 'low';
    return 'high';
  }

  function renderScore(score) {
    const sev = severityForScore(score);
    scoreEl.classList.remove('zero', 'low', 'high', 'error');
    scoreEl.classList.add(sev);
    scoreEl.textContent = score + '%';
    scoreBarEl.classList.remove('zero', 'low', 'high', 'error');
    scoreBarEl.classList.add(sev);
    scoreBarEl.style.width = Math.max(2, Math.min(100, score)) + '%';
  }

  function renderScoreError(message) {
    scoreEl.classList.remove('zero', 'low', 'high');
    scoreEl.classList.add('error');
    scoreEl.textContent = message;
    scoreBarEl.classList.remove('zero', 'low', 'high', 'error');
    scoreBarEl.style.width = '0%';
  }

  // --- Phrase count rendering ------------------------------------------

  function severityForCount(count) {
    if (count === 0) return 'zero';
    if (count <= 2) return 'low';
    return 'high';
  }

  function renderCount(count) {
    countEl.classList.remove('zero', 'low', 'high', 'error');
    countEl.classList.add(severityForCount(count));
    countEl.textContent = String(count);
  }

  function renderCountError(message) {
    countEl.classList.remove('zero', 'low', 'high');
    countEl.classList.add('error');
    countEl.textContent = message;
  }

  // --- Word count rendering --------------------------------------------

  function renderWordCount(n) {
    if (typeof n === 'number' && n > 0) {
      wordCountEl.textContent = n.toLocaleString() + ' words analysed';
    } else {
      wordCountEl.textContent = '';
    }
  }

  // --- Query active tab -------------------------------------------------

  function queryActiveTab() {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = Array.isArray(tabs) && tabs[0];
        if (!tab || typeof tab.id !== 'number') {
          renderScoreError('No active tab');
          renderCountError('—');
          renderWordCount(0);
          return;
        }
        try {
          chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPE }, (response) => {
            if (chrome.runtime.lastError) {
              // No content script on this page (chrome://, about:, PDF, store).
              renderScoreError('N/A');
              renderCountError('N/A');
              renderWordCount(0);
              return;
            }
            if (response && response.ok) {
              renderScore(typeof response.score === 'number' ? response.score : 0);
              renderCount(typeof response.count === 'number' ? response.count : 0);
              renderWordCount(typeof response.wordCount === 'number' ? response.wordCount : 0);
            } else {
              const msg = (response && response.error) ? response.error : 'No response';
              renderScoreError(msg);
              renderCountError(msg);
              renderWordCount(0);
            }
          });
        } catch (err) {
          renderScoreError('Send failed');
          renderCountError('Send failed');
          renderWordCount(0);
          console.error('NOAIS popup: sendMessage failed', err);
        }
      });
    } catch (err) {
      renderScoreError('Query failed');
      renderCountError('Query failed');
      renderWordCount(0);
      console.error('NOAIS popup: tabs.query failed', err);
    }
  }

  // --- Wire up ----------------------------------------------------------

  loadToggleState();
  queryActiveTab();

  toggleEl.addEventListener('change', (event) => {
    const target = /** @type {HTMLInputElement} */ (event.target);
    const enabled = Boolean(target.checked);
    renderStatus(enabled);
    saveToggleState(enabled);
  });
})();
