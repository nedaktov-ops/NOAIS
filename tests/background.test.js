// Tests for background/background.js (v1.1.0) — zero-coverage gap filler
//
// background.js is the MV3 service worker that:
//   1. Imports keyboard-shortcut.js via importScripts()
//   2. Listens for chrome.runtime.onInstalled (logs reason, opens welcome
//      on first install)
//   3. Listens for chrome.runtime.onMessage (type OPEN_WHY_PANEL → open
//      side panel, fallback to new tab)
//   4. Listens for chrome.tabs.onRemoved (clean up per-tab overrides and
//      scan results)
//
// We use vm.createContext + vm.runInContext, same pattern as
// keyboard-shortcut.test.js, so the code executes for real and we
// can stub all chrome.* surfaces.

'use strict';

const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

const BACKGROUND_FILE = path.join(__dirname, '..', 'extension', 'background', 'background.js');

// ---------- helpers ----------

/**
 * Load background.js inside a vm sandbox with the given stub overrides.
 * Returns the sandbox and a `recorded` object that captures all
 * chrome.* calls for test introspection.
 */
function loadBackground(stubs) {
  const code = fs.readFileSync(BACKGROUND_FILE, 'utf8');
  if (!code) throw new Error('background.js not found or empty');

  const recorded = {
    onInstalledHandlers: [],
    onMessageHandlers: [],
    onRemovedHandlers: [],
    tabsCreate: [],
    tabsQuery: [],
    sidePanelOpen: [],
    storageReads: [],
    storageWrites: [],
    consoleLogs: [],
    consoleWarns: [],
    getManifestCalls: 0,
    importScriptsCalls: [],
  };

  // Wrapped stubs: record the call AND delegate to the user's override if provided.
  // This avoids the problem of custom stubs bypassing the recording mechanism.
  const stg = (stubs && stubs.storageGet);
  const storageGetFn = (keys, cb) => {
    recorded.storageReads.push(keys);
    if (stg) return stg(keys, cb);
    if (cb) cb({ noais_tab_overrides: {}, noais_last_scan: {} });
  };
  const sts = (stubs && stubs.storageSet);
  const storageSetFn = (blob, cb) => {
    recorded.storageWrites.push(blob);
    if (sts) return sts(blob, cb);
    if (cb) cb();
  };
  const tcr = (stubs && stubs.tabsCreate);
  const tabsCreateFn = (opts) => {
    recorded.tabsCreate.push(opts);
    if (tcr) return tcr(opts);
  };
  const tq = (stubs && stubs.tabsQuery);
  const tabsQueryFn = (q, cb) => {
    recorded.tabsQuery.push(q);
    if (tq) return tq(q, cb);
    if (cb) cb([]);
  };
  const spo = (stubs && stubs.sidePanelOpen);
  const sidePanelOpenFn = (opts) => {
    recorded.sidePanelOpen.push(opts);
    if (spo) return spo(opts);
  };
  const gmf = (stubs && stubs.getManifest);
  const getManifestFn = () => {
    recorded.getManifestCalls++;
    if (gmf) return gmf();
    return { version: '1.1.1' };
  };
  const ims = (stubs && stubs.importScripts);
  const importScriptsFn = (...args) => {
    recorded.importScriptsCalls.push(args);
    if (ims) return ims(...args);
  };

  const gu = (stubs && stubs.getURL);
  const getURLFn = (p) => {
    if (gu) return gu(p);
    return `chrome-extension://abc/${p}`;
  };

  const onInstalledAddListener = (fn) => { recorded.onInstalledHandlers.push(fn); };
  const onMessageAddListener = (fn) => { recorded.onMessageHandlers.push(fn); };
  const onRemovedAddListener = (fn) => { recorded.onRemovedHandlers.push(fn); };

  const sidePanelAvailable = (stubs && stubs.sidePanelAvailable !== undefined)
    ? stubs.sidePanelAvailable : true;
  const sidePanelOpenAvailable = (stubs && stubs.sidePanelOpenAvailable !== undefined)
    ? stubs.sidePanelOpenAvailable : true;

  const chromeStub = {
    runtime: {
      onInstalled: { addListener: onInstalledAddListener },
      onMessage: { addListener: onMessageAddListener },
      getManifest: getManifestFn,
      getURL: getURLFn,
      lastError: (stubs && stubs.runtimeLastError !== undefined) ? stubs.runtimeLastError : null,
    },
    commands: {
      onCommand: { addListener: () => {} },
    },
    tabs: {
      create: tabsCreateFn,
      query: tabsQueryFn,
      onRemoved: { addListener: onRemovedAddListener },
      sendMessage: () => {},
    },
    sidePanel: sidePanelAvailable ? {
      open: sidePanelOpenAvailable ? sidePanelOpenFn : undefined,
    } : undefined,
    storage: {
      local: {
        get: storageGetFn,
        set: storageSetFn,
      },
    },
  };

  // If sidePanel is absent, ensure open is never called.
  if (!sidePanelAvailable) {
    delete chromeStub.sidePanel;
  }

  const sandbox = {
    chrome: chromeStub,
    console: {
      log: (...args) => { recorded.consoleLogs.push(args); },
      warn: (...args) => { recorded.consoleWarns.push(args); },
    },
    importScripts: importScriptsFn,
    setTimeout, clearTimeout, setInterval, clearInterval,
    URL,
  };

  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'background.js' });
  return { sandbox, recorded };
}

