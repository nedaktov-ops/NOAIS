// NOAIS — tests for content/badge-tooltip.js
// 100% synchronous (matches tests/run.js pattern).

'use strict';

const assert = require('node:assert');
const path = require('node:path');

const API_PATH = path.join(__dirname, '..', 'extension', 'content', 'badge-tooltip.js');

// ---------- DOM stub ----------

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
    getBoundingClientRect() { return this._rect || { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
    setRect(r) { this._rect = r; },
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

function makeBadge(breakdown, text) {
  const badge = el('span');
  badge.className = 'noais-badge noais-badge-high';
  badge.dataset.noaisBadge = '1';
  badge.dataset.noaisBreakdown = JSON.stringify(breakdown);
  if (text) badge._textContent = String(text);
  badge.setRect({ left: 100, top: 200, right: 160, bottom: 220, width: 60, height: 20 });
  return badge;
}

function makeAllowlistStub() {
  const calls = [];
  return {
    calls,
    add(host, text) { calls.push({ method: 'add', host, text }); },
    isAllowed(host, hash) { calls.push({ method: 'isAllowed', host, hash }); return false; },
  };
}

function makeSendMessageStub() {
  const calls = [];
  function sendMessage(msg) { calls.push(msg); }
  sendMessage.calls = calls;
  return sendMessage;
}

// ---------- Tests ----------

const tests = [];

tests.push({
  name: 'badge-tooltip: factory exposes attach/detach/show/hide/destroy',
  fn: () => {
    delete require.cache[API_PATH];
    const mod = require(API_PATH);
    const factory = mod.create || (mod.NOAIS_BADGE_TOOLTIP && mod.NOAIS_BADGE_TOOLTIP.create);
    assert.ok(factory, 'badge-tooltip.js must export a create() factory');
    const tip = factory({
      document: makeFakeDocument(),
      allowlist: makeAllowlistStub(),
      sendMessage: makeSendMessageStub(),
      getTabId: () => 7,
    });
    assert.strictEqual(typeof tip.attach, 'function');
    assert.strictEqual(typeof tip.detach, 'function');
    assert.strictEqual(typeof tip.show, 'function');
    assert.strictEqual(typeof tip.hide, 'function');
    assert.strictEqual(typeof tip.destroy, 'function');
  },
});

tests.push({
  name: 'badge-tooltip: show() renders the popup with score + breakdown metrics',
  fn: () => {
    delete require.cache[API_PATH];
    const mod = require(API_PATH);
    const factory = mod.create || (mod.NOAIS_BADGE_TOOLTIP && mod.NOAIS_BADGE_TOOLTIP.create);
    const tip = factory({
      document: makeFakeDocument(),
      allowlist: makeAllowlistStub(),
      sendMessage: makeSendMessageStub(),
      getTabId: () => 1,
    });
    const badge = makeBadge({ score: 76, burstiness: 0.21, typeTokenRatio: 0.45, entropy: 6.8, hapaxRatio: 0.32, wordCount: 80, count: 0 });
  tip.show(badge, JSON.parse(badge.dataset.noaisBreakdown));
  const popup = tip._popup;
  assert.ok(popup, 'popup element exists after show');
  const text = popup.shadow.textContent;
  assert.ok(text.includes('76'), 'popup contains score "76"');
  assert.ok(text.includes('Burstiness'), 'popup contains metric label');
  assert.ok(text.includes('0.21'), 'popup contains metric value');
  assert.ok(text.includes('Why am I seeing this?'), 'popup contains Why button');
  assert.ok(text.includes("Don't show this"), 'popup contains allowlist button');
  tip.destroy();
  },
});

tests.push({
  name: 'badge-tooltip: position is clamped to viewport',
  fn: () => {
    delete require.cache[API_PATH];
    const mod = require(API_PATH);
    const factory = mod.create || (mod.NOAIS_BADGE_TOOLTIP && mod.NOAIS_BADGE_TOOLTIP.create);
    const tip = factory({
      document: makeFakeDocument(),
      allowlist: makeAllowlistStub(),
      sendMessage: makeSendMessageStub(),
      getTabId: () => 1,
      viewport: { width: 800, height: 600 },
    });
    // Case A: badge near left edge
    const badgeA = makeBadge({ score: 50, burstiness: 0.5, typeTokenRatio: 0.5, entropy: 5, hapaxRatio: 0.4, wordCount: 40, count: 0 });
    badgeA.setRect({ left: 0, top: 200, right: 60, bottom: 220, width: 60, height: 20 });
    tip.show(badgeA, JSON.parse(badgeA.dataset.noaisBreakdown));
    const posA = tip._position;
    assert.ok(posA, 'tooltip has a computed _position');
    assert.strictEqual(posA.x, 0, 'left-edge badge clamps tooltip to x=0');
    // Case B: badge near right edge
    const badgeB = makeBadge({ score: 50, burstiness: 0.5, typeTokenRatio: 0.5, entropy: 5, hapaxRatio: 0.4, wordCount: 40, count: 0 });
    badgeB.setRect({ left: 750, top: 200, right: 800, bottom: 220, width: 50, height: 20 });
    tip.show(badgeB, JSON.parse(badgeB.dataset.noaisBreakdown));
    const posB = tip._position;
    assert.strictEqual(posB.x, 580, 'right-edge badge clamps tooltip to vw - tooltipWidth (800-220=580)');
    tip.destroy();
  },
});

tests.push({
  name: 'badge-tooltip: "Don\'t show this" button calls allowlist.add() and marks element',
  fn: () => {
    delete require.cache[API_PATH];
    const mod = require(API_PATH);
    const factory = mod.create || (mod.NOAIS_BADGE_TOOLTIP && mod.NOAIS_BADGE_TOOLTIP.create);
    const allowlist = makeAllowlistStub();
    const tip = factory({
      document: makeFakeDocument(),
      allowlist,
      sendMessage: makeSendMessageStub(),
      getTabId: () => 1,
    });
    const badge = makeBadge({ score: 90, burstiness: 0.1, typeTokenRatio: 0.7, entropy: 7.5, hapaxRatio: 0.2, wordCount: 120, count: 0 }, 'Some text for the allowlist hash.');
  tip.show(badge, JSON.parse(badge.dataset.noaisBreakdown));
  const popup = tip._popup;
  assert.ok(popup, 'popup exists after show');
  const buttons = popup.shadow.querySelectorAll('[data-noais-action="allowlist"]');
  assert.ok(buttons.length >= 1, 'popup has a [data-noais-action="allowlist"] button');
    buttons[0].dispatchEvent({ type: 'click' });
    assert.strictEqual(allowlist.calls.length, 1, 'allowlist.add called once');
    assert.strictEqual(allowlist.calls[0].method, 'add');
    assert.strictEqual(allowlist.calls[0].host, 'localhost', 'host falls back to location.hostname || "localhost"');
    assert.ok(typeof allowlist.calls[0].text === 'string' && allowlist.calls[0].text.length > 0, 'text was forwarded');
    assert.strictEqual(badge.dataset.noaisAllowlisted, '1', 'element marked with data-noais-allowlisted=1');
    tip.destroy();
  },
});

tests.push({
  name: 'badge-tooltip: "Why am I seeing this?" button sends chrome.runtime.sendMessage',
  fn: () => {
    delete require.cache[API_PATH];
    const mod = require(API_PATH);
    const factory = mod.create || (mod.NOAIS_BADGE_TOOLTIP && mod.NOAIS_BADGE_TOOLTIP.create);
    const sendMessage = makeSendMessageStub();
    const tip = factory({
      document: makeFakeDocument(),
      allowlist: makeAllowlistStub(),
      sendMessage,
      getTabId: () => 42,
    });
    const badge = makeBadge({ score: 76, burstiness: 0.21, typeTokenRatio: 0.45, entropy: 6.8, hapaxRatio: 0.32, wordCount: 80, count: 0 });
  tip.show(badge, JSON.parse(badge.dataset.noaisBreakdown));
  const popup = tip._popup;
  const whyButton = popup.shadow.querySelectorAll('[data-noais-action="why"]');
    assert.ok(whyButton.length >= 1, 'popup has a [data-noais-action="why"] button');
    whyButton[0].dispatchEvent({ type: 'click' });
    assert.strictEqual(sendMessage.calls.length, 1, 'sendMessage called once');
    assert.strictEqual(sendMessage.calls[0].type, 'OPEN_WHY_PANEL');
    assert.strictEqual(sendMessage.calls[0].tabId, 42);
    assert.ok(sendMessage.calls[0].breakdown, 'breakdown is forwarded');
    assert.strictEqual(sendMessage.calls[0].breakdown.score, 76);
    tip.destroy();
  },
});

tests.push({
  name: 'badge-tooltip: hide() hides the popup; destroy() removes it from the DOM',
  fn: () => {
    delete require.cache[API_PATH];
    const mod = require(API_PATH);
    const factory = mod.create || (mod.NOAIS_BADGE_TOOLTIP && mod.NOAIS_BADGE_TOOLTIP.create);
    const document = makeFakeDocument();
    const tip = factory({
      document,
      allowlist: makeAllowlistStub(),
      sendMessage: makeSendMessageStub(),
      getTabId: () => 1,
    });
    const badge = makeBadge({ score: 50, burstiness: 0.5, typeTokenRatio: 0.5, entropy: 5, hapaxRatio: 0.4, wordCount: 40, count: 0 });
    tip.show(badge, JSON.parse(badge.dataset.noaisBreakdown));
    const popup = tip._popup;
    assert.ok(popup, 'popup exists');
    tip.hide();
    assert.strictEqual(popup.host.style.display, 'none', 'popup hidden after hide()');
    tip.destroy();
    // After destroy, the host should be removed from document.body
    const remaining = document.body.querySelectorAll('[data-noais-badge-tooltip]');
    assert.strictEqual(remaining.length, 0, 'popup removed from DOM after destroy()');
  },
});

module.exports = tests;
