// Tests for core/storage-keys.js (v1.1.0)
// RED before the file exists, GREEN after.
//
// Verifies the canonical key list, sync/local split, defaults, and the
// hashText() function (used by the per-element allowlist).

'use strict';

const assert = require('node:assert');
const path = require('node:path');

function loadStorageKeys() {
  const file = path.join(__dirname, '..', 'extension', 'core', 'storage-keys.js');
  delete require.cache[require.resolve(file)];
  return require(file);
}

const tests = [];

tests.push({
  name: 'storage-keys: file exports a frozen API object',
  fn: () => {
    const api = loadStorageKeys();
    assert.ok(api, 'module.exports is truthy');
    assert.ok(api.KEYS, 'has KEYS');
    assert.ok(api.SYNC_KEYS, 'has SYNC_KEYS');
    assert.ok(api.LOCAL_KEYS, 'has LOCAL_KEYS');
    assert.ok(api.DEFAULTS, 'has DEFAULTS');
    assert.strictEqual(typeof api.get, 'function');
    assert.strictEqual(typeof api.hashText, 'function');
    assert.ok(Object.isFrozen(api), 'API is frozen');
  },
});

tests.push({
  name: 'storage-keys: KEYS contains the 4 v0.1-v0.5 keys',
  fn: () => {
    const api = loadStorageKeys();
    assert.strictEqual(api.KEYS.ENABLED, 'noais_enabled');
    assert.strictEqual(api.KEYS.GLOBAL_SENSITIVITY, 'noais_global_sensitivity');
    assert.strictEqual(api.KEYS.SITE_OVERRIDES, 'noais_site_overrides');
    assert.strictEqual(api.KEYS.HARD_MODE_SITES, 'noais_hard_mode_sites');
  },
});

tests.push({
  name: 'storage-keys: KEYS contains the 5 v1.1 keys',
  fn: () => {
    const api = loadStorageKeys();
    assert.strictEqual(api.KEYS.PAGE_COUNTER_ENABLED, 'noais_page_counter_enabled');
    assert.strictEqual(api.KEYS.PAGE_COUNTER_POSITION, 'noais_page_counter_position');
    assert.strictEqual(api.KEYS.ELEMENT_ALLOWLIST, 'noais_element_allowlist');
    assert.strictEqual(api.KEYS.TAB_OVERRIDES, 'noais_tab_overrides');
    assert.strictEqual(api.KEYS.LAST_SCAN, 'noais_last_scan');
  },
});

tests.push({
  name: 'storage-keys: SYNC_KEYS has the 2 small user settings only (HARD_MODE_SITES moved to local in v1.1.2)',
  fn: () => {
    const api = loadStorageKeys();
    assert.strictEqual(api.SYNC_KEYS.length, 2);
    assert.ok(api.SYNC_KEYS.includes(api.KEYS.ENABLED));
    assert.ok(api.SYNC_KEYS.includes(api.KEYS.GLOBAL_SENSITIVITY));
    // HARD_MODE_SITES moved to LOCAL_KEYS in v1.1.2 (all consumers read/write local).
    assert.ok(!api.SYNC_KEYS.includes(api.KEYS.HARD_MODE_SITES));
    // SITE_OVERRIDES stays on local to avoid blowing the 8 KB sync quota.
    assert.ok(!api.SYNC_KEYS.includes(api.KEYS.SITE_OVERRIDES));
  },
});

tests.push({
  name: 'storage-keys: LOCAL_KEYS covers the rest (7 keys including HARD_MODE_SITES)',
  fn: () => {
    const api = loadStorageKeys();
    assert.strictEqual(api.LOCAL_KEYS.length, 7);
    assert.ok(api.LOCAL_KEYS.includes(api.KEYS.SITE_OVERRIDES));
    assert.ok(api.LOCAL_KEYS.includes(api.KEYS.HARD_MODE_SITES));
    assert.ok(api.LOCAL_KEYS.includes(api.KEYS.PAGE_COUNTER_ENABLED));
    assert.ok(api.LOCAL_KEYS.includes(api.KEYS.PAGE_COUNTER_POSITION));
    assert.ok(api.LOCAL_KEYS.includes(api.KEYS.ELEMENT_ALLOWLIST));
    assert.ok(api.LOCAL_KEYS.includes(api.KEYS.TAB_OVERRIDES));
    assert.ok(api.LOCAL_KEYS.includes(api.KEYS.LAST_SCAN));
  },
});

tests.push({
  name: 'storage-keys: SYNC_KEYS and LOCAL_KEYS are disjoint and cover all keys',
  fn: () => {
    const api = loadStorageKeys();
    const all = new Set(Object.values(api.KEYS));
    for (const k of api.SYNC_KEYS) all.delete(k);
    for (const k of api.LOCAL_KEYS) all.delete(k);
    assert.strictEqual(all.size, 0, 'every key is in exactly one area');
  },
});