const tests = [];

// =====================================================================
// importScripts
// =====================================================================

tests.push({
  name: 'background: imports keyboard-shortcut.js via importScripts',
  fn: () => {
    const { recorded } = loadBackground();
    assert.ok(recorded.importScriptsCalls.length >= 1, 'importScripts was called');
    const found = recorded.importScriptsCalls.some(
      (args) => args.some((a) => a.includes('keyboard-shortcut.js'))
    );
    assert.ok(found, 'importScripts called with keyboard-shortcut.js');
  },
});

// =====================================================================
// chrome.runtime.onInstalled — listener registration
// =====================================================================

tests.push({
  name: 'background: registers onInstalled listener',
  fn: () => {
    const { recorded } = loadBackground();
    assert.strictEqual(recorded.onInstalledHandlers.length, 1, 'exactly one onInstalled listener');
  },
});

// =====================================================================
// chrome.runtime.onInstalled — 'install' reason
// =====================================================================

tests.push({
  name: 'background: onInstalled with reason=install logs version and opens welcome tab',
  fn: () => {
    const { recorded } = loadBackground();
    const handler = recorded.onInstalledHandlers[0];
    handler({ reason: 'install' });
    // Should log something about version
    const logMsgs = recorded.consoleLogs.map((a) => a.join(' '));
    const hasVersionLog = logMsgs.some((m) => m.includes('v1.1.1') && m.includes('install'));
    assert.ok(hasVersionLog, 'should log v1.1.1 installed with reason install');
    // Should open welcome tab
    assert.strictEqual(recorded.tabsCreate.length, 1, 'should open one tab');
    const tabUrl = recorded.tabsCreate[0].url || '';
    assert.ok(tabUrl.includes('welcome.html'), 'tab URL should contain welcome.html');
  },
});

// =====================================================================
// chrome.runtime.onInstalled — 'update' reason
// =====================================================================

tests.push({
  name: 'background: onInstalled with reason=update logs version but does NOT open welcome tab',
  fn: () => {
    const { recorded } = loadBackground();
    const handler = recorded.onInstalledHandlers[0];
    handler({ reason: 'update' });
    const logMsgs = recorded.consoleLogs.map((a) => a.join(' '));
    const hasVersionLog = logMsgs.some((m) => m.includes('v1.1.1') && m.includes('update'));
    assert.ok(hasVersionLog, 'should log v1.1.1 installed with reason update');
    // Should NOT open welcome tab
    assert.strictEqual(recorded.tabsCreate.length, 0, 'should NOT open welcome tab on update');
  },
});

// =====================================================================
// chrome.runtime.onInstalled — ignored reasons
// =====================================================================

tests.push({
  name: 'background: onInstalled with reason=chrome_update is silently ignored',
  fn: () => {
    const { recorded } = loadBackground();
    const handler = recorded.onInstalledHandlers[0];
    handler({ reason: 'chrome_update' });
    assert.strictEqual(recorded.consoleLogs.length, 0, 'should not log anything');
    assert.strictEqual(recorded.tabsCreate.length, 0, 'should not open any tab');
  },
});

