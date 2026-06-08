// NOAIS sync-helper - v1.1.0
//
// Tiny shim around chrome.storage that:
//
//   1. Routes reads/writes to chrome.storage.sync for the small set of
//      keys in SYNC_KEYS (global sensitivity, enabled/disabled toggle),
//      and to chrome.storage.local for everything else.
//   2. Surfaces a single onChange event regardless of which area fired.
//   3. Returns Promises (async/await friendly) but accepts a Node-style
//      callback as the last argument for legacy callers.
//
// All keys live in storage-keys.js (KEYS, SYNC_KEYS, LOCAL_KEYS, DEFAULTS).
// This module never owns keys; it just chooses the right area.
//
// Why a shim? chrome.storage.sync has an 8 KB per-item / 100 KB total
// quota and a per-key 1.8 KB cap. The sync keys in v1.1.0 are tiny
// (3 keys, each holding a hostname + per-site flags). Per-site overrides
// stay in chrome.storage.local because they would blow the sync budget.

(function (global) {
  'use strict';

  const KEYS = (global.NOAIS_STORAGE_KEYS && global.NOAIS_STORAGE_KEYS.KEYS) || {};
  const SYNC_KEYS = (global.NOAIS_STORAGE_KEYS && global.NOAIS_STORAGE_KEYS.SYNC_KEYS) || [];
  const LOCAL_KEYS = (global.NOAIS_STORAGE_KEYS && global.NOAIS_STORAGE_KEYS.LOCAL_KEYS) || [];

  function isSyncKey(key) {
    return SYNC_KEYS.indexOf(key) !== -1;
  }

  function isLocalKey(key) {
    return LOCAL_KEYS.indexOf(key) !== -1;
  }

  function classify(key) {
    if (isSyncKey(key)) return 'sync';
    if (isLocalKey(key)) return 'local';
    // Unknown key → default to local (safe, never over the sync budget).
    return 'local';
  }

  function callMaybePromise(maybeCb, err, data) {
    if (typeof maybeCb === 'function') {
      try { maybeCb(err, data); } catch (_e) { /* ignore */ }
    }
    if (err) return Promise.reject(err);
    return Promise.resolve(data);
  }

  function get(key, cb) {
    if (typeof key !== 'string' || !key) {
      return callMaybePromise(cb, new Error('sync-helper.get: key required'));
    }
    if (!global.chrome || !global.chrome.storage || !global.chrome.storage.sync ||
        !global.chrome.storage.local) {
      return callMaybePromise(cb, new Error('sync-helper.get: chrome.storage unavailable'));
    }
    const area = isSyncKey(key) ? global.chrome.storage.sync : global.chrome.storage.local;
    try {
      const out = area.get(key, (data) => {
        if (global.chrome.runtime && global.chrome.runtime.lastError) {
          // ignored on purpose - callMaybePromise(undefined, data) below.
        }
        callMaybePromise(cb, null, (data && Object.prototype.hasOwnProperty.call(data, key)) ? data[key] : undefined);
      });
      if (out && typeof out.then === 'function') {
        return out.then((data) => {
          if (data && Object.prototype.hasOwnProperty.call(data, key)) return data[key];
          return undefined;
        });
      }
    } catch (err) {
      return callMaybePromise(cb, err);
    }
  }

  function set(key, value, cb) {
    if (typeof key !== 'string' || !key) {
      return callMaybePromise(cb, new Error('sync-helper.set: key required'));
    }
    if (!global.chrome || !global.chrome.storage || !global.chrome.storage.sync ||
        !global.chrome.storage.local) {
      return callMaybePromise(cb, new Error('sync-helper.set: chrome.storage unavailable'));
    }
    const area = isSyncKey(key) ? global.chrome.storage.sync : global.chrome.storage.local;
    const obj = {};
    obj[key] = value;
    try {
      const out = area.set(obj, () => {
        callMaybePromise(cb, null, true);
      });
      if (out && typeof out.then === 'function') {
        return out.then(() => true);
      }
    } catch (err) {
      return callMaybePromise(cb, err);
    }
  }

  function remove(key, cb) {
    if (typeof key !== 'string' || !key) {
      return callMaybePromise(cb, new Error('sync-helper.remove: key required'));
    }
    if (!global.chrome || !global.chrome.storage || !global.chrome.storage.sync ||
        !global.chrome.storage.local) {
      return callMaybePromise(cb, new Error('sync-helper.remove: chrome.storage unavailable'));
    }
    const area = isSyncKey(key) ? global.chrome.storage.sync : global.chrome.storage.local;
    try {
      const out = area.remove(key, () => callMaybePromise(cb, null, true));
      if (out && typeof out.then === 'function') return out.then(() => true);
    } catch (err) {
      return callMaybePromise(cb, err);
    }
  }

  function onChanged(listener) {
    if (typeof listener !== 'function') return;
    if (!global.chrome || !global.chrome.storage || !global.chrome.storage.onChanged) return;
    try {
      global.chrome.storage.onChanged.addListener((changes, area) => {
        try { listener(changes, area); } catch (_e) { /* ignore */ }
      });
    } catch (_e) { /* ignore */ }
  }

  const api = {
    classify,
    isSyncKey,
    isLocalKey,
    get,
    set,
    remove,
    onChanged,
    KEYS,
    SYNC_KEYS,
    LOCAL_KEYS,
  };

  // Export shape:
  //   - CommonJS (Node) via module.exports
  //   - AMD via define
  //   - Window via global.NOAIS_SYNC
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else if (typeof global.NOAIS_SYNC === 'undefined') {
    global.NOAIS_SYNC = api;
  }
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : globalThis));
