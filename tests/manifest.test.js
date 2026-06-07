// Static structural tests for manifest.json (v0.4.0+)

'use strict';

const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const MANIFEST = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '..', 'extension', 'manifest.json'),
    'utf8'
  )
);

const tests = [];

tests.push({
  name: 'manifest: version is 0.4.0',
  fn: () => {
    assert.strictEqual(MANIFEST.version, '0.4.0');
  },
});

tests.push({
  name: 'manifest: has options_ui with open_in_tab: true',
  fn: () => {
    assert.ok(MANIFEST.options_ui, 'options_ui is missing');
    assert.strictEqual(MANIFEST.options_ui.page, 'options/options.html');
    assert.strictEqual(MANIFEST.options_ui.open_in_tab, true);
  },
});

tests.push({
  name: 'manifest: has a stable key field (extension ID)',
  fn: () => {
    assert.ok(typeof MANIFEST.key === 'string', 'key is missing or not a string');
    assert.ok(MANIFEST.key.length > 1000, 'key looks too short to be a 2048-bit RSA key');
  },
});

tests.push({
  name: 'manifest: content_scripts ordering: heuristics, settings, content',
  fn: () => {
    const js = MANIFEST.content_scripts[0].js;
    const hIdx = js.indexOf('core/heuristics.js');
    const sIdx = js.indexOf('core/settings.js');
    const cIdx = js.indexOf('content/content.js');
    assert.ok(hIdx >= 0, 'heuristics.js not in content_scripts');
    assert.ok(sIdx >= 0, 'settings.js not in content_scripts');
    assert.ok(cIdx >= 0, 'content.js not in content_scripts');
    assert.ok(hIdx < sIdx, 'heuristics.js must load before settings.js');
    assert.ok(sIdx < cIdx, 'settings.js must load before content.js');
  },
});

tests.push({
  name: 'manifest: Firefox min version is 121 (matches service-worker support)',
  fn: () => {
    assert.strictEqual(
      MANIFEST.browser_specific_settings.gecko.strict_min_version,
      '121.0'
    );
  },
});

tests.push({
  name: 'manifest: manifest_version is 3',
  fn: () => {
    assert.strictEqual(MANIFEST.manifest_version, 3);
  },
});

tests.push({
  name: 'manifest: permissions include storage and activeTab',
  fn: () => {
    assert.ok(MANIFEST.permissions.includes('storage'));
    assert.ok(MANIFEST.permissions.includes('activeTab'));
  },
});

tests.push({
  name: 'manifest: host_permissions is <all_urls>',
  fn: () => {
    assert.ok(MANIFEST.host_permissions.includes('<all_urls>'));
  },
});

tests.push({
  name: 'manifest: background.service_worker points to background/background.js',
  fn: () => {
    assert.strictEqual(MANIFEST.background.service_worker, 'background/background.js');
  },
});

tests.push({
  name: 'manifest: action.default_popup points to popup/popup.html',
  fn: () => {
    assert.strictEqual(MANIFEST.action.default_popup, 'popup/popup.html');
  },
});

tests.push({
  name: 'manifest: icons declared at 16/32/48/128',
  fn: () => {
    for (const size of ['16', '32', '48', '128']) {
      assert.strictEqual(
        MANIFEST.icons[size],
        `icons/icon-${size}.png`,
        `icons.${size} is missing or wrong`
      );
    }
  },
});

module.exports = tests;
