// Tests for core/sync-helper.js (v1.1.0)
// TDD discipline: these tests fail BEFORE the helper exists.

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const HELPER = path.join(__dirname, '..', 'extension', 'core', 'sync-helper.js');
const STORAGE_KEYS = path.join(__dirname, '..', 'extension', 'core', 'storage-keys.js');

function loadStorageKeys(stubs) {
  const src = fs.readFileSync(STORAGE_KEYS, 'utf8');
  const ctx = vm.createContext({
    window: { chrome: stubs },
    self: {},
    globalThis: {},
    chrome: stubs,
    console,
  });
  vm.runInContext(src, ctx, { filename: 'storage-keys.js' });
  return ctx.window.NOAIS_STORAGE_KEYS || ctx.globalThis.NOAIS_STORAGE_KEYS;
}

function loadHelper(stubs) {
  const storageKeysSrc = fs.readFileSync(STORAGE_KEYS, 'utf8');
  const helperSrc = fs.readFileSync(HELPER, 'utf8');
  const captured = {};
  const ctx = vm.createContext({
    window: { chrome: stubs },
    self: {},
    globalThis: {},
    module: { exports: {} },
    chrome: stubs,
    console,
  });
  vm.runInContext(storageKeysSrc, ctx, { filename: 'storage-keys.js' });
  vm.runInContext(helperSrc, ctx, { filename: 'sync-helper.js' });
  // sync-helper writes its API to module.exports when module is present.
  return ctx.module.exports;
}

function makeStubs(opts) {
  opts = opts || {};
  const calls = { syncGet: [], syncSet: [], syncRemove: [], localGet: [], localSet: [], localRemove: [], onChanged: [] };
  const syncStore = Object.assign({}, opts.syncStore || {});
  const localStore = Object.assign({}, opts.localStore || {});

  const syncGet = (key, cb) => {
    calls.syncGet.push(key);
    const out = {};
    if (typeof key === 'string' && Object.prototype.hasOwnProperty.call(syncStore, key)) {
      out[key] = syncStore[key];
    }
    if (typeof cb === 'function') cb(out);
  };
  const syncSet = (obj, cb) => {
    Object.assign(syncStore, obj);
    calls.syncSet.push(Object.assign({}, obj));
    if (typeof cb === 'function') cb();
  };
  const syncRemove = (key, cb) => {
    delete syncStore[key];
    calls.syncRemove.push(key);
    if (typeof cb === 'function') cb();
  };
  const localGet = (key, cb) => {
    calls.localGet.push(key);
    const out = {};
    if (typeof key === 'string' && Object.prototype.hasOwnProperty.call(localStore, key)) {
      out[key] = localStore[key];
    }
    if (typeof cb === 'function') cb(out);
  };
  const localSet = (obj, cb) => {
    Object.assign(localStore, obj);
    calls.localSet.push(Object.assign({}, obj));
    if (typeof cb === 'function') cb();
  };
  const localRemove = (key, cb) => {
    delete localStore[key];
    calls.localRemove.push(key);
    if (typeof cb === 'function') cb();
  };
  const onChanged = {
    addListener(fn) { calls.onChanged.push(fn); },
  };
  return {
    calls,
    syncStore,
    localStore,
    chrome: {
      runtime: { lastError: null },
      storage: {
        sync: { get: syncGet, set: syncSet, remove: syncRemove },
        local: { get: localGet, set: localSet, remove: localRemove },
        onChanged,
      },
    },
  };
}

const tests = [];

tests.push({
  name: 'sync-helper: file exists at extension/core/sync-helper.js',
  fn: () => {
    assert.ok(fs.existsSync(HELPER), 'sync-helper.js missing');
  },
});

tests.push({
  name: 'sync-helper: classifies the 3 sync keys as sync and others as local',
  fn: () => {
    const stubs = makeStubs();
    const helper = loadHelper(stubs.chrome);
    // The 3 sync keys per the v1.1 plan.
    assert.strictEqual(helper.classify('noais_enabled'), 'sync');
    assert.strictEqual(helper.classify('noais_global_sensitivity'), 'sync');
    assert.strictEqual(helper.classify('noais_hard_mode_sites'), 'sync');
    // Per-site overrides and page counters stay local.
    assert.strictEqual(helper.classify('noais_site_overrides'), 'local');
    assert.strictEqual(helper.classify('noais_page_counter'), 'local');
    // Unknown keys default to local (safe, never over the sync budget).
    assert.strictEqual(helper.classify('noais_definitely_unknown'), 'local');
  },
});

tests.push({
  name: 'sync-helper: get routes sync keys to chrome.storage.sync and local keys to chrome.storage.local',
  fn: () => {
    const stubs = makeStubs({
      syncStore: { noais_enabled: true },
      localStore: { noais_site_overrides: { 'example.com': { disabled: true } } },
    });
    const helper = loadHelper(stubs.chrome);
    helper.get('noais_enabled');
    helper.get('noais_site_overrides');
    assert.ok(stubs.calls.syncGet.indexOf('noais_enabled') >= 0, 'sync key should hit storage.sync.get');
    assert.ok(stubs.calls.localGet.indexOf('noais_site_overrides') >= 0, 'local key should hit storage.local.get');
  },
});

tests.push({
  name: 'sync-helper: set routes sync keys to chrome.storage.sync and local keys to chrome.storage.local',
  fn: () => {
    const stubs = makeStubs();
    const helper = loadHelper(stubs.chrome);
    helper.set('noais_enabled', false);
    helper.set('noais_site_overrides', { 'example.com': { disabled: true } });
    assert.deepStrictEqual(stubs.calls.syncSet[0], { noais_enabled: false });
    assert.deepStrictEqual(stubs.calls.localSet[0], { noais_site_overrides: { 'example.com': { disabled: true } } });
  },
});

tests.push({
  name: 'sync-helper: onChanged wraps chrome.storage.onChanged.addListener with a single argument',
  fn: () => {
    const stubs = makeStubs();
    const helper = loadHelper(stubs.chrome);
    const fn = () => {};
    helper.onChanged(fn);
    assert.strictEqual(stubs.calls.onChanged.length, 1);
    assert.strictEqual(typeof stubs.calls.onChanged[0], 'function');
  },
});

tests.push({
  name: 'sync-helper: re-exports KEYS / SYNC_KEYS / LOCAL_KEYS from storage-keys.js',
  fn: () => {
    const stubs = makeStubs();
    const helper = loadHelper(stubs.chrome);
    const storageKeys = loadStorageKeys(stubs.chrome);
    // Cross-realm: prototypes differ, so use field-by-field compare.
    assert.deepStrictEqual(Array.from(helper.SYNC_KEYS), Array.from(storageKeys.SYNC_KEYS));
    assert.deepStrictEqual(Array.from(helper.LOCAL_KEYS), Array.from(storageKeys.LOCAL_KEYS));
    assert.deepStrictEqual(Array.from(Object.keys(helper.KEYS)).sort(),
                           Array.from(Object.keys(storageKeys.KEYS)).sort());
  },
});

module.exports = tests;