tests.push({
  name: 'background: onInstalled with reason=shared_module_update is silently ignored',
  fn: () => {
    const { recorded } = loadBackground();
    const handler = recorded.onInstalledHandlers[0];
    handler({ reason: 'shared_module_update' });
    assert.strictEqual(recorded.consoleLogs.length, 0, 'should not log anything');
    assert.strictEqual(recorded.tabsCreate.length, 0, 'should not open any tab');
  },
});

// =====================================================================
// chrome.runtime.onInstalled — missing/invalid details
// =====================================================================

tests.push({
  name: 'background: onInstalled with null/undefined details returns early (no log, no tab)',
  fn: () => {
    const { recorded } = loadBackground();
    const handler = recorded.onInstalledHandlers[0];
    // Call with null details
    handler(null);
    // Details is null → reason becomes 'unknown' via the fallback, then the
    // guard `if (reason !== 'install' && reason !== 'update') return;` fires,
    // so nothing is logged and no tab is opened.
    assert.strictEqual(recorded.consoleLogs.length, 0, 'should not log anything');
    assert.strictEqual(recorded.tabsCreate.length, 0, 'should not open any tab');
  },
});

tests.push({
  name: 'background: onInstalled with undefined details.reason returns early (no log, no tab)',
  fn: () => {
    const { recorded } = loadBackground();
    const handler = recorded.onInstalledHandlers[0];
    handler({});
    // {} && {}.reason → undefined → 'unknown' → filtered out by the guard
    assert.strictEqual(recorded.consoleLogs.length, 0, 'should not log anything');
    assert.strictEqual(recorded.tabsCreate.length, 0, 'should not open any tab');
  },
});

// =====================================================================
// chrome.runtime.onInstalled — getManifest error path
// =====================================================================

tests.push({
  name: 'background: onInstalled handles getManifest throwing gracefully, falls back to unknown',
  fn: () => {
    const stubs = {
      getManifest: () => { throw new Error('manifest unavailable'); },
    };
    const { recorded } = loadBackground(stubs);
    const handler = recorded.onInstalledHandlers[0];
    handler({ reason: 'install' });
    // Should log with fallback version 'unknown' — never lie about version
    const logMsgs = recorded.consoleLogs.map((a) => a.join(' '));
    assert.ok(logMsgs.some((m) => m.includes('vunknown')), 'should use fallback version string');
    assert.strictEqual(recorded.tabsCreate.length, 1, 'should still open welcome tab');
  },
});

tests.push({
  name: 'background: onInstalled handles getManifest returning null gracefully, falls back to unknown',
  fn: () => {
    const stubs = {
      getManifest: () => null,
    };
    const { recorded } = loadBackground(stubs);
    const handler = recorded.onInstalledHandlers[0];
    handler({ reason: 'install' });
    const logMsgs = recorded.consoleLogs.map((a) => a.join(' '));
    assert.ok(logMsgs.some((m) => m.includes('vunknown')), 'should use fallback version');
    assert.strictEqual(recorded.tabsCreate.length, 1, 'should still open welcome tab');
  },
});

// =====================================================================
// chrome.runtime.onInstalled — welcome tab creation failure
// =====================================================================

tests.push({
  name: 'background: onInstalled handles tabs.create throwing, logs warning',
  fn: () => {
    const stubs = {
      tabsCreate: () => { throw new Error('tabs.create failed'); },
    };
    const { recorded } = loadBackground(stubs);
    const handler = recorded.onInstalledHandlers[0];
    handler({ reason: 'install' });
    // Should log a warning about failing to open welcome page
    const warnMsgs = recorded.consoleWarns.map((a) => a.join(' '));
    assert.ok(warnMsgs.some((m) => m.includes('failed to open welcome page')), 'should log warning');
  },
});

// =====================================================================
// chrome.runtime.onMessage — listener registration
// =====================================================================

tests.push({
  name: 'background: registers onMessage listener',
  fn: () => {
    const { recorded } = loadBackground();
    assert.strictEqual(recorded.onMessageHandlers.length, 1, 'exactly one onMessage listener');
  },
});

