// Tests for core/adapters/tiktok.js
// Pattern mirrors tests/adapters-facebook.test.js (no jsdom, minimal DOM stub).

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { BaseAdapter, helpers } = require('../extension/core/adapters/base.js');
globalThis.NOAIS_ADAPTERS = { BaseAdapter, helpers };
const { TikTokAdapter, TIKTOK_HOSTS } = require('../extension/core/adapters/tiktok.js');

const tests = [];

// ---- Minimal DOM stub (mirrors the v0.6 facebook test) ----
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
    classList: classList,
    get className() { return this.classList.toString(); },
    set className(v) { this.classList._set = new Set(String(v).split(/\s+/).filter(Boolean)); },
    dataset: {},
    attributes: {},
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
    },
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    querySelector(sel) { const out = []; findAll(this, sel, out); return out[0] || null; },
    querySelectorAll(sel) { const out = []; findAll(this, sel, out); return out; },
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return this.attributes[k]; }
  };
  if (attrs) {
    if (attrs.id) node.attributes.id = attrs.id;
    if (attrs.role) node.attributes.role = attrs.role;
    if (attrs.dir) node.attributes.dir = attrs.dir;
    if (attrs['aria-label']) node.attributes['aria-label'] = attrs['aria-label'];
    if (attrs['data-e2e']) node.attributes['data-e2e'] = attrs['data-e2e'];
    if (attrs.text != null) node._textContent = attrs.text;
  }
  return node;
}

function findAll(root, sel, out) {
  // Support comma-separated selectors by union-matching any part.
  const parts = sel.split(',').map((s) => s.trim());
  for (const part of parts) {
    if (part.startsWith('#')) {
      if (root.attributes && root.attributes.id === part.slice(1)) { out.push(root); break; }
    } else if (part.startsWith('[role=')) {
      const m = part.match(/^\[role="([^"]+)"\]$/);
      if (m && root.attributes && root.attributes.role === m[1]) { out.push(root); break; }
    } else if (part.startsWith('[aria-label*=')) {
      const m = part.match(/^\[aria-label\*="([^"]+)"\]$/);
      if (m && root.attributes && root.attributes['aria-label'] &&
          root.attributes['aria-label'].indexOf(m[1]) >= 0) { out.push(root); break; }
    } else if (part.startsWith('[dir=')) {
      const m = part.match(/^\[dir="([^"]+)"\]$/);
      if (m && root.attributes && root.attributes.dir === m[1]) { out.push(root); break; }
    } else if (part.startsWith('[data-e2e=')) {
      const m = part.match(/^\[data-e2e="([^"]+)"\]$/);
      if (m && root.attributes && root.attributes['data-e2e'] === m[1]) { out.push(root); break; }
    } else if (root.tagName === part.toUpperCase()) {
      out.push(root); break;
    }
  }
  for (const c of root.children) findAll(c, sel, out);
}

// ---- Tests ----

tests.push({
  name: 'adapters/tiktok: has the expected adapter id',
  fn: () => {
    assert.strictEqual(TikTokAdapter.id, 'tiktok');
  }
});

tests.push({
  name: 'adapters/tiktok: match accepts tiktok.com',
  fn: () => {
    assert.strictEqual(TikTokAdapter.match('tiktok.com'), true);
  }
});

tests.push({
  name: 'adapters/tiktok: match accepts www.tiktok.com',
  fn: () => {
    assert.strictEqual(TikTokAdapter.match('www.tiktok.com'), true);
  }
});

tests.push({
  name: 'adapters/tiktok: match accepts m.tiktok.com',
  fn: () => {
    assert.strictEqual(TikTokAdapter.match('m.tiktok.com'), true);
  }
});

tests.push({
  name: 'adapters/tiktok: match accepts sub.tiktok.com',
  fn: () => {
    assert.strictEqual(TikTokAdapter.match('sub.tiktok.com'), true);
  }
});

tests.push({
  name: 'adapters/tiktok: match rejects tiktokclone.com (suffix-only)',
  fn: () => {
    assert.strictEqual(TikTokAdapter.match('tiktokclone.com'), false);
  }
});

