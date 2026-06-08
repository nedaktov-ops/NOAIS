// Tests for options v1.1.0 — sync-aware sensitivity + hard-mode sites
// card + sync indicator + tab-overrides cleanup wiring.
//
// TDD: these fail before the options v1.1 changes.

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const OPTIONS_HTML = path.join(__dirname, '..', 'extension', 'options', 'options.html');
const OPTIONS_JS   = path.join(__dirname, '..', 'extension', 'options', 'options.js');
const SETTINGS_JS  = path.join(__dirname, '..', 'extension', 'core', 'settings.js');
const SYNC_HELPER  = path.join(__dirname, '..', 'extension', 'core', 'sync-helper.js');
const STORAGE_KEYS = path.join(__dirname, '..', 'extension', 'core', 'storage-keys.js');

const tests = [];

tests.push({
  name: 'options v1.1: HTML loads storage-keys + sync-helper + settings before options.js',
  fn: () => {
    const html = fs.readFileSync(OPTIONS_HTML, 'utf8');
    const skIdx = html.indexOf('core/storage-keys.js');
    const syncIdx = html.indexOf('core/sync-helper.js');
    const setIdx = html.indexOf('core/settings.js');
    const optIdx = html.indexOf('options.js');
    assert.ok(skIdx >= 0, 'must reference storage-keys.js');
    assert.ok(syncIdx >= 0, 'must reference sync-helper.js');
    assert.ok(setIdx >= 0, 'must reference settings.js');
    assert.ok(optIdx >= 0, 'must reference options.js');
    assert.ok(skIdx < syncIdx, 'storage-keys before sync-helper');
    assert.ok(syncIdx < setIdx, 'sync-helper before settings');
    assert.ok(setIdx < optIdx, 'settings before options');
  },
});

tests.push({
  name: 'options v1.1: HTML has a hard-mode sites card with id="hard-mode-card"',
  fn: () => {
    const html = fs.readFileSync(OPTIONS_HTML, 'utf8');
    assert.match(html, /id=["']hard-mode-card["']/,
                 'options.html must have id="hard-mode-card" for the v1.1 hard-mode sites card');
    assert.match(html, /__MSG_options_hard_mode_card_title__/,
                 'hard-mode card must use the i18n key options_hard_mode_card_title');
  },
});

tests.push({
  name: 'options v1.1: HTML has a sync-status indicator with id="sync-status"',
  fn: () => {
    const html = fs.readFileSync(OPTIONS_HTML, 'utf8');
    assert.match(html, /id=["']sync-status["']/,
                 'options.html must have id="sync-status" for the v1.1 sync indicator');
  },
});

tests.push({
  name: 'options v1.1: options.js routes sensitivity through NOAIS_SYNC',
  fn: () => {
    const src = fs.readFileSync(OPTIONS_JS, 'utf8');
    assert.match(src, /NOAIS_SYNC/, 'options.js must reference NOAIS_SYNC');
    // sensitivity is a sync key, so it should NOT be in a direct
    // chrome.storage.local.set/get with noais_global_sensitivity.
    const writesSensLocal =
      /chrome\.storage\.local\.(?:get|set)\([^)]*noais_global_sensitivity/.test(src);
    assert.ok(!writesSensLocal,
      'options.js must not read/write noais_global_sensitivity via chrome.storage.local (use NOAIS_SYNC instead)');
  },
});

tests.push({
  name: 'options v1.1: options.js sets noais_hard_mode_sites via NOAIS_SYNC when a hard-mode site is added',
  fn: () => {
    const src = fs.readFileSync(OPTIONS_JS, 'utf8');
    assert.match(src, /noais_hard_mode_sites/,
                 'options.js must reference the noais_hard_mode_sites key');
  },
});

tests.push({
  name: 'options v1.1: options.js listens to storage.onChanged for cross-tab sync',
  fn: () => {
    const src = fs.readFileSync(OPTIONS_JS, 'utf8');
    assert.match(src, /storage\.onChanged\.addListener/,
                 'options.js must register a storage.onChanged listener');
  },
});

tests.push({
  name: 'options v1.1: options.js sets the sync indicator based on chrome.storage.sync availability',
  fn: () => {
    const src = fs.readFileSync(OPTIONS_JS, 'utf8');
    // The sync indicator should be set when the page loads (no 'sync' text is
    // an acceptable error). At minimum, the script must reference
    // sync-status and chrome.storage.sync.
    assert.match(src, /sync[_-]?status|syncStatus/i,
                 'options.js must reference the sync indicator element id');
    assert.match(src, /chrome\.storage\.sync/,
                 'options.js must probe chrome.storage.sync to decide the indicator state');
  },
});

tests.push({
  name: 'options v1.1: options.js does not use .innerHTML (XSS discipline)',
  fn: () => {
    const src = fs.readFileSync(OPTIONS_JS, 'utf8');
    const codeOnly = src
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n')
      .replace(/(['"`])(?:(?=(\\?))\2.)*?\1/g, '""');
    const matches = codeOnly.match(/\.innerHTML\s*=/g) || [];
    assert.strictEqual(matches.length, 0, 'options.js must not use .innerHTML');
  },
});

module.exports = tests;