// =====================================================================
// chrome.runtime.onMessage — OPEN_WHY_PANEL opens sidePanel
// =====================================================================

tests.push({
  name: 'background: onMessage OPEN_WHY_PANEL opens sidePanel with correct tabId',
  fn: () => {
    const { sandbox, recorded } = loadBackground();
    const handler = recorded.onMessageHandlers[0];
    // Verify sidePanel setup before calling handler
    const sp = sandbox.chrome && sandbox.chrome.sidePanel;
    assert.ok(sp, 'chrome.sidePanel must exist');
    assert.ok(typeof sp.open === 'function', 'chrome.sidePanel.open must be a function');
    assert.strictEqual(sp.open.name, 'sidePanelOpenFn', 'sidePanel.open must be our stub');
    const result = handler(
      { type: 'OPEN_WHY_PANEL' },
      { tab: { id: 42, url: 'https://example.com' } }
    );
    // Should open sidePanel
    assert.strictEqual(recorded.sidePanelOpen.length, 1, 'sidePanel.open should be called');
    // Use property-by-property check to avoid VM cross-realm prototype mismatch
    assert.strictEqual(recorded.sidePanelOpen[0].tabId, 42, 'should open sidePanel for tab 42');
    // Should return false (indicating we will not call sendResponse)
    assert.strictEqual(result, false, 'listener should return false');
  },
});

// =====================================================================
// chrome.runtime.onMessage — sidePanel fallback to tabs.create
// =====================================================================

tests.push({
  name: 'background: onMessage OPEN_WHY_PANEL falls back to tabs.create when sidePanel is unavailable',
  fn: () => {
    const stubs = {
      sidePanelAvailable: false,
    };
    const { recorded } = loadBackground(stubs);
    const handler = recorded.onMessageHandlers[0];
    handler(
      { type: 'OPEN_WHY_PANEL' },
      { tab: { id: 7, url: 'https://example.com' } }
    );
    assert.strictEqual(recorded.sidePanelOpen.length, 0, 'sidePanel.open should NOT be called');
    assert.strictEqual(recorded.tabsCreate.length, 1, 'tabs.create should be called as fallback');
    const url = recorded.tabsCreate[0].url || '';
    assert.ok(url.includes('why.html'), 'fallback URL should contain why.html');
    assert.ok(url.includes('tabId=7'), 'fallback URL should include tabId=7');
  },
});

tests.push({
  name: 'background: onMessage OPEN_WHY_PANEL fallback works when sidePanel.open is not a function',
  fn: () => {
    const stubs = {
      sidePanelAvailable: true,
      sidePanelOpenAvailable: false,
    };
    const { recorded } = loadBackground(stubs);
    const handler = recorded.onMessageHandlers[0];
    handler(
      { type: 'OPEN_WHY_PANEL' },
      { tab: { id: 7, url: 'https://example.com' } }
    );
    assert.strictEqual(recorded.sidePanelOpen.length, 0, 'sidePanel.open should NOT be called (not a function)');
    assert.strictEqual(recorded.tabsCreate.length, 1, 'tabs.create should be called as fallback');
  },
});

// =====================================================================
// chrome.runtime.onMessage — missing sender.tab
// When tabId is null, the code goes to the else branch (tabs.create)
// because `tabId !== null` is false.
// =====================================================================

tests.push({
  name: 'background: onMessage OPEN_WHY_PANEL with null tabId falls back to tabs.create',
  fn: () => {
    const { recorded } = loadBackground();
    const handler = recorded.onMessageHandlers[0];
    handler(
      { type: 'OPEN_WHY_PANEL' },
      { tab: { url: 'https://example.com' } }  // no id
    );
    // tabId is null → condition `tabId !== null` is false → else branch
    assert.strictEqual(recorded.sidePanelOpen.length, 0, 'sidePanel.open should NOT be called');
    assert.strictEqual(recorded.tabsCreate.length, 1, 'tabs.create should be called');
    const url = recorded.tabsCreate[0].url || '';
    assert.ok(url.includes('why.html'), 'URL should contain why.html');
    assert.ok(!url.includes('tabId='), 'URL should NOT contain tabId= when tabId is null');
  },
});

