// Static structural tests for content/content.js (v0.4.0+)
// Verifies the file uses the expected APIs and the expected entry points,
// without trying to execute the chrome.* / DOM-dependent code.

'use strict';

const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const CONTENT = fs.readFileSync(
  path.join(__dirname, '..', 'extension', 'content', 'content.js'),
  'utf8'
);

const tests = [];

tests.push({
  name: 'content.js: depends on window.NOAIS_HEURISTICS',
  fn: () => {
    assert.match(CONTENT, /window\.NOAIS_HEURISTICS/);
  },
});

tests.push({
  name: 'content.js: depends on window.NOAIS_SETTINGS',
  fn: () => {
    assert.match(CONTENT, /window\.NOAIS_SETTINGS/);
  },
});

tests.push({
  name: 'content.js: reads chrome.storage.local.get',
  fn: () => {
    assert.match(CONTENT, /chrome\.storage\.local\.get/);
  },
});

tests.push({
  name: 'content.js: registers chrome.storage.onChanged listener',
  fn: () => {
    assert.match(CONTENT, /chrome\.storage\.onChanged\.addListener/);
  },
});

tests.push({
  name: 'content.js: handles NOAIS_ANALYZE_PAGE message',
  fn: () => {
    assert.match(CONTENT, /NOAIS_ANALYZE_PAGE/);
  },
});

tests.push({
  name: 'content.js: handles NOAIS_GET_PHRASE_COUNT (backward compat)',
  fn: () => {
    assert.match(CONTENT, /NOAIS_GET_PHRASE_COUNT/);
  },
});

tests.push({
  name: 'content.js: uses location.hostname for per-site lookup',
  fn: () => {
    assert.match(CONTENT, /location\.hostname/);
  },
});

tests.push({
  name: 'content.js: passes sensitivity to heuristics.analyzeText',
  fn: () => {
    assert.match(CONTENT, /analyzeText\([^)]*sensitivity/);
  },
});

tests.push({
  name: 'content.js: has early-return path for site disabled',
  fn: () => {
    // The code should check effective.enabled and return early.
    assert.match(CONTENT, /effective\.enabled/);
    assert.match(CONTENT, /Site disabled|disabled/);
  },
});

tests.push({
  name: 'content.js: does not use innerHTML',
  fn: () => {
    const codeOnly = CONTENT
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n')
      .replace(/(['"`])(?:(?=(\\?))\2.)*?\1/g, '""');
    const matches = codeOnly.match(/\.innerHTML\s*=/g) || [];
    assert.strictEqual(matches.length, 0, 'content.js must not use .innerHTML');
  },
});

tests.push({
  name: 'content.js: no setTimeout > 5s in any code path',
  fn: () => {
    // Defensive: the setTimeout in content.js (deferred log) is 50ms, not a leak.
    const matches = CONTENT.match(/setTimeout\s*\(\s*[^,]+,\s*(\d+)/g) || [];
    for (const m of matches) {
      const ms = Number(m.match(/,\s*(\d+)/)[1]);
      assert.ok(ms <= 5000, `setTimeout too long: ${m}`);
    }
  },
});

tests.push({
  name: 'content.js: dispatches to adapters via pickAdapter()',
  fn: () => {
    assert.match(CONTENT, /function pickAdapter/);
    assert.match(CONTENT, /NOAIS_YOUTUBE_ADAPTER/);
  },
});

tests.push({
  name: 'content.js: passes shortTextMode to heuristics when adapter requests it',
  fn: () => {
    assert.match(CONTENT, /shortTextMode/);
  },
});

tests.push({
  name: 'content.js: sets up MutationObserver for adapter scan',
  fn: () => {
    assert.match(CONTENT, /MutationObserver/);
    assert.match(CONTENT, /scheduleScan/);
  },
});

tests.push({
  name: 'content.js: applies hard-mode CSS class when noais_hard_mode_sites[host] is true',
  fn: () => {
    assert.match(CONTENT, /noais-hard/);
    assert.match(CONTENT, /noais_hard_mode_sites/);
  },
});

tests.push({
  name: 'content.js: v0.7.0 banner in load log',
  fn: () => {
    assert.match(CONTENT, /v0\.7\.0/);
  },
});

module.exports = tests;
