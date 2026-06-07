// NOAIS — tests for content/page-counter.js
//
// Page counter API:
//   window.NOAIS_PAGE_COUNTER = {
//     shouldHide({ protocol, href, enabled }),
//     create({ document, storage, getCount, getItems, position }),
//     isMounted(document),
//   }
//
// create() returns a handle:
//   { mount(hostEl), unmount(), update(n), expand(), collapse(), isExpanded(), getPosition(), setPosition({x,y}) }
//
// Run with: node tests/run.js

'use strict';

const assert = require('node:assert');
const path = require('node:path');

const API_PATH = path.join(__dirname, '..', 'extension', 'content', 'page-counter.js');

// ---------- DOM stub ----------

function el(tagName, attrs) {
  const classList = {
    _set: new Set(),
    add(c) { this._set.add(c); },
    remove(...cs) { for (const c of cs) this._set.delete(c); },
    contains(c) { return this._set.has(c); },
    toString() { return Array.from(this._set).join(' '); }
  };
  const node = {
    tagName: String(tagName).toUpperCase(),
    children: [],
    childNodes: [],
    classList: classList,
    get className() { return this.classList.toString(); },
    set className(v) {
      this.classList._set = new Set(String(v).split(/\s+/).filter(Boolean));
    },
    dataset: {},
    attributes: {},
    style: {},
    parentNode: null,
    _listeners: {},
    _shadow: null,
    _textContent: '',
    get textContent() {
      if (this.children.length === 0) return this._textContent;
      let out = this._textContent;
      for (const c of this.children) out += c.textContent;
      return out;
    },
    set textContent(v) {
      this._textContent = String(v);
      this.children = [];
      this.childNodes = [];
    },
    appendChild(child) {
      this.children.push(child);
      this.childNodes.push(child);
      child.parentNode = this;
      return child;
    },
    addEventListener(type, fn) {
      (this._listeners[type] = this._listeners[type] || []).push(fn);
    },
    removeEventListener(type, fn) {
      const list = this._listeners[type] || [];
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
    dispatchEvent(event) {
      const list = (this._listeners[event.type] || []).slice();
      for (const fn of list) {
        try { fn.call(this, event); } catch (e) { /* ignore */ }
      }
    },
    querySelector(sel) {
      const out = [];
      findAll(this, sel, out);
      return out[0] || null;
    },
    querySelectorAll(sel) {
      const out = [];
      findAll(this, sel, out);
      return out;
    },
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return this.attributes[k]; },
    attachShadow(opts) {
      const shadow = el('shadow-root');
      shadow.mode = opts && opts.mode;
      this._shadow = shadow;
      return shadow;
    },
  };
  if (attrs) {
    if (attrs.id) node.attributes.id = attrs.id;
    if (attrs.text != null) node._textContent = String(attrs.text);
    if (attrs.className) node.className = attrs.className;
  }
  return node;
}

function findAll(root, sel, out) {
  if (matches(root, sel)) out.push(root);
  for (const child of root.children) {
    findAll(child, sel, out);
  }
}