tests.push({
  name: 'background: onMessage OPEN_WHY_PANEL with no sender.tab at all falls back to tabs.create',
  fn: () => {
    const { recorded } = loadBackground();
    const handler = recorded.onMessageHandlers[0];
    handler(
      { type: 'OPEN_WHY_PANEL' },
      {}  // no tab property
    );
    // tabId is null → else branch (tabs.create)
    assert.strictEqual(recorded.sidePanelOpen.length, 0, 'sidePanel.open should NOT be called');
    assert.strictEqual(recorded.tabsCreate.length, 1, 'tabs.create should be called');
    const url = recorded.tabsCreate[0].url || '';
    assert.ok(url.includes('why.html'), 'URL should contain why.html');
  },
});

// =====================================================================
// chrome.runtime.onMessage — invalid message types
// =====================================================================

tests.push({
  name: 'background: onMessage with non-object message returns false and does nothing',
  fn: () => {
    const { recorded } = loadBackground();
    const handler = recorded.onMessageHandlers[0];
    const result = handler(null);
    assert.strictEqual(result, false, 'should return false');
    assert.strictEqual(recorded.sidePanelOpen.length, 0, 'should not open sidePanel');
    assert.strictEqual(recorded.tabsCreate.length, 0, 'should not create tab');
  },
});

tests.push({
  name: 'background: onMessage with wrong type returns false and does nothing',
  fn: () => {
    const { recorded } = loadBackground();
    const handler = recorded.onMessageHandlers[0];
    const result = handler({ type: 'SOMETHING_ELSE' }, { tab: { id: 1 } });
    assert.strictEqual(result, false, 'should return false');
    assert.strictEqual(recorded.sidePanelOpen.length, 0, 'should not open sidePanel');
    assert.strictEqual(recorded.tabsCreate.length, 0, 'should not create tab');
  },
});

tests.push({
  name: 'background: onMessage with string message returns false and does nothing',
  fn: () => {
    const { recorded } = loadBackground();
    const handler = recorded.onMessageHandlers[0];
    const result = handler('OPEN_WHY_PANEL');
    assert.strictEqual(result, false, 'should return false');
    assert.strictEqual(recorded.sidePanelOpen.length, 0, 'should not open sidePanel');
  },
});

// =====================================================================
// chrome.runtime.onMessage — sidePanel.open failure
// =====================================================================

tests.push({
  name: 'background: onMessage OPEN_WHY_PANEL handles sidePanel.open throwing, logs warning',
  fn: () => {
    const stubs = {
      sidePanelOpen: () => { throw new Error('sidePanel.open failed'); },
    };
    const { recorded } = loadBackground(stubs);
    const handler = recorded.onMessageHandlers[0];
    handler({ type: 'OPEN_WHY_PANEL' }, { tab: { id: 1 } });
    const warnMsgs = recorded.consoleWarns.map((a) => a.join(' '));
    assert.ok(warnMsgs.some((m) => m.includes('OPEN_WHY_PANEL failed')), 'should log warning');
  },
});

// =====================================================================
// chrome.tabs.onRemoved — listener registration
// =====================================================================

tests.push({
  name: 'background: registers onRemoved listener',
  fn: () => {
    const { recorded } = loadBackground();
    assert.strictEqual(recorded.onRemovedHandlers.length, 1, 'exactly one onRemoved listener');
  },
});

// =====================================================================
// chrome.tabs.onRemoved — cleans up tab overrides and scans
// =====================================================================

