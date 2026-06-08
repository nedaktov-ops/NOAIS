// NOAIS Why side panel script - v1.1.0
//
// Renders the current page's AI score and a per-signal breakdown.
// Listens for NOAIS_PAGE_SCORE messages sent by content.js
// and updates the DOM. Falls back to reading storage on panel open
// so the panel is never empty.
//
// XSS discipline: every visible string is rendered via textContent;
// the page never assigns to innerHTML.

(function () {
  'use strict';

  function t(key) {
    try {
      if (chrome && chrome.i18n && typeof chrome.i18n.getMessage === 'function') {
        const v = chrome.i18n.getMessage(key);
        if (v) return v;
      }
    } catch (_e) { /* fall through */ }
    return key;
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(text);
  }

  function setScore(score) {
    const n = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
    setText('score-value', String(n));
    if (n >= 70) {
      setText('score-label', t('why_panel_score_high'));
    } else if (n >= 40) {
      setText('score-label', t('why_panel_score_mid'));
    } else if (n > 0) {
      setText('score-label', t('why_panel_score_low'));
    } else {
      setText('score-label', t('why_panel_waiting'));
    }
  }

  function setBreakdown(breakdown) {
    if (!breakdown || typeof breakdown !== 'object') return;
    // Heuristics produces: typeTokenRatio, entropy, burstiness, hapaxRatio
    // (long text) or typeTokenRatio, entropy (short text).
    const ttr = breakdown.typeTokenRatio;
    const ent = breakdown.entropy;
    const bur = breakdown.burstiness;
    const hap = breakdown.hapaxRatio;
    if (typeof ttr === 'number') setText('breakdown-vocab', String(Math.round(ttr * 100)));
    if (typeof ent === 'number') setText('breakdown-perplexity', String(Math.round(ent * 10)));
    if (typeof bur === 'number') setText('breakdown-burstiness', String(Math.round(bur * 100)));
    if (typeof hap === 'number') {
      const hapEl = document.getElementById('breakdown-hapax');
      if (hapEl) hapEl.textContent = String(Math.round(hap * 100));
    }
  }

  function localise() {
    setText('panel-title', t('why_panel_title'));
    setText('score-value', t('why_panel_waiting'));
  }

  function applyScorePayload(payload) {
    if (!payload || typeof payload !== 'object') return;
    if (typeof payload.score === 'number') setScore(payload.score);
    if (payload.breakdown) setBreakdown(payload.breakdown);
  }

  function readFromStorage() {
    try {
      if (chrome && chrome.storage && chrome.storage.local &&
          typeof chrome.storage.local.get === 'function') {
        chrome.storage.local.get(['noais_page_score', 'noais_page_breakdown'], (data) => {
          if (chrome.runtime && chrome.runtime.lastError) return;
          if (data && typeof data.noais_page_score === 'number') {
            setScore(data.noais_page_score);
          }
          if (data && data.noais_page_breakdown) {
            setBreakdown(data.noais_page_breakdown);
          }
        });
      }
    } catch (_e) { /* ignore */ }
  }

  function onMessage(msg, _sender, _sendResponse) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'NOAIS_PAGE_SCORE') {
      applyScorePayload(msg.payload || msg);
    }
  }

  function wire() {
    try {
      if (chrome && chrome.runtime && chrome.runtime.onMessage &&
          typeof chrome.runtime.onMessage.addListener === 'function') {
        chrome.runtime.onMessage.addListener(onMessage);
      }
    } catch (_e) { /* ignore */ }
  }

  localise();
  wire();
  readFromStorage();
})();
