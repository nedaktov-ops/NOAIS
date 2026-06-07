// Tests for core/settings.js
// RED: core/settings.js does not exist yet, so all tests fail with module-not-found.

'use strict';

const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

// Helper: load core/settings.js as a CommonJS module (the file's module.exports).
// This avoids vm cross-realm prototype issues with assert.deepStrictEqual.
function loadSettings() {
  const file = path.join(__dirname, '..', 'extension', 'core', 'settings.js');
  // Bust require cache so each test gets a fresh module.
  delete require.cache[require.resolve(file)];
  return require(file);
}

const tests = [];

// ---------- parseHostname ----------

tests.push({
  name: 'parseHostname: https URL with www',
  fn: () => {
    const s = loadSettings();
    assert.strictEqual(s.parseHostname('https://www.youtube.com/watch?v=abc'), 'www.youtube.com');
  },
});

tests.push({
  name: 'parseHostname: bare host',
  fn: () => {
    const s = loadSettings();
    assert.strictEqual(s.parseHostname('https://youtube.com'), 'youtube.com');
  },
});

tests.push({
  name: 'parseHostname: subdomain m.youtube.com',
  fn: () => {
    const s = loadSettings();
    assert.strictEqual(s.parseHostname('https://m.youtube.com/feed/trending'), 'm.youtube.com');
  },
});

tests.push({
  name: 'parseHostname: http with port',
  fn: () => {
    const s = loadSettings();
    assert.strictEqual(s.parseHostname('http://reddit.com:8080/r/all'), 'reddit.com');
  },
});

tests.push({
  name: 'parseHostname: file:// returns empty string',
  fn: () => {
    const s = loadSettings();
    assert.strictEqual(s.parseHostname('file:///home/user/page.html'), '');
  },
});

tests.push({
  name: 'parseHostname: chrome:// returns empty string',
  fn: () => {
    const s = loadSettings();
    assert.strictEqual(s.parseHostname('chrome://settings/'), '');
  },
});

tests.push({
  name: 'parseHostname: about:blank returns empty string',
  fn: () => {
    const s = loadSettings();
    assert.strictEqual(s.parseHostname('about:blank'), '');
  },
});

tests.push({
  name: 'parseHostname: IPv4 address preserved',
  fn: () => {
    const s = loadSettings();
    assert.strictEqual(s.parseHostname('http://192.168.1.1/admin'), '192.168.1.1');
  },
});

tests.push({
  name: 'parseHostname: IDN hostname lowercased (Punycode)',
  fn: () => {
    const s = loadSettings();
    // IDN: bücher.de in Punycode is xn--bcher-kva.de
    assert.strictEqual(s.parseHostname('https://xn--bcher-kva.de/path'), 'xn--bcher-kva.de');
  },
});

tests.push({
  name: 'parseHostname: garbage string returns empty',
  fn: () => {
    const s = loadSettings();
    assert.strictEqual(s.parseHostname('not a url at all'), '');
  },
});

tests.push({
  name: 'parseHostname: empty string returns empty',
  fn: () => {
    const s = loadSettings();
    assert.strictEqual(s.parseHostname(''), '');
  },
});

tests.push({
  name: 'parseHostname: undefined returns empty',
  fn: () => {
    const s = loadSettings();
    assert.strictEqual(s.parseHostname(undefined), '');
  },
});

// ---------- matches ----------

tests.push({
  name: 'matches: exact match',
  fn: () => {
    const s = loadSettings();
    assert.strictEqual(s.matches('youtube.com', 'youtube.com'), true);
  },
});

tests.push({
  name: 'matches: subdomain match (www)',
  fn: () => {
    const s = loadSettings();
    assert.strictEqual(s.matches('www.youtube.com', 'youtube.com'), true);
  },
});

tests.push({
  name: 'matches: subdomain match (m)',
  fn: () => {
    const s = loadSettings();
    assert.strictEqual(s.matches('m.youtube.com', 'youtube.com'), true);
  },
});