tests.push({
  name: 'background: onRemoved removes tab override and scan result for the closed tab',
  fn: () => {
    const storageState = {
      noais_tab_overrides: { 7: true, 42: true },
      noais_last_scan: { 7: { count: 3, scannedAt: Date.now() }, 99: { count: 1, scannedAt: Date.now() } },
    };
    const stubs = {
      storageGet: (keys, cb) => cb(storageState),
      storageSet: (blob, cb) => {
        // Capture writes but also update storageState so chained reads work
        Object.assign(storageState, blob);
        if (cb) cb();
      },
    };
    const { recorded } = loadBackground(stubs);
    const handler = recorded.onRemovedHandlers[0];

    // Wrap the storage.local.get call: the handler uses chrome.storage.local.get
    // We need to simulate tab ID 7 being removed
    handler(7);

    // Should have read storage
    assert.ok(recorded.storageReads.length >= 1, 'storage.local.get was called');

    // Should have written back with tab 7 removed
    const writes = recorded.storageWrites;
    assert.ok(writes.length >= 1, 'storage.local.set was called');
    const lastWrite = writes[writes.length - 1];
    assert.ok(lastWrite, 'there is a write blob');
    if (lastWrite.noais_tab_overrides) {
      assert.strictEqual(lastWrite.noais_tab_overrides[7], undefined, 'tab 7 override removed');
      assert.strictEqual(lastWrite.noais_tab_overrides[42], true, 'tab 42 override preserved');
    }
    if (lastWrite.noais_last_scan) {
      assert.strictEqual(lastWrite.noais_last_scan[7], undefined, 'tab 7 scan removed');
      assert.strictEqual(lastWrite.noais_last_scan[99].count, 1, 'tab 99 scan preserved');
    }
  },
});

// =====================================================================
// chrome.tabs.onRemoved — no data for that tab
// =====================================================================

tests.push({
  name: 'background: onRemoved does NOT write storage when tab has no overrides or scans',
  fn: () => {
    const storageState = {
      noais_tab_overrides: { 42: true },
      noais_last_scan: { 42: { count: 1, scannedAt: Date.now() } },
    };
    const stubs = {
      storageGet: (keys, cb) => cb(storageState),
    };
    const { recorded } = loadBackground(stubs);
    const handler = recorded.onRemovedHandlers[0];
    // Tab 99 has no data
    handler(99);
    // Should have read storage
    assert.ok(recorded.storageReads.length >= 1, 'storage.local.get was called');
    // Should NOT have written storage (nothing changed)
    assert.strictEqual(recorded.storageWrites.length, 0, 'storage.local.set should NOT be called');
  },
});

// =====================================================================
// chrome.tabs.onRemoved — null/undefined storage data
// =====================================================================

tests.push({
  name: 'background: onRemoved handles missing storage data gracefully (null result)',
  fn: () => {
    const stubs = {
      storageGet: (keys, cb) => cb(null),
    };
    const { recorded } = loadBackground(stubs);
    const handler = recorded.onRemovedHandlers[0];
    // Should not throw
    handler(7);
    assert.strictEqual(recorded.storageWrites.length, 0, 'should not write storage');
  },
});

tests.push({
  name: 'background: onRemoved handles undefined storage data gracefully',
  fn: () => {
    const stubs = {
      storageGet: (keys, cb) => cb(undefined),
    };
    const { recorded } = loadBackground(stubs);
    const handler = recorded.onRemovedHandlers[0];
    handler(7);
    assert.strictEqual(recorded.storageWrites.length, 0, 'should not write storage');
  },
});

tests.push({
  name: 'background: onRemoved handles non-object overrides gracefully',
  fn: () => {
    const stubs = {
      storageGet: (keys, cb) => cb({ noais_tab_overrides: 'not-an-object', noais_last_scan: {} }),
    };
    const { recorded } = loadBackground(stubs);
    const handler = recorded.onRemovedHandlers[0];
    handler(7);
    assert.strictEqual(recorded.storageWrites.length, 0, 'should not write storage (nothing to delete)');
  },
});

tests.push({
  name: 'background: onRemoved handles non-object scans gracefully',
  fn: () => {
    const stubs = {
      storageGet: (keys, cb) => cb({ noais_tab_overrides: {}, noais_last_scan: 'not-an-object' }),
    };
    const { recorded } = loadBackground(stubs);
    const handler = recorded.onRemovedHandlers[0];
    handler(7);
    assert.strictEqual(recorded.storageWrites.length, 0, 'should not write storage');
  },
});

// =====================================================================
// chrome.tabs.onRemoved — storage error (lastError)
// =====================================================================