function matches(node, sel) {
  if (sel.startsWith('#')) {
    return node.attributes && node.attributes.id === sel.slice(1);
  }
  if (sel.startsWith('.')) {
    const cls = sel.slice(1);
    if (cls.includes('.')) {
      return cls.split('.').every(c => node.classList && node.classList.contains(c));
    }
    return node.classList && node.classList.contains(cls);
  }
  if (sel.startsWith('[') && sel.endsWith(']')) {
    const inner = sel.slice(1, -1);
    if (inner.includes('=')) {
      const [attr, val] = inner.split('=').map(s => s.replace(/^["']|["']$/g, ''));
      return (node.dataset && node.dataset[attr] != null)
        ? node.dataset[attr] === val
        : (node.attributes && node.attributes[attr] === val);
    }
    return (node.dataset && node.dataset[attr] != null)
      || (node.attributes && node.attributes[attr] != null);
  }
  return node.tagName === sel.toUpperCase();
}

function makeFakeDocument() {
  const html = el('html');
  const body = el('body');
  html.appendChild(body);
  return {
    createElement: (tag) => el(tag),
    body,
    documentElement: html,
    querySelector(sel) {
      const out = [];
      findAll(html, sel, out);
      return out[0] || null;
    },
    querySelectorAll(sel) {
      const out = [];
      findAll(html, sel, out);
      return out;
    },
  };
}

function makeStorageMock() {
  const data = {};
  return {
    data,
    get(keys, cb) {
      const list = Array.isArray(keys) ? keys : [keys];
      const result = {};
      for (const k of list) result[k] = data[k];
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
  name: 'page-counter: module exports shouldHide, create, isMounted',
  fn: () => {
    delete require.cache[API_PATH];
    const mod = require(API_PATH);
    // The factory may be on `mod`, or under `mod.NOAIS_PAGE_COUNTER`.
    const exports = mod.NOAIS_PAGE_COUNTER || mod;
    assert.strictEqual(typeof exports.shouldHide, 'function', 'shouldHide exported');
    assert.strictEqual(typeof exports.create, 'function', 'create factory exported');
    assert.strictEqual(typeof exports.isMounted, 'function', 'isMounted exported');
  }
});

tests.push({
  name: 'page-counter: shouldHide returns true for disabled/about:/chrome-extension:/moz-extension:',
  fn: () => {
    delete require.cache[API_PATH];
    const mod = require(API_PATH);
    const exports = mod.NOAIS_PAGE_COUNTER || mod;
    // enabled = false → hide
    assert.strictEqual(exports.shouldHide({ protocol: 'https:', href: 'https://x.com', enabled: false }), true);
    // about:* → hide
    assert.strictEqual(exports.shouldHide({ protocol: 'about:', href: 'about:blank', enabled: true }), true);
    // chrome-extension:// → hide
    assert.strictEqual(exports.shouldHide({ protocol: 'chrome-extension:', href: 'chrome-extension://abc/foo.html', enabled: true }), true);
    // moz-extension:// → hide
    assert.strictEqual(exports.shouldHide({ protocol: 'moz-extension:', href: 'moz-extension://abc/foo.html', enabled: true }), true);
    // https + enabled → don't hide
    assert.strictEqual(exports.shouldHide({ protocol: 'https:', href: 'https://example.com', enabled: true }), false);
    // file:// + enabled → don't hide
    assert.strictEqual(exports.shouldHide({ protocol: 'file:', href: 'file:///x.html', enabled: true }), false);
  }
});

tests.push({
  name: 'page-counter: create() returns a handle with mount/unmount/update/expand/collapse/getPosition/setPosition',
  fn: () => {
    delete require.cache[API_PATH];
    const mod = require(API_PATH);
    const exports = mod.NOAIS_PAGE_COUNTER || mod;
    const handle = exports.create({
      document: makeFakeDocument(),
      storage: makeStorageMock(),
      getCount: () => 0,
      getItems: () => [],
    });
    assert.strictEqual(typeof handle.mount, 'function');
    assert.strictEqual(typeof handle.unmount, 'function');
    assert.strictEqual(typeof handle.update, 'function');
    assert.strictEqual(typeof handle.expand, 'function');
    assert.strictEqual(typeof handle.collapse, 'function');
    assert.strictEqual(typeof handle.getPosition, 'function');
    assert.strictEqual(typeof handle.setPosition, 'function');
  }
});

tests.push({
  name: 'page-counter: mount() is idempotent — second call returns the existing handle',
  fn: () => {
    delete require.cache[API_PATH];
    const mod = require(API_PATH);
    const exports = mod.NOAIS_PAGE_COUNTER || mod;
    const document = makeFakeDocument();
    const h1 = exports.create({
      document,
      storage: makeStorageMock(),
      getCount: () => 1,
      getItems: () => [],
    });
    const host = document.documentElement;
    h1.mount(host);
    assert.strictEqual(exports.isMounted(document), true, 'mounted after first call');
    const beforeHandle = h1;
    const h2 = exports.create({
      document,
      storage: makeStorageMock(),
      getCount: () => 2,
      getItems: () => [],
    });
    h2.mount(host);
    // After second mount, the document should still have exactly one
    // [data-noais-page-counter] element.
    const found = document.querySelectorAll('[data-noais-page-counter]');
    assert.strictEqual(found.length, 1, 'exactly one counter widget on the page');
    h1.unmount();
  }
});

tests.push({
  name: 'page-counter: update(n) shows the count returned by getCount() in the widget',
  fn: () => {
    delete require.cache[API_PATH];
    const mod = require(API_PATH);
    const exports = mod.NOAIS_PAGE_COUNTER || mod;
    const handle = exports.create({
      document: makeFakeDocument(),
      storage: makeStorageMock(),
      getCount: () => 12,
      getItems: () => [],
    });
    handle.mount(makeFakeDocument().documentElement);
    handle.update(12);
    // The widget's text (inside the shadow root) should contain the count.
    const widget = handle._widget;
    assert.ok(widget, 'handle._widget is set after mount');
    const shadow = widget._shadow;
    assert.ok(shadow, 'widget has a shadow root');
    const allText = shadow.textContent;
    assert.ok(allText.includes('12'), 'widget text contains the count "12"');
    assert.ok(allText.includes('NOAIS'), 'widget text contains the NOAIS label');
    handle.unmount();
  }
});

tests.push({
  name: 'page-counter: click on counter toggles the --expanded modifier class',
  fn: () => {
    delete require.cache[API_PATH];
    const mod = require(API_PATH);
    const exports = mod.NOAIS_PAGE_COUNTER || mod;
    const handle = exports.create({
      document: makeFakeDocument(),
      storage: makeStorageMock(),
      getCount: () => 3,
      getItems: () => [{ text: 'snippet one', score: 76 }, { text: 'snippet two', score: 81 }],
    });
    handle.mount(makeFakeDocument().documentElement);
    assert.strictEqual(handle.isExpanded(), false, 'starts collapsed');
    // Find the clickable element (the badge host) and dispatch a click.
    const widget = handle._widget;
    const badge = widget._shadow.querySelector('.noais-page-counter');
    assert.ok(badge, 'shadow root contains a .noais-page-counter element');
    badge.dispatchEvent({ type: 'click' });
    assert.strictEqual(handle.isExpanded(), true, 'expanded after click');
    badge.dispatchEvent({ type: 'click' });
    assert.strictEqual(handle.isExpanded(), false, 'collapsed after second click');
    handle.unmount();
  }
});

tests.push({
  name: 'page-counter: drag updates widget position and saves to storage on mouseup',
  fn: () => {
    delete require.cache[API_PATH];
    const mod = require(API_PATH);
    const exports = mod.NOAIS_PAGE_COUNTER || mod;
    const storage = makeStorageMock();
    const handle = exports.create({
      document: makeFakeDocument(),
      storage,
      getCount: () => 0,
      getItems: () => [],
    });
    handle.mount(makeFakeDocument().documentElement);
    const widget = handle._widget;
    const handle_el = widget._shadow.querySelector('.noais-page-counter-drag-handle');
    assert.ok(handle_el, 'shadow root contains a .noais-page-counter-drag-handle');
    // Simulate mousedown → mousemove → mouseup. Stub document/window for coords.
    const initial = handle.getPosition() || { x: 0, y: 0 };
    handle_el.dispatchEvent({ type: 'mousedown', clientX: 100, clientY: 100, stopPropagation() {} });
    // The implementation listens for mousemove on document; we exercise via
    // the handle's own listeners array (best effort).
    const moveListeners = (typeof document !== 'undefined' && document._listeners && document._listeners.mousemove) || [];
    for (const fn of moveListeners) fn({ clientX: 250, clientY: 175 });
    const upListeners = (typeof document !== 'undefined' && document._listeners && document._listeners.mouseup) || [];
    for (const fn of upListeners) fn({ clientX: 250, clientY: 175 });
    // After drag, position should be set to (250, 175) (or thereabouts)
    const after = handle.getPosition();
    assert.ok(after, 'getPosition() returns a value after drag');
    assert.strictEqual(after.x, 250, 'x = clientX after drag');
    assert.strictEqual(after.y, 175, 'y = clientY after drag');
    // Storage should be updated. Wait for the async setImmediate().
    return new Promise((resolve) => setImmediate(() => {
      assert.ok(storage.data.noais_page_counter_position, 'position written to storage');
      assert.strictEqual(storage.data.noais_page_counter_position.x, 250);
      assert.strictEqual(storage.data.noais_page_counter_position.y, 175);
      handle.unmount();
      resolve();
    }));
  }
});

tests.push({
  name: 'page-counter: contextmenu offers 4-corner move options (keyboard a11y fallback)',
  fn: () => {
    delete require.cache[API_PATH];
    const mod = require(API_PATH);
    const exports = mod.NOAIS_PAGE_COUNTER || mod;
    const storage = makeStorageMock();
    const handle = exports.create({
      document: makeFakeDocument(),
      storage,
      getCount: () => 0,
      getItems: () => [],
      viewport: { width: 1000, height: 800 },
    });
    handle.mount(makeFakeDocument().documentElement);
    const widget = handle._widget;
    const badge = widget._shadow.querySelector('.noais-page-counter');
    // Dispatch contextmenu — the implementation should attach a 4-item
    // context-menu (or expose a setCorner method we can call).
    // The spec says "right-click context menu on the counter → Move to
    // bottom-right / top-left / top-right / bottom-left".
    // Easiest test: dispatch contextmenu and assert the 4-corner handler
    // list exists. We accept either an _onCorner(corner) method or
    // _corners = ['bottom-right','top-left','top-right','bottom-left'].
    let corners = handle._corners;
    if (!corners) {
      // Maybe a contextmenu event triggered the menu. Dispatch it.
      const event = { type: 'contextmenu', preventDefault() {} };
      badge.dispatchEvent(event);
      corners = handle._corners;
    }
    assert.ok(corners, 'handle exposes a list of supported corners (either _corners or via contextmenu)');
    assert.strictEqual(corners.length, 4, '4 corners supported');
    assert.ok(corners.includes('bottom-right'), 'bottom-right');
    assert.ok(corners.includes('top-left'), 'top-left');
    assert.ok(corners.includes('top-right'), 'top-right');
    assert.ok(corners.includes('bottom-left'), 'bottom-left');
    // Calling setCorner('top-left') on a 1000x800 viewport should set the
    // position to roughly (0, 0).
    if (typeof handle.setCorner === 'function') {
      handle.setCorner('top-left');
      const p = handle.getPosition();
      assert.ok(p, 'position set after setCorner(top-left)');
      assert.ok(p.x < 50 && p.y < 50, 'top-left position is near (0, 0)');
    }
    handle.unmount();
  }
});

module.exports = tests;