tests.push({
  name: 'matches: deep subdomain match (a.b.c.youtube.com)',
  fn: () => {
    const s = loadSettings();
    assert.strictEqual(s.matches('a.b.c.youtube.com', 'youtube.com'), true);
  },
});

tests.push({
  name: 'matches: REJECTS prefix lookalike (notyoutube.com)',
  fn: () => {
    const s = loadSettings();
    assert.strictEqual(s.matches('notyoutube.com', 'youtube.com'), false);
  },
});

tests.push({
  name: 'matches: REJECTS similar TLD (youtube.co)',
  fn: () => {
    const s = loadSettings();
    assert.strictEqual(s.matches('youtube.co', 'youtube.com'), false);
  },
});

tests.push({
  name: 'matches: REJECTS suffix lookalike (youtube.com.evil.example)',
  fn: () => {
    const s = loadSettings();
    assert.strictEqual(s.matches('youtube.com.evil.example', 'youtube.com'), false);
  },
});

tests.push({
  name: 'matches: case-insensitive (YouTube.COM)',
  fn: () => {
    const s = loadSettings();
    // parseHostname lowercases the hostname first; matches still receives lowercase.
    // Test: rule 'youtube.com' matches hostname 'youtube.com' even if rule was upper.
    assert.strictEqual(s.matches('youtube.com', 'YOUTUBE.COM'.toLowerCase()), true);
  },
});

tests.push({
  name: 'matches: empty hostname returns false',
  fn: () => {
    const s = loadSettings();
    assert.strictEqual(s.matches('', 'youtube.com'), false);
  },
});

tests.push({
  name: 'matches: empty rule returns false',
  fn: () => {
    const s = loadSettings();
    assert.strictEqual(s.matches('youtube.com', ''), false);
  },
});

// ---------- mergeSettings ----------

tests.push({
  name: 'mergeSettings: empty overrides yields all curated on',
  fn: () => {
    const s = loadSettings();
    const out = s.mergeSettings({});
    assert.deepStrictEqual(out, {
      'youtube.com': true, 'facebook.com': true, 'instagram.com': true,
      'tiktok.com': true, 'twitter.com': true, 'reddit.com': true, 'linkedin.com': true,
    });
  },
});

tests.push({
  name: 'mergeSettings: user override flips one curated to off',
  fn: () => {
    const s = loadSettings();
    const out = s.mergeSettings({ 'twitter.com': false });
    assert.strictEqual(out['twitter.com'], false);
    assert.strictEqual(out['youtube.com'], true);
  },
});

tests.push({
  name: 'mergeSettings: user-added custom site is preserved',
  fn: () => {
    const s = loadSettings();
    const out = s.mergeSettings({ 'example.com': true });
    assert.strictEqual(out['example.com'], true);
    assert.strictEqual(out['youtube.com'], true);
  },
});

tests.push({
  name: 'mergeSettings: corrupt overrides (non-object) falls back to defaults',
  fn: () => {
    const s = loadSettings();
    const out = s.mergeSettings('not an object');
    assert.strictEqual(out['youtube.com'], true);
  },
});

tests.push({
  name: 'mergeSettings: null overrides yields all curated on',
  fn: () => {
    const s = loadSettings();
    const out = s.mergeSettings(null);
    assert.strictEqual(out['youtube.com'], true);
  },
});

// ---------- getEffectiveSettings ----------

tests.push({
  name: 'getEffectiveSettings: global off wins over any per-site on',
  fn: () => {
    const s = loadSettings();
    const out = s.getEffectiveSettings(
      { noais_enabled: false, noais_site_overrides: { 'youtube.com': true } },
      'youtube.com'
    );
    assert.strictEqual(out.enabled, false);
  },
});

tests.push({
  name: 'getEffectiveSettings: global on, per-site off wins',
  fn: () => {
    const s = loadSettings();
    const out = s.getEffectiveSettings(
      { noais_enabled: true, noais_site_overrides: { 'reddit.com': false } },
      'www.reddit.com'
    );
    assert.strictEqual(out.enabled, false);
  },
});