tests.push({
  name: 'adapters/tiktok: match rejects facebook.com',
  fn: () => {
    assert.strictEqual(TikTokAdapter.match('facebook.com'), false);
  }
});

tests.push({
  name: 'adapters/tiktok: findElements returns all [data-e2e="comment-item"] nodes',
  fn: () => {
    const root = el('div');
    const c1 = el('div', { 'data-e2e': 'comment-item' });
    const c2 = el('div', { 'data-e2e': 'comment-item' });
    const c3 = el('div', { 'data-e2e': 'comment-item' });
    const other = el('div');
    root.appendChild(c1);
    root.appendChild(other);
    root.appendChild(c2);
    root.appendChild(c3);
    const found = TikTokAdapter.findElements(root);
    assert.strictEqual(found.length, 3);
    assert.ok(found.includes(c1));
    assert.ok(found.includes(c2));
    assert.ok(found.includes(c3));
  }
});

tests.push({
  name: 'adapters/tiktok: extractText returns text from [data-e2e="comment-text"] when present',
  fn: () => {
    const item = el('div', { 'data-e2e': 'comment-item' });
    const body = el('p', { 'data-e2e': 'comment-text' });
    body._textContent = 'This app is so cool, the algorithm is on point';
    item.appendChild(body);
    assert.strictEqual(TikTokAdapter.extractText(item), body._textContent);
  }
});

tests.push({
  name: 'adapters/tiktok: extractText falls back to first <p>/<span> >= 30 chars when data-e2e absent',
  fn: () => {
    const item = el('div', { 'data-e2e': 'comment-item' });
    // No [data-e2e="comment-text"] descendant. Add a short <p> and a long <p>.
    const shortP = el('p');
    shortP._textContent = 'too short';
    item.appendChild(shortP);
    const longP = el('p');
    longP._textContent = 'This is a fallback test paragraph that is long enough to qualify';
    item.appendChild(longP);
    assert.strictEqual(TikTokAdapter.extractText(item), longP._textContent);
  }
});

tests.push({
  name: 'adapters/tiktok: decorate adds badge + severity class, idempotent, no innerHTML',
  fn: () => {
    global.document = { createElement(tag) { return el(tag); } };
    try {
      const item = el('div', { 'data-e2e': 'comment-item' });
      const body = el('p', { 'data-e2e': 'comment-text' });
      body._textContent = 'This app is so cool, the algorithm is on point today, totally agree';
      item.appendChild(body);

      // First call: should mark scored, add severity class, append badge
      TikTokAdapter.decorate(item, 75, 1);
      assert.strictEqual(item.dataset.noaisScored, '1', 'marks element as scored');
      assert.ok(item.classList.contains('noais-score-high'), 'adds high severity class');

      const allSpans = [];
      findAll(item, 'span', allSpans);
      const badges = allSpans.filter((n) => n.classList && n.classList.contains('noais-badge'));
      assert.strictEqual(badges.length, 1, 'one badge appended');
      assert.strictEqual(badges[0].dataset.noaisAdapter, 'tiktok', 'badge carries tiktok id');

      // Second call with new score: must not append another badge, must update severity
      TikTokAdapter.decorate(item, 20, 0);
      const allSpans2 = [];
      findAll(item, 'span', allSpans2);
      const badges2 = allSpans2.filter((n) => n.classList && n.classList.contains('noais-badge'));
      assert.strictEqual(badges2.length, 1, 'still only one badge after second call');
      assert.ok(item.classList.contains('noais-score-zero'), 'severity updated to zero');

      // Static check: source must not assign to innerHTML
      const src = fs.readFileSync(
        path.join(__dirname, '..', 'extension/core/adapters/tiktok.js'),
        'utf8'
      );
      assert.ok(!/\.innerHTML\s*=/.test(src), 'tiktok.js must not assign to innerHTML');
    } finally {
      delete global.document;
    }
  }
});

module.exports = tests;
