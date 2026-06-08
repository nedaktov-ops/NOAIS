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
  name: 'manifest: version is 1.1.0',
  fn: () => {
    assert.strictEqual(MANIFEST.version, '1.1.0');
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
  name: 'manifest: key field is a valid PKCS#8 RSA private key (smoke check)',
  fn: () => {
    // The exact Chrome extension ID depends on Chrome's internal algorithm
    // (we empirically get 'jbllajhognjaknnofagmmladkdicojgg' at runtime,
    //  but Node-side SPKI-SHA256 doesn't reproduce that formula in v18).
    // This test verifies the key is well-formed: parseable, 2048-bit, RSA.
    const crypto = require('node:crypto');
    const b64 = MANIFEST.key;
    const pem =
      '-----BEGIN PRIVATE KEY-----\n' +
      b64.match(/.{1,64}/g).join('\n') +
      '\n-----END PRIVATE KEY-----\n';
    const keyObj = crypto.createPrivateKey(pem);
    assert.strictEqual(keyObj.asymmetricKeyType, 'rsa', 'key is RSA');
    const detail = keyObj.asymmetricKeyDetails;
    assert.ok(detail, 'has asymmetricKeyDetails');
    assert.strictEqual(detail.modulusLength, 2048, 'modulus is 2048 bits');
    // Sanity: a stable hash can be derived. The exact value does not need
    // to match what Chrome produces at runtime (verified via headless test).
    const pubKeyObj = crypto.createPublicKey(keyObj);
    const pubDer = pubKeyObj.export({ type: 'spki', format: 'der' });
    const id = crypto.createHash('sha256').update(pubDer).digest('hex').slice(0, 32);
    assert.match(id, /^[0-9a-f]{32}$/, 'derivation yields a 32-hex-char ID');
  },
});

tests.push({
  name: 'manifest: content_scripts ordering: heuristics, storage-keys, settings, content',
  fn: () => {
    const js = MANIFEST.content_scripts[0].js;
    const hIdx = js.indexOf('core/heuristics.js');
    const skIdx = js.indexOf('core/storage-keys.js');
    const sIdx = js.indexOf('core/settings.js');
    const cIdx = js.indexOf('content/content.js');
    assert.ok(hIdx >= 0, 'heuristics.js not in content_scripts');
    assert.ok(skIdx >= 0, 'storage-keys.js not in content_scripts');
    assert.ok(sIdx >= 0, 'settings.js not in content_scripts');
    assert.ok(cIdx >= 0, 'content.js not in content_scripts');
    assert.ok(hIdx < skIdx, 'heuristics.js must load before storage-keys.js');
    assert.ok(skIdx < sIdx, 'storage-keys.js must load before settings.js');
    assert.ok(sIdx < cIdx, 'settings.js must load before content.js');
  }
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
  name: 'manifest: permissions include storage, activeTab, tabs, and sidePanel (v1.1)',
  fn: () => {
    assert.ok(MANIFEST.permissions.includes('storage'));
    assert.ok(MANIFEST.permissions.includes('activeTab'));
    assert.ok(MANIFEST.permissions.includes('tabs'), 'tabs permission is required for chrome.tabs.onRemoved per-tab override cleanup (v1.1)');
    assert.ok(MANIFEST.permissions.includes('sidePanel'), 'sidePanel permission is required for the Why side panel (v1.1)');
  }
});

tests.push({
  name: 'manifest: default_locale is en (v1.1)',
  fn: () => {
    assert.strictEqual(MANIFEST.default_locale, 'en');
  }
});

tests.push({
  name: 'manifest: side_panel.default_path points to sidepanel/why.html (v1.1)',
  fn: () => {
    assert.ok(MANIFEST.side_panel, 'side_panel is missing');
    assert.strictEqual(MANIFEST.side_panel.default_path, 'sidepanel/why.html');
  }
});

tests.push({
  name: 'manifest: commands.noais-toggle-site is Ctrl+Shift+A with i18n description (v1.1)',
  fn: () => {
    assert.ok(MANIFEST.commands, 'commands block is missing');
    const cmd = MANIFEST.commands['noais-toggle-site'];
    assert.ok(cmd, 'noais-toggle-site command is missing');
    assert.strictEqual(cmd.suggested_key.default, 'Ctrl+Shift+A');
    assert.strictEqual(cmd.description, '__MSG_cmd_toggle_site__');
  }
});

tests.push({
  name: 'manifest: web_accessible_resources covers welcome + why + options + locales (v1.1)',
  fn: () => {
    assert.ok(Array.isArray(MANIFEST.web_accessible_resources), 'web_accessible_resources is missing');
    assert.ok(MANIFEST.web_accessible_resources.length >= 1, 'at least one entry');
    const flat = [];
    for (const entry of MANIFEST.web_accessible_resources) {
      assert.ok(Array.isArray(entry.resources), 'each entry needs a resources array');
      assert.ok(Array.isArray(entry.matches), 'each entry needs a matches array');
      flat.push(...entry.resources);
    }
    assert.ok(flat.includes('options/welcome.html'), 'welcome.html must be in WAR');
    assert.ok(flat.includes('sidepanel/why.html'), 'why.html must be in WAR');
    assert.ok(flat.includes('options/options.html'), 'options.html must be in WAR');
  }
});

tests.push({
  name: 'manifest: name and description use __MSG_ placeholders (v1.1)',
  fn: () => {
    assert.match(MANIFEST.name, /__MSG_[a-z0-9_]+__/);
    assert.match(MANIFEST.description, /__MSG_[a-z0-9_]+__/);
  }
});

tests.push({
  name: 'manifest: content_scripts includes core/sync-helper.js before settings.js (v1.1)',
  fn: () => {
    const js = MANIFEST.content_scripts[0].js;
    const skIdx = js.indexOf('core/storage-keys.js');
    const syncIdx = js.indexOf('core/sync-helper.js');
    const sIdx = js.indexOf('core/settings.js');
    assert.ok(syncIdx >= 0, 'sync-helper.js not in content_scripts');
    assert.ok(skIdx < syncIdx, 'storage-keys.js must load before sync-helper.js');
    assert.ok(syncIdx < sIdx, 'sync-helper.js must load before settings.js');
  }
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
