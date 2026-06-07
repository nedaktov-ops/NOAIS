// NOAIS — tests for content/element-allowlist.js
//
// Per-element allowlist API:
//   window.NOAIS_ELEMENT_ALLOWLIST = {
//     isAllowed(host, textHash),
//     add(host, text),
//     remove(host, textHash),
//     listForHost(host),
//     _setState(blob), _getState(), _setStorageAdapter(adapter), _loadFromStorage()
//   }
//
// Run with: node tests/run.js

'use strict';

const assert = require('node:assert');
const path = require('node:path');

const API_PATH = path.join(__dirname, '..', 'extension', 'content', 'element-allowlist.js');

function loadApi() {
  // Provide a window-ish root + storage-keys shim so the module can resolve
  // NOAIS_STORAGE_KEYS without the manifest script chain being loaded.
  const root = {};
  root.NOAIS_STORAGE_KEYS = require('../extension/core/storage-keys.js');
  // Module attaches NOAIS_ELEMENT_ALLOWLIST to `root` in browser, returns via
  // module.exports in Node.
  require(API_PATH);
  // The IIFE wires both `module.exports` (Node) and `root.NOAIS_ELEMENT_ALLOWLIST`
  // (browser). Require returns the exports object.
  const exported = require(API_PATH);
  return exported;
}

function makeChromeStorageMock() {
  const data = {};
  return {
    data,
    get(key, cb) {
      let result;
      if (typeof key === 'string') {
        result = { [key]: data[key] };
      } else if (Array.isArray(key)) {
        result = {};
        for (const k of key) result[k] = data[k];
      } else {
        result = { ...data };
      }
      if (cb) setImmediate(() => cb(result));
    },
    set(obj, cb) {
      Object.assign(data, obj);
      if (cb) setImmediate(() => cb());
    },
  };
}

const tests = [];

tests.push({
  name: 'element-allowlist: module exports the public API shape',
  fn: () => {
    const api = loadApi();
    assert.strictEqual(typeof api.isAllowed, 'function', 'isAllowed exported');
    assert.strictEqual(typeof api.add, 'function', 'add exported');
    assert.strictEqual(typeof api.remove, 'function', 'remove exported');
    assert.strictEqual(typeof api.listForHost, 'function', 'listForHost exported');
  }
});

tests.push({
  name: 'element-allowlist: isAllowed returns true if hash is in host\'s set',
  fn: () => {
    const api = loadApi();
    api._setState({ 'example.com': { 'abc123def456': true, 'zzz999': true } });
    assert.strictEqual(api.isAllowed('example.com', 'abc123def456'), true);
    assert.strictEqual(api.isAllowed('example.com', 'zzz999'), true);
  }
});

tests.push({
  name: 'element-allowlist: isAllowed returns false for unknown host or hash',
  fn: () => {
    const api = loadApi();
    api._setState({ 'example.com': { 'abc123def456': true } });
    assert.strictEqual(api.isAllowed('example.com', 'does-not-exist'), false);
    assert.strictEqual(api.isAllowed('other.com', 'abc123def456'), false);
    assert.strictEqual(api.isAllowed('', 'abc123def456'), false);
    assert.strictEqual(api.isAllowed('example.com', ''), false);
    assert.strictEqual(api.isAllowed(null, 'abc123def456'), false);
  }
});

tests.push({
  name: 'element-allowlist: add() hashes text, updates state, and persists to storage',
  fn: () => {
    const api = loadApi();
    const mock = makeChromeStorageMock();
    api._setStorageAdapter(mock);
    api._setState({});
    return api.add('news.example.com', 'This is the text of the element to allowlist.').then((ok) => {
      assert.strictEqual(ok, true, 'add() resolves true');
      const state = api._getState();
      assert.ok(state['news.example.com'], 'host entry created');
      const hashes = Object.keys(state['news.example.com']);
      assert.strictEqual(hashes.length, 1, 'one hash stored');
      assert.strictEqual(hashes[0].length, 16, 'hash is 16 hex chars');
      assert.ok(/^[0-9a-f]{16}$/.test(hashes[0]), 'hash matches /^[0-9a-f]{16}$/');
      // The persisted blob should mirror state under the storage key
      assert.ok(mock.data.noais_element_allowlist, 'storage key was written');
      const persisted = mock.data.noais_element_allowlist;
      assert.ok(persisted['news.example.com'], 'host persisted');
      assert.strictEqual(persisted['news.example.com'][hashes[0]], true, 'hash persisted');
    });
  }
});

tests.push({
  name: 'element-allowlist: add() is idempotent (adding same hash twice = one entry)',
  fn: () => {
    const api = loadApi();
    api._setStorageAdapter(makeChromeStorageMock());
    api._setState({});
    return Promise.all([
      api.add('example.com', 'duplicate text payload here'),
      api.add('example.com', 'duplicate text payload here'),
    ]).then(() => {
      const state = api._getState();
      const hashes = Object.keys(state['example.com'] || {});
      assert.strictEqual(hashes.length, 1, 'one unique hash after two adds');
    });
  }
});

tests.push({
  name: 'element-allowlist: listForHost returns sorted hash array; remove() deletes the entry',
  fn: () => {
    const api = loadApi();
    api._setState({
      'example.com': {
        'zzz999aaa111': true,
        'abc123def456': true,
        'mmm777nnn888': true,
      },
      'other.com': { 'should_not_appear': true }
    });
    const list = api.listForHost('example.com');
    assert.deepStrictEqual(list, ['abc123def456', 'mmm777nnn888', 'zzz999aaa111'],
      'listForHost returns sorted hashes for the host only');
    return api.remove('example.com', 'mmm777nnn888').then(() => {
      const list2 = api.listForHost('example.com');
      assert.deepStrictEqual(list2, ['abc123def456', 'zzz999aaa111'], 'hash removed');
      assert.strictEqual(api.isAllowed('example.com', 'mmm777nnn888'), false, 'no longer allowed');
      // other.com is unaffected
      assert.strictEqual(api.isAllowed('other.com', 'should_not_appear'), true,
        'removing from one host does not affect another');
    });
  }
});

module.exports = tests;
