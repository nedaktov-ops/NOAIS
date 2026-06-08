// Tests for background/keyboard-shortcut.js (v1.1.0)
// TDD discipline: these tests fail BEFORE the implementation exists.
//
// keyboard-shortcut.js:
//  - Listens for chrome.commands.onCommand
//  - On 'noais-toggle-site', reads the active tab, computes the hostname,
//    flips the per-site override in noais_site_overrides, writes back,
//    then notifies the content script with { type: 'NOAIS_SITE_TOGGLED' }.

'use strict';

const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

function loadKeyboardShortcut(stubs) {
  const file = path.join(__dirname, '..', 'extension', 'background', 'keyboard-shortcut.js');
  if (!fs.existsSync(file)) {
    throw new Error('background/keyboard-shortcut.js not found');
  }
  const code = fs.readFileSync(file, 'utf8');
  // Build a recorder that the test can introspect.
  const recorded = {
    commandHandlers: [],
    storageReads: [],
    storageWrites: [],
    tabsQueries: [],
    sentMessages: [],
    runtimeLastError: null,
  };
  // Base stub with full chrome.* surface. Tests may override individual
  // verbs via the `stubs` argument; we always preserve commands.onCommand
  // so the handler registers.
  const tabsQuery = (stubs && stubs.tabsQuery) || ((q, cb) => cb([{ id: 42, url: 'https://example.com/page', windowId: 1 }]));
  const storageGet = (stubs && stubs.storageGet) || ((keys, cb) => cb({ noais_site_overrides: {} }));
  const storageSet = (stubs && stubs.storageSet) || ((blob, cb) => { if (cb) cb(); });
  const chromeStub = {
    commands: {
      onCommand: {
        addListener(handler) { recorded.commandHandlers.push(handler); },
      },
    },
    tabs: {
      query(q, cb) { recorded.tabsQueries.push(q); tabsQuery(q, cb); },
      sendMessage(tabId, msg) { recorded.sentMessages.push({ tabId, msg }); },
    },
    runtime: {
      get lastError() { return recorded.runtimeLastError; },
    },
    storage: {
      local: {
        get(keys, cb) { recorded.storageReads.push(keys); storageGet(keys, cb); },
        set(blob, cb) { recorded.storageWrites.push(blob); storageSet(blob, cb); },
      },
    },
  };
  const sandbox = {
    chrome: chromeStub,
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    URL,
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'keyboard-shortcut.js' });
  return { sandbox, recorded };
}

const tests = [];

tests.push({
  name: 'keyboard-shortcut: registers a chrome.commands.onCommand listener',
  fn: () => {
    const { recorded } = loadKeyboardShortcut();
    assert.strictEqual(recorded.commandHandlers.length, 1, 'exactly one listener registered');
  },
});

tests.push({
  name: 'keyboard-shortcut: noais-toggle-site flips the per-site override and notifies the tab',
  fn: () => {
    // Stub storage to start with the site enabled (override = true).
    const stubState = { noais_site_overrides: { 'example.com': true } };
    const stubs = {
      tabsQuery: (q, cb) => cb([{ id: 7, url: 'https://example.com/page', windowId: 1 }]),
      storageGet: (keys, cb) => cb(stubState),
      storageSet: (blob, cb) => { Object.assign(stubState, blob); if (cb) cb(); },
    };
    const { recorded } = loadKeyboardShortcut(stubs);
    const handler = recorded.commandHandlers[0];
    assert.ok(typeof handler === 'function', 'handler is a function');
    handler('noais-toggle-site');
    // Storage was read and written.
    assert.ok(recorded.storageReads.length >= 1, 'storage.local.get was called');
    assert.ok(recorded.storageWrites.length >= 1, 'storage.local.set was called');
    const write = recorded.storageWrites[0];
    assert.ok(write.noais_site_overrides, 'wrote noais_site_overrides');
    // Was previously true → now false.
    assert.strictEqual(write.noais_site_overrides['example.com'], false, 'override flipped to false');
    // Tab notified.
    assert.strictEqual(recorded.sentMessages.length, 1, 'one message sent');
    assert.strictEqual(recorded.sentMessages[0].tabId, 7);
    assert.strictEqual(recorded.sentMessages[0].msg.type, 'NOAIS_SITE_TOGGLED');
  },
});

tests.push({
  name: 'keyboard-shortcut: previously-absent override becomes false (turns OFF a default-on site)',
  fn: () => {
    const stubState = { noais_site_overrides: {} };
    const stubs = {
      tabsQuery: (q, cb) => cb([{ id: 11, url: 'https://www.youtube.com/watch?v=abc', windowId: 1 }]),
      storageGet: (keys, cb) => cb(stubState),
      storageSet: (blob, cb) => { Object.assign(stubState, blob); if (cb) cb(); },
    };
    const { recorded } = loadKeyboardShortcut(stubs);
    recorded.commandHandlers[0]('noais-toggle-site');
    const write = recorded.storageWrites[0];
    // Effective default was true (curated). Toggle flips it to false.
    assert.strictEqual(write.noais_site_overrides['www.youtube.com'], false);
  },
});

tests.push({
  name: 'keyboard-shortcut: ignores unknown commands',
  fn: () => {
    const { recorded } = loadKeyboardShortcut();
    recorded.commandHandlers[0]('something-else');
    assert.strictEqual(recorded.storageReads.length, 0);
    assert.strictEqual(recorded.storageWrites.length, 0);
    assert.strictEqual(recorded.sentMessages.length, 0);
  },
});

tests.push({
  name: 'keyboard-shortcut: ignores tabs without an http(s) URL (chrome://, file://)',
  fn: () => {
    const stubState = { noais_site_overrides: {} };
    const stubs = {
      tabsQuery: (q, cb) => cb([{ id: 13, url: 'chrome://settings', windowId: 1 }]),
      storageGet: (keys, cb) => cb(stubState),
      storageSet: (blob, cb) => { Object.assign(stubState, blob); if (cb) cb(); },
    };
    const { recorded } = loadKeyboardShortcut(stubs);
    recorded.commandHandlers[0]('noais-toggle-site');
    assert.strictEqual(recorded.storageWrites.length, 0, 'must not write storage for non-http tabs');
    assert.strictEqual(recorded.sentMessages.length, 0, 'must not message non-http tabs');
  },
});

module.exports = tests;
