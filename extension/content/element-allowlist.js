// NOAIS — per-element allowlist (v1.1).
//
// Storage shape:  noais_element_allowlist: { [hostname]: { [textHash16]: true } }
//
// textHash16 = first 16 hex chars of SHA-256(text.slice(0, 200).toLowerCase()).
// We use window.NOAIS_STORAGE_KEYS.hashText() so the algorithm is in one place.
//
// Public API (also exposed on window.NOAIS_ELEMENT_ALLOWLIST in the browser):
//   isAllowed(host, textHash) -> boolean
//   add(host, text) -> Promise<boolean>          (persists to storage)
//   remove(host, textHash) -> Promise<boolean>   (persists to storage)
//   listForHost(host) -> string[]                (sorted hash array)
//
// Test-only helpers (always exported; the in-memory cache + storage adapter
// are swappable from Node):
//   _setState(blob)            synchronously load a state blob
//   _getState()                return current in-memory state
//   _setStorageAdapter(adapter)  swap the chrome.storage.local mock
//   _loadFromStorage()         async hydrate the cache from storage

(function (root) {
  'use strict';

  function resolveKey() {
    const sk = root && root.NOAIS_STORAGE_KEYS;
    if (sk && sk.KEYS && sk.KEYS.ELEMENT_ALLOWLIST) return sk.KEYS.ELEMENT_ALLOWLIST;
    return 'noais_element_allowlist';
  }

  function resolveHashFn() {
    const sk = root && root.NOAIS_STORAGE_KEYS;
    if (sk && typeof sk.hashText === 'function') return sk.hashText;
    return function () { return ''; };
  }

  const STORAGE_KEY = resolveKey();
  const HASH_FN = resolveHashFn();

  // In-memory cache. The content script reads/writes synchronously against
  // this; persistence is async. The first call to _loadFromStorage() (or
  // _setState() in tests) primes the cache.
  let cache = {};
  let storageAdapter = null;

  function getStorage() {
    if (storageAdapter) return storageAdapter;
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return chrome.storage.local;
      }
    } catch (_e) { /* ignore */ }
    return null;
  }

  function isObject(v) {
    return v && typeof v === 'object' && !Array.isArray(v);
  }

  function isAllowed(host, textHash) {
    if (typeof host !== 'string' || !host) return false;
    if (typeof textHash !== 'string' || !textHash) return false;
    const hostEntry = cache[host];
    if (!isObject(hostEntry)) return false;
    return hostEntry[textHash] === true;
  }

  function listForHost(host) {
    if (typeof host !== 'string' || !host) return [];
    const hostEntry = cache[host];
    if (!isObject(hostEntry)) return [];
    const out = [];
    for (const k of Object.keys(hostEntry)) {
      if (hostEntry[k] === true) out.push(k);
    }
    return out.sort();
  }

  function persist() {
    const storage = getStorage();
    if (!storage || typeof storage.set !== 'function') {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      try {
        storage.set({ [STORAGE_KEY]: cache }, () => resolve(true));
      } catch (_e) {
        resolve(false);
      }
    });
  }

  function add(host, text) {
    if (typeof host !== 'string' || !host) return Promise.resolve(false);
    if (typeof text !== 'string') return Promise.resolve(false);
    const hash = HASH_FN(text);
    if (!hash) return Promise.resolve(false);
    if (!isObject(cache[host])) cache[host] = {};
    if (cache[host][hash] === true) {
      // Idempotent: already there.
      return Promise.resolve(true);
    }
    cache[host][hash] = true;
    return persist();
  }

  function remove(host, textHash) {
    if (typeof host !== 'string' || !host) return Promise.resolve(false);
    if (typeof textHash !== 'string' || !textHash) return Promise.resolve(false);
    const hostEntry = cache[host];
    if (!isObject(hostEntry) || !hostEntry[textHash]) {
      // Idempotent: nothing to remove.
      return Promise.resolve(true);
    }
    delete hostEntry[textHash];
    if (Object.keys(hostEntry).length === 0) {
      delete cache[host];
    }
    return persist();
  }

  // ----- Test-only helpers -----
  function _setState(blob) {
    cache = isObject(blob) ? blob : {};
  }
  function _getState() { return cache; }
  function _setStorageAdapter(adapter) { storageAdapter = adapter; }
  function _loadFromStorage() {
    const storage = getStorage();
    if (!storage || typeof storage.get !== 'function') {
      cache = {};
      return Promise.resolve(cache);
    }
    return new Promise((resolve) => {
      try {
        storage.get(STORAGE_KEY, (result) => {
          const blob = result && result[STORAGE_KEY];
          cache = isObject(blob) ? blob : {};
          resolve(cache);
        });
      } catch (_e) {
        cache = {};
        resolve(cache);
      }
    });
  }

  const api = {
    isAllowed: isAllowed,
    add: add,
    remove: remove,
    listForHost: listForHost,
    _setState: _setState,
    _getState: _getState,
    _setStorageAdapter: _setStorageAdapter,
    _loadFromStorage: _loadFromStorage,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof root !== 'undefined' && root) {
    root.NOAIS_ELEMENT_ALLOWLIST = api;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
