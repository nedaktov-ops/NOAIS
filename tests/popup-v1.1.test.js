// Tests for popup v1.1.0 — sync-aware toggle + per-tab toggle + stats + "Why?" link
// TDD: these fail before the popup changes; they'll go green after the implementation.

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const POPUP_HTML = path.join(__dirname, '..', 'extension', 'popup', 'popup.html');
const POPUP_CSS  = path.join(__dirname, '..', 'extension', 'popup', 'popup.css');
const POPUP_JS   = path.join(__dirname, '..', 'extension', 'popup', 'popup.js');

const tests = [];

tests.push({
  name: 'popup v1.1: HTML loads sync-helper.js before popup.js',
  fn: () => {
    const html = fs.readFileSync(POPUP_HTML, 'utf8');
    const syncIdx = html.indexOf('core/sync-helper.js');
    const popupIdx = html.indexOf('popup.js');
    assert.ok(syncIdx >= 0, 'popup.html must reference core/sync-helper.js');
    assert.ok(popupIdx >= 0, 'popup.html must reference popup.js');
    assert.ok(syncIdx < popupIdx, 'sync-helper.js must load before popup.js');
  },
});

tests.push({
  name: 'popup v1.1: CSS width is 320px (v1.1: was 280px)',
  fn: () => {
    const css = fs.readFileSync(POPUP_CSS, 'utf8');
    assert.match(css, /width:\s*320px/, 'popup.css must set body width to 320px');
    assert.doesNotMatch(css, /width:\s*280px/, 'popup.css must not retain the 280px body width');
  },
});

tests.push({
  name: 'popup v1.1: HTML has a "Why?" footer link with id="open-why"',
  fn: () => {
    const html = fs.readFileSync(POPUP_HTML, 'utf8');
    assert.match(html, /id=["']open-why["']/, 'popup.html must contain id="open-why"');
  },
});

tests.push({
  name: 'popup v1.1: HTML has a "Disable on this site" button with id="toggle-site"',
  fn: () => {
    const html = fs.readFileSync(POPUP_HTML, 'utf8');
    assert.match(html, /id=["']toggle-site["']/, 'popup.html must contain id="toggle-site"');
    assert.match(html, /__MSG_popup_toggle_site__/, 'toggle-site label must use the i18n key popup_toggle_site');
  },
});

tests.push({
  name: 'popup v1.1: popup.js uses NOAIS_SYNC for reads of noais_enabled and writes to chrome.storage.sync indirectly',
  fn: () => {
    const src = fs.readFileSync(POPUP_JS, 'utf8');
    // The popup should go through NOAIS_SYNC for the sync keys, not chrome.storage.local.
    // It still uses chrome.storage.local for the per-site overrides (which stay local).
    assert.match(src, /NOAIS_SYNC/, 'popup.js must reference NOAIS_SYNC');
    assert.doesNotMatch(
      src,
      /chrome\.storage\.local\.(?:get|set)\([^)]*noais_enabled/,
      'popup.js must not read/write noais_enabled via chrome.storage.local (use NOAIS_SYNC instead)'
    );
  },
});

tests.push({
  name: 'popup v1.1: toggle-site click sends NOAIS_TOGGLE_SITE to the content script',
  fn: () => {
    const src = fs.readFileSync(POPUP_JS, 'utf8');
    assert.match(src, /NOAIS_TOGGLE_SITE/, 'popup.js must reference NOAIS_TOGGLE_SITE message type');
  },
});

tests.push({
  name: 'popup v1.1: open-why click sends OPEN_WHY_PANEL via chrome.runtime.sendMessage',
  fn: () => {
    const src = fs.readFileSync(POPUP_JS, 'utf8');
    assert.match(src, /OPEN_WHY_PANEL/, 'popup.js must reference OPEN_WHY_PANEL message type');
    // The handler should send via chrome.runtime.sendMessage (background opens the panel).
    const handlesOpenWhy =
      /chrome\.runtime\.sendMessage\(\s*\{\s*type:\s*['"]OPEN_WHY_PANEL['"]/.test(src) ||
      /chrome\.runtime\.sendMessage\(\s*\{\s*type:\s*['"]OPEN_WHY_PANEL['"][^}]*\}/.test(src);
    assert.ok(handlesOpenWhy, 'popup.js must sendMessage({type: "OPEN_WHY_PANEL"})');
  },
});

tests.push({
  name: 'popup v1.1: popup.js has no .innerHTML assignment (XSS discipline)',
  fn: () => {
    const src = fs.readFileSync(POPUP_JS, 'utf8');
    const codeOnly = src
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n')
      .replace(/(['"`])(?:(?=(\\?))\2.)*?\1/g, '""');
    const matches = codeOnly.match(/\.innerHTML\s*=/g) || [];
    assert.strictEqual(matches.length, 0, 'popup.js must not use .innerHTML');
  },
});

module.exports = tests;
