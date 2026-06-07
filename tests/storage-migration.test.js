// Tests for v0.3 -> v0.4 storage schema migration
// RED: core/settings.js does not exist yet, so settings reads/writes will fail.

'use strict';

const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

function loadSettings() {
  const file = path.join(__dirname, '..', 'extension', 'core', 'settings.js');
  delete require.cache[require.resolve(file)];
  return require(file);
}

const tests = [];

tests.push({
  name: 'migration: v0.3 blob (noais_enabled only) is read correctly',
  fn: () => {
    const s = loadSettings();
    const v03 = { noais_enabled: true };
    const effective = s.getEffectiveSettings(v03, 'youtube.com');
    assert.strictEqual(effective.enabled, true);
    // Sensitivity should default to 100.
    assert.strictEqual(effective.sensitivity, 100);
  },
});

tests.push({
  name: 'migration: v0.3 blob with noais_enabled=false is respected',
  fn: () => {
    const s = loadSettings();
    const v03 = { noais_enabled: false };
    const effective = s.getEffectiveSettings(v03, 'youtube.com');
    assert.strictEqual(effective.enabled, false);
  },
});

tests.push({
  name: 'migration: empty storage blob (fresh install) is handled gracefully',
  fn: () => {
    const s = loadSettings();
    const effective = s.getEffectiveSettings({}, 'youtube.com');
    // noais_enabled missing defaults to true (same as v0.3 implicit default).
    assert.strictEqual(effective.enabled, true);
    assert.strictEqual(effective.sensitivity, 100);
  },
});

tests.push({
  name: 'migration: null storage blob is handled gracefully',
  fn: () => {
    const s = loadSettings();
    const effective = s.getEffectiveSettings(null, 'youtube.com');
    assert.strictEqual(effective.enabled, true);
  },
});

tests.push({
  name: 'migration: corrupt noais_site_overrides (string instead of object) falls back',
  fn: () => {
    const s = loadSettings();
    const effective = s.getEffectiveSettings(
      { noais_enabled: true, noais_site_overrides: 'banana' },
      'youtube.com'
    );
    assert.strictEqual(effective.enabled, true);
  },
});

tests.push({
  name: 'migration: missing noais_global_sensitivity defaults to 100',
  fn: () => {
    const s = loadSettings();
    const effective = s.getEffectiveSettings(
      { noais_enabled: true },
      'youtube.com'
    );
    assert.strictEqual(effective.sensitivity, 100);
  },
});

tests.push({
  name: 'migration: v0.4 keys are additive (do not erase noais_enabled)',
  fn: () => {
    // This test simulates: user had v0.3 {noais_enabled: true}, v0.4 adds new
    // keys. The original key must still be readable.
    const s = loadSettings();
    const blob = { noais_enabled: true };
    // Simulate v0.4 writing new keys:
    blob.noais_global_sensitivity = 75;
    blob.noais_site_overrides = { 'twitter.com': false };
    // Confirm all three are readable:
    assert.strictEqual(s.getEffectiveSettings(blob, 'youtube.com').enabled, true);
    assert.strictEqual(s.getEffectiveSettings(blob, 'twitter.com').enabled, false);
    assert.strictEqual(s.getEffectiveSettings(blob, 'youtube.com').sensitivity, 75);
  },
});

module.exports = tests;
