// NOAIS — tests for content/page-counter.js
// 100% synchronous (matches tests/run.js pattern).

'use strict';

const assert = require('node:assert');
const path = require('node:path');

const API_PATH = path.join(__dirname, '..', 'extension', 'content', 'page-counter.js');

// ---------- DOM stub (same shape as adapters.test.js) ----------

function el(tagName, attrs) {
  const classList = {
    _set: new Set(),
    add(c) { this._set.add(c); },
    remove(...cs) { for (const c of cs) this._set.delete(c); },
    contains(c) { return this._set.has(c); },
    toString() { return Array.from(this._set).join(' '); },
  };
  const node = {
    tagName: String(tagName).toUpperCase(),
    children: [],
    childNodes: [],
    classList,
    get className() { return this.classList.toString(); },
    set className(v) { this.classList._set = new Set(String(v).split(/\s+/).filter(Boolean)); },
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
    removeChild(child) {
      this.children = this.children.filter((c) => c !== child);
      child.parentNode = null;
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
      const walk = (root, sel, out) => {
        if (matches(root, sel)) out.push(root);
        for (const c of root.children) walk(c, sel, out);
      };
      walk(this, sel, out);
      return out[0] || null;
    },
    querySelectorAll(sel) {
      const out = [];
      const walk = (root, sel, out) => {
        if (matches(root, sel)) out.push(root);
        for (const c of root.children) walk(c, sel, out);
      };
      walk(this, sel, out);
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
    removeChild(child) {
      this.children = this.children.filter((c) => c !== child);
      child.parentNode = null;
      return child;
    },
    querySelector(sel) {
      const out = [];
      const walk = (root, sel, out) => {
        if (matches(root, sel)) out.push(root);
        for (const c of root.children) walk(c, sel, out);
      };
      walk(this, sel, out);
      return out[0] || null;
    },
    querySelectorAll(sel) {
      const out = [];
      const walk = (root, sel, out) => {
        if (matches(root, sel)) out.push(root);
        for (const c of root.children) walk(c, sel, out);
      };
      walk(this, sel, out);
      return out;
    },
  };
  if (attrs) {
    if (attrs.id) node.attributes.id = attrs.id;
    if (attrs.text != null) node._textContent = String(attrs.text);
    if (attrs.className) node.className = attrs.className;
  }
  return node;
}

function matches(node, sel) {
  if (sel.startsWith('.')) {
    const cls = sel.slice(1);
    return node.classList && node.classList.contains(cls);
  }
  if (sel.startsWith('[') && sel.endsWith(']')) {
    const inner = sel.slice(1, -1);
    if (inner.includes('=')) {
      const [attr, val] = inner.split('=').map((s) => s.replace(/^["']|["']$/g, ''));
      return (node.dataset && node.dataset[attr] != null)
        ? node.dataset[attr] === val
        : (node.attributes && node.attributes[attr] === val);
    }
    return (node.dataset && node.dataset[inner] != null)
      || (node.attributes && node.attributes[inner] != null);
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
      const walk = (root, sel, out) => {
        if (matches(root, sel)) out.push(root);
        for (const c of root.children) walk(c, sel, out);
      };
      walk(html, sel, out);
      return out[0] || null;
    },
    querySelectorAll(sel) {
      const out = [];
      const walk = (root, sel, out) => {
        if (matches(root, sel)) out.push(root);
        for (const c of root.children) walk(c, sel, out);
      };
      walk(html, sel, out);
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

// ---------- Tests ----------

const tests = [];

tests.push({
  name: 'page-counter: module exports shouldHide, create, isMounted',
  fn: () => {
    delete require.cache[API_PATH];
    const mod = require(API_PATH);
    const api = mod.NOAIS_PAGE_COUNTER || mod;
    assert.strictEqual(typeof api.shouldHide, 'function');
    assert.strictEqual(typeof api.create, 'function');
    assert.strictEqual(typeof api.isMounted, 'function');
  },
});

tests.push({
  name: 'page-counter: shouldHide returns true for disabled/about:/chrome-extension:/moz-extension:',
  fn: () => {
    delete require.cache[API_PATH];
    const api = (require(API_PATH)).NOAIS_PAGE_COUNTER || require(API_PATH);
    assert.strictEqual(api.shouldHide({ protocol: 'https:', href: 'https://x.com', enabled: false }), true);
    assert.strictEqual(api.shouldHide({ protocol: 'about:', href: 'about:blank', enabled: true }), true);
    assert.strictEqual(api.shouldHide({ protocol: 'chrome-extension:', href: 'chrome-extension://abc/foo.html', enabled: true }), true);
    assert.strictEqual(api.shouldHide({ protocol: 'moz-extension:', href: 'moz-extension://abc/foo.html', enabled: true }), true);
    assert.strictEqual(api.shouldHide({ protocol: 'https:', href: 'https://example.com', enabled: true }), false);
    assert.strictEqual(api.shouldHide({ protocol: 'file:', href: 'file:///x.html', enabled: true }), false);
  },
});

tests.push({
  name: 'page-counter: create() returns a handle with mount/unmount/update/expand/collapse/getPosition/setPosition',
  fn: () => {
    delete require.cache[API_PATH];
    const api = (require(API_PATH)).NOAIS_PAGE_COUNTER || require(API_PATH);
    const handle = api.create({
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
  },
});

tests.push({
  name: 'page-counter: mount() is idempotent — second call returns the existing handle',
  fn: () => {
    delete require.cache[API_PATH];
    const api = (require(API_PATH)).NOAIS_PAGE_COUNTER || require(API_PATH);
    const document = makeFakeDocument();
    const h1 = api.create({ document, storage: makeStorageMock(), getCount: () => 1, getItems: () => [] });
    const host = document.documentElement;
    h1.mount(host);
    assert.strictEqual(api.isMounted(document), true);
    const h2 = api.create({ document, storage: makeStorageMock(), getCount: () => 2, getItems: () => [] });
    h2.mount(host);
    const found = document.querySelectorAll('[data-noais-page-counter]');
    assert.strictEqual(found.length, 1, 'exactly one counter widget');
    h1.unmount();
  },
});

tests.push({
  name: 'page-counter: update(n) shows the count in the widget',
  fn: () => {
    delete require.cache[API_PATH];
    const api = (require(API_PATH)).NOAIS_PAGE_COUNTER || require(API_PATH);
    const document = makeFakeDocument();
    const handle = api.create({
      document,
      storage: makeStorageMock(),
      getCount: () => 12,
      getItems: () => [],
    });
    handle.mount(document.documentElement);
    handle.update(12);
    const widget = handle._widget;
    assert.ok(widget, 'handle._widget is set');
    const shadow = widget._shadow;
    assert.ok(shadow, 'widget has a shadow root');
    const allText = shadow.textContent;
    assert.ok(allText.includes('12'), 'widget text contains count "12"');
    assert.ok(allText.includes('NOAIS'), 'widget text contains NOAIS label');
    handle.unmount();
  },
});

tests.push({
  name: 'page-counter: click toggles the --expanded modifier class',
  fn: () => {
    delete require.cache[API_PATH];
    const api = (require(API_PATH)).NOAIS_PAGE_COUNTER || require(API_PATH);
    const document = makeFakeDocument();
    const handle = api.create({
      document,
      storage: makeStorageMock(),
      getCount: () => 3,
      getItems: () => [{ text: 'snippet one', score: 76 }],
    });
    handle.mount(document.documentElement);
    assert.strictEqual(handle.isExpanded(), false);
    const widget = handle._widget;
    const card = widget._shadow.querySelector('.noais-page-counter');
    assert.ok(card, 'shadow root has .noais-page-counter');
    card.dispatchEvent({ type: 'click' });
    assert.strictEqual(handle.isExpanded(), true);
    card.dispatchEvent({ type: 'click' });
    assert.strictEqual(handle.isExpanded(), false);
    handle.unmount();
  },
});

tests.push({
  name: 'page-counter: setPosition() updates widget position and persists to storage',
  fn: () => {
    delete require.cache[API_PATH];
    const api = (require(API_PATH)).NOAIS_PAGE_COUNTER || require(API_PATH);
    const document = makeFakeDocument();
    const storage = makeStorageMock();
    const handle = api.create({
      document,
      storage,
      getCount: () => 0,
      getItems: () => [],
    });
    handle.mount(document.documentElement);
    handle.setPosition({ x: 250, y: 175 });
    const pos = handle.getPosition();
    assert.ok(pos, 'getPosition() returns a value');
    assert.strictEqual(pos.x, 250);
    assert.strictEqual(pos.y, 175);
    // Storage is async (setImmediate), but we can check the mock data synchronously
    // because set() calls Object.assign synchronously before the callback.
    assert.ok(storage.data.noais_page_counter_position, 'position written to storage');
    assert.strictEqual(storage.data.noais_page_counter_position.x, 250);
    assert.strictEqual(storage.data.noais_page_counter_position.y, 175);
    handle.unmount();
  },
});

tests.push({
  name: 'page-counter: contextmenu exposes 4-corner move options (keyboard a11y fallback)',
  fn: () => {
    delete require.cache[API_PATH];
    const api = (require(API_PATH)).NOAIS_PAGE_COUNTER || require(API_PATH);
    const document = makeFakeDocument();
    const handle = api.create({
      document,
      storage: makeStorageMock(),
      getCount: () => 0,
      getItems: () => [],
      viewport: { width: 1000, height: 800 },
    });
    handle.mount(document.documentElement);
    const corners = handle._corners;
    assert.ok(corners, 'handle exposes _corners');
    assert.strictEqual(corners.length, 4);
    assert.ok(corners.includes('bottom-right'));
    assert.ok(corners.includes('top-left'));
    assert.ok(corners.includes('top-right'));
    assert.ok(corners.includes('bottom-left'));
    // setCorner('top-left') on a 1000x800 viewport should set position near (0, 0)
    handle.setCorner('top-left');
    const p = handle.getPosition();
    assert.ok(p, 'position set after setCorner(top-left)');
    assert.ok(p.x < 50 && p.y < 50, 'top-left position is near (0, 0)');
    handle.unmount();
  },
});

module.exports = tests;