tests.push({
  name: 'background: onRemoved handles chrome.runtime.lastError on storage.get gracefully',
  fn: () => {
    let getCb = null;
    const stubs = {
      storageGet: (keys, cb) => {
        getCb = cb;
        // The callback will fire with lastError set
      },
      runtimeLastError: { message: 'storage error' },
    };
    const { recorded } = loadBackground(stubs);
    const handler = recorded.onRemovedHandlers[0];
    handler(7);
    // Manually invoke the callback with lastError set
    if (getCb) {
      getCb({ noais_tab_overrides: { 7: true }, noais_last_scan: {} });
    }
    // The handler checks `if (chrome.runtime && chrome.runtime.lastError) return;`
    // Since lastError is truthy, it should return early without writing
    assert.strictEqual(recorded.storageWrites.length, 0, 'should not write storage when lastError is set');
  },
});

// =====================================================================
// chrome.tabs.onRemoved — storage.local.set failure (caught by try/catch)
// =====================================================================

tests.push({
  name: 'background: onRemoved catches storage.local.set errors silently',
  fn: () => {
    const storageState = {
      noais_tab_overrides: { 7: true },
      noais_last_scan: { 7: { count: 1, scannedAt: Date.now() } },
    };
    const stubs = {
      storageGet: (keys, cb) => cb(storageState),
      storageSet: () => { throw new Error('storage write failed'); },
    };
    const { recorded } = loadBackground(stubs);
    const handler = recorded.onRemovedHandlers[0];
    // Should not throw — the error is caught by the empty catch block
    handler(7);
    // Even though set threw, we don't expect an uncaught exception
    assert.ok(true, 'onRemoved did not throw');
  },
});

// =====================================================================
// Edge case: onInstalled with reason 'install' but tabs.create fails
// (already covered above — tabsCreate throwing)

// Edge case: onMessage with null sender
// =====================================================================

tests.push({
  name: 'background: onMessage OPEN_WHY_PANEL with null sender falls back to tabs.create',
  fn: () => {
    const { recorded } = loadBackground();
    const handler = recorded.onMessageHandlers[0];
    handler({ type: 'OPEN_WHY_PANEL' }, null);
    // tabId is null → else branch (tabs.create)
    assert.strictEqual(recorded.sidePanelOpen.length, 0, 'sidePanel.open should NOT be called');
    assert.strictEqual(recorded.tabsCreate.length, 1, 'tabs.create should be called');
    const url = recorded.tabsCreate[0].url || '';
    assert.ok(url.includes('why.html'), 'URL should contain why.html');
  },
});

// =====================================================================
// Edge case: onMessage with sender.tab.id that is not a number
// =====================================================================

tests.push({
  name: 'background: onMessage with non-numeric sender.tab.id falls back to tabs.create',
  fn: () => {
    const { recorded } = loadBackground();
    const handler = recorded.onMessageHandlers[0];
    handler(
      { type: 'OPEN_WHY_PANEL' },
      { tab: { id: 'not-a-number' } }
    );
    // tabId is null (typeof 'not-a-number' !== 'number') → else branch
    assert.strictEqual(recorded.sidePanelOpen.length, 0, 'sidePanel.open should NOT be called');
    assert.strictEqual(recorded.tabsCreate.length, 1, 'tabs.create should be called');
    const url = recorded.tabsCreate[0].url || '';
    assert.ok(url.includes('why.html'), 'URL should contain why.html');
  },
});

// =====================================================================
// edge case: onInstalled with reason 'install' but chrome.runtime.getURL throws
// =====================================================================

tests.push({
  name: 'background: onInstalled handles getURL throwing gracefully',
  fn: () => {
    const stubs = {
      getURL: (p) => { throw new Error('getURL failed'); },
    };
    const { recorded } = loadBackground(stubs);
    const handler = recorded.onInstalledHandlers[0];
    handler({ reason: 'install' });
    // Should log a warning about failing to open welcome page
    const warnMsgs = recorded.consoleWarns.map((a) => a.join(' '));
    assert.ok(warnMsgs.some((m) => m.includes('failed to open welcome page')), 'should log warning when getURL fails');
    // tabs.create should not have been called because getURL threw before tabs.create was reached
    assert.strictEqual(recorded.tabsCreate.length, 0, 'tabs.create should not be called when getURL fails');
  },
});

module.exports = tests;