tests.push({
  name: 'getEffectiveSettings: global on, unknown hostname is enabled by default',
  fn: () => {
    const s = loadSettings();
    const out = s.getEffectiveSettings(
      { noais_enabled: true, noais_site_overrides: {} },
      'someotherdomain.org'
    );
    assert.strictEqual(out.enabled, true);
  },
});

tests.push({
  name: 'getEffectiveSettings: empty hostname (chrome://) is enabled but never matches',
  fn: () => {
    const s = loadSettings();
    const out = s.getEffectiveSettings(
      { noais_enabled: true, noais_site_overrides: {} },
      ''
    );
    // chrome:// pages have no hostname; we still return enabled=true so that
    // the extension's behaviour on these pages is unchanged.
    assert.strictEqual(out.enabled, true);
  },
});

tests.push({
  name: 'getEffectiveSettings: sensitivity defaults to 100',
  fn: () => {
    const s = loadSettings();
    const out = s.getEffectiveSettings(
      { noais_enabled: true, noais_site_overrides: {} },
      'youtube.com'
    );
    assert.strictEqual(out.sensitivity, 100);
  },
});

tests.push({
  name: 'getEffectiveSettings: sensitivity is read from storage',
  fn: () => {
    const s = loadSettings();
    const out = s.getEffectiveSettings(
      { noais_enabled: true, noais_global_sensitivity: 50, noais_site_overrides: {} },
      'youtube.com'
    );
    assert.strictEqual(out.sensitivity, 50);
  },
});

tests.push({
  name: 'getEffectiveSettings: invalid sensitivity falls back to 100',
  fn: () => {
    const s = loadSettings();
    const out = s.getEffectiveSettings(
      { noais_enabled: true, noais_global_sensitivity: 'banana', noais_site_overrides: {} },
      'youtube.com'
    );
    assert.strictEqual(out.sensitivity, 100);
  },
});

// ---------- CURATED_HOSTS constant ----------

tests.push({
  name: 'CURATED_HOSTS: exactly 7 entries, all valid',
  fn: () => {
    const s = loadSettings();
    const curated = s.CURATED_HOSTS;
    assert.strictEqual(curated.length, 7);
    for (const h of curated) {
      assert.match(h, /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/);
    }
  },
});

// ---------- normalizeHostnameInput ----------

tests.push({
  name: 'normalizeHostnameInput: trims whitespace',
  fn: () => {
    const s = loadSettings();
    assert.strictEqual(s.normalizeHostnameInput('  example.com  '), 'example.com');
  },
});

tests.push({
  name: 'normalizeHostnameInput: strips https://',
  fn: () => {
    const s = loadSettings();
    assert.strictEqual(s.normalizeHostnameInput('https://example.com/path'), 'example.com');
  },
});

tests.push({
  name: 'normalizeHostnameInput: strips path and query',
  fn: () => {
    const s = loadSettings();
    assert.strictEqual(s.normalizeHostnameInput('example.com/foo?bar=1'), 'example.com');
  },
});

tests.push({
  name: 'normalizeHostnameInput: lowercases',
  fn: () => {
    const s = loadSettings();
    assert.strictEqual(s.normalizeHostnameInput('Example.COM'), 'example.com');
  },
});

tests.push({
  name: 'normalizeHostnameInput: rejects invalid (no dot)',
  fn: () => {
    const s = loadSettings();
    assert.strictEqual(s.normalizeHostnameInput('localhost'), null);
  },
});

tests.push({
  name: 'normalizeHostnameInput: rejects empty',
  fn: () => {
    const s = loadSettings();
    assert.strictEqual(s.normalizeHostnameInput(''), null);
  },
});

tests.push({
  name: 'normalizeHostnameInput: rejects HTML injection',
  fn: () => {
    const s = loadSettings();
    assert.strictEqual(s.normalizeHostnameInput('<script>alert(1)</script>'), null);
  },
});

tests.push({
  name: 'normalizeHostnameInput: strips leading dot',
  fn: () => {
    const s = loadSettings();
    assert.strictEqual(s.normalizeHostnameInput('.example.com'), 'example.com');
  },
});

module.exports = tests;