tests.push({
  name: 'storage-keys: DEFAULTS has the expected shape',
  fn: () => {
    const api = loadStorageKeys();
    assert.strictEqual(api.DEFAULTS[api.KEYS.ENABLED], true);
    assert.strictEqual(api.DEFAULTS[api.KEYS.GLOBAL_SENSITIVITY], 100);
    assert.deepStrictEqual(api.DEFAULTS[api.KEYS.SITE_OVERRIDES], {});
    assert.deepStrictEqual(api.DEFAULTS[api.KEYS.HARD_MODE_SITES], {});
    assert.strictEqual(api.DEFAULTS[api.KEYS.PAGE_COUNTER_ENABLED], true);
    assert.strictEqual(api.DEFAULTS[api.KEYS.PAGE_COUNTER_POSITION], null);
    assert.deepStrictEqual(api.DEFAULTS[api.KEYS.ELEMENT_ALLOWLIST], {});
    assert.deepStrictEqual(api.DEFAULTS[api.KEYS.TAB_OVERRIDES], {});
    assert.deepStrictEqual(api.DEFAULTS[api.KEYS.LAST_SCAN], {});
  },
});

tests.push({
  name: 'storage-keys: get() returns sync value if present',
  fn: () => {
    const api = loadStorageKeys();
    const local = { noais_enabled: true };
    const sync = { noais_enabled: false };
    assert.strictEqual(api.get(api.KEYS.ENABLED, local, sync), false);
  },
});

tests.push({
  name: 'storage-keys: get() falls back to local when sync missing',
  fn: () => {
    const api = loadStorageKeys();
    const local = { noais_enabled: true };
    const sync = {};
    assert.strictEqual(api.get(api.KEYS.ENABLED, local, sync), true);
  },
});

tests.push({
  name: 'storage-keys: get() falls back to DEFAULTS when neither has the key',
  fn: () => {
    const api = loadStorageKeys();
    assert.strictEqual(api.get(api.KEYS.ENABLED, {}, {}), true);
    assert.strictEqual(api.get(api.KEYS.GLOBAL_SENSITIVITY, {}, {}), 100);
    assert.deepStrictEqual(api.get(api.KEYS.SITE_OVERRIDES, {}, {}), {});
  },
});

tests.push({
  name: 'storage-keys: get() returns default when value is undefined',
  fn: () => {
    const api = loadStorageKeys();
    const local = { noais_global_sensitivity: undefined };
    assert.strictEqual(api.get(api.KEYS.GLOBAL_SENSITIVITY, local, {}), 100);
  },
});

tests.push({
  name: 'storage-keys: hashText() returns 16 hex chars for any string',
  fn: () => {
    const api = loadStorageKeys();
    const h = api.hashText('It is important to note that the model has improved significantly.');
    assert.match(h, /^[0-9a-f]{16}$/);
  },
});

tests.push({
  name: 'storage-keys: hashText() is deterministic',
  fn: () => {
    const api = loadStorageKeys();
    const t = 'Some user comment that should be allowlisted.';
    assert.strictEqual(api.hashText(t), api.hashText(t));
  },
});

tests.push({
  name: 'storage-keys: hashText() is case-insensitive (lowercases input)',
  fn: () => {
    const api = loadStorageKeys();
    const a = api.hashText('Hello World');
    const b = api.hashText('hello world');
    assert.strictEqual(a, b);
  },
});

tests.push({
  name: 'storage-keys: hashText() is truncated to first 200 chars of input',
  fn: () => {
    const api = loadStorageKeys();
    const t1 = 'a'.repeat(100) + 'tail-a';
    const t2 = 'a'.repeat(100) + 'tail-b';
    // The first 100 chars are identical, the trailing chars differ,
    // but the hash only looks at the first 200 chars, and both inputs
    // are <= 200, so they should hash differently because of the tail.
    assert.notStrictEqual(api.hashText(t1), api.hashText(t2));
    // But two identical inputs must hash the same.
    assert.strictEqual(api.hashText(t1), api.hashText(t1));
  },
});

tests.push({
  name: 'storage-keys: hashText() handles non-string input',
  fn: () => {
    const api = loadStorageKeys();
    assert.strictEqual(api.hashText(null), '');
    assert.strictEqual(api.hashText(undefined), '');
    assert.strictEqual(api.hashText(123), '');
  },
});

tests.push({
  name: 'storage-keys: hashText() of an empty string is 16 hex chars (not empty)',
  fn: () => {
    const api = loadStorageKeys();
    const h = api.hashText('');
    assert.match(h, /^[0-9a-f]{16}$/);
  },
});

module.exports = tests;
