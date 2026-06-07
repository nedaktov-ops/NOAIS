// Static structural tests for popup/popup.js (v0.4.0+)

'use strict';

const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const POPUP = fs.readFileSync(
  path.join(__dirname, '..', 'extension', 'popup', 'popup.js'),
  'utf8'
);

const tests = [];

tests.push({
  name: 'popup.js: depends on window.NOAIS_SETTINGS',
  fn: () => {
    assert.match(POPUP, /window\.NOAIS_SETTINGS/);
  },
});

tests.push({
  name: 'popup.js: queries chrome.tabs.query',
  fn: () => {
    assert.match(POPUP, /chrome\.tabs\.query/);
  },
});

tests.push({
  name: 'popup.js: sends NOAIS_ANALYZE_PAGE message',
  fn: () => {
    assert.match(POPUP, /NOAIS_ANALYZE_PAGE/);
  },
});

tests.push({
  name: 'popup.js: parses tab.url via settings.parseHostname',
  fn: () => {
    assert.match(POPUP, /parseHostname/);
  },
});

tests.push({
  name: 'popup.js: has openSettings handler',
  fn: () => {
    assert.match(POPUP, /chrome\.runtime\.openOptionsPage/);
    assert.match(POPUP, /onOpenSettings|openSettings/);
  },
});

tests.push({
  name: 'popup.js: has current-site status rendering',
  fn: () => {
    assert.match(POPUP, /site-status/);
    assert.match(POPUP, /renderSiteStatus/);
  },
});

tests.push({
  name: 'popup.js: persists noais_enabled',
  fn: () => {
    assert.match(POPUP, /noais_enabled/);
    assert.match(POPUP, /chrome\.storage\.local\.set/);
  },
});

tests.push({
  name: 'popup.js: does not use innerHTML',
  fn: () => {
    const codeOnly = POPUP
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n')
      .replace(/(['"`])(?:(?=(\\?))\2.)*?\1/g, '""');
    const matches = codeOnly.match(/\.innerHTML\s*=/g) || [];
    assert.strictEqual(matches.length, 0, 'popup.js must not use .innerHTML');
  },
});

module.exports = tests;
