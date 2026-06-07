// Tests for core/adapters/facebook.js
// Pattern mirrors tests/adapters.test.js (uses the same DOM stub style).

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { BaseAdapter, helpers } = require('../extension/core/adapters/base.js');
globalThis.NOAIS_ADAPTERS = { BaseAdapter, helpers };
const { FacebookAdapter, FACEBOOK_HOSTS } = require('../extension/core/adapters/facebook.js');

const tests = [];

// ---- Minimal DOM stub (mirrors the v0.5 adapters test) ----
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
    querySelector(sel) { const out=[]; findAll(this, sel, out); return out[0] || null; },
    querySelectorAll(sel) { const out=[]; findAll(this, sel, out); return out; },
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return this.attributes[k]; }
  };
  if (attrs) {
    if (attrs.id) node.attributes.id = attrs.id;
    if (attrs.role) node.attributes.role = attrs.role;
    if (attrs.dir) node.attributes.dir = attrs.dir;
    if (attrs['aria-label']) node.attributes['aria-label'] = attrs['aria-label'];
    if (attrs.text != null) node._textContent = attrs.text;
  }
  return node;
}
function findAll(root, sel, out) {
  if (sel.startsWith('#')) {
    if (root.attributes && root.attributes.id === sel.slice(1)) out.push(root);
  } else if (sel.startsWith('[role=')) {
    const m = sel.match(/^\[role="([^"]+)"\]$/);
    if (m && root.attributes && root.attributes.role === m[1]) out.push(root);
  } else if (sel.startsWith('[aria-label*=')) {
    const m = sel.match(/^\[aria-label\*="([^"]+)"\]$/);
    if (m && root.attributes && root.attributes['aria-label'] &&
        root.attributes['aria-label'].indexOf(m[1]) >= 0) out.push(root);
  } else if (sel.startsWith('[dir=')) {
    const m = sel.match(/^\[dir="([^"]+)"\]$/);
    if (m && root.attributes && root.attributes.dir === m[1]) out.push(root);
  } else if (root.tagName === sel.toUpperCase()) {
    out.push(root);
  }
  for (const c of root.children) findAll(c, sel, out);
}

// ---- Tests ----

tests.push({
  name: 'adapters/facebook: hostname matching',
  fn: () => {
    assert.strictEqual(FacebookAdapter.match('facebook.com'), true);
    assert.strictEqual(FacebookAdapter.match('www.facebook.com'), true);
    assert.strictEqual(FacebookAdapter.match('m.facebook.com'), true);
    assert.strictEqual(FacebookAdapter.match('fb.com'), true);
    assert.strictEqual(FacebookAdapter.match('fb.me'), true);
    assert.strictEqual(FacebookAdapter.match('FACEBOOK.COM'), true, 'case-insensitive');
    assert.strictEqual(FacebookAdapter.match('facebook.com.evil.tld'), false, 'suffix-only');
    assert.strictEqual(FacebookAdapter.match('youtube.com'), false);
    assert.strictEqual(FacebookAdapter.match(''), false);
    assert.strictEqual(FacebookAdapter.match(null), false);
  }
});

tests.push({
  name: 'adapters/facebook: declares shortTextMode: true',
  fn: () => {
    assert.strictEqual(FacebookAdapter.shortTextMode, true);
  }
});

tests.push({
  name: 'adapters/facebook: has the expected adapter id',
  fn: () => {
    assert.strictEqual(FacebookAdapter.id, 'facebook');
  }
});

tests.push({
  name: 'adapters/facebook: findElements returns [role="article"] nodes',
  fn: () => {
    const root = el('div');
    const a1 = el('div', { role: 'article' });
    const a2 = el('div', { role: 'article' });
    const other = el('div');
    root.appendChild(a1);
    root.appendChild(other);
    root.appendChild(a2);
    const found = FacebookAdapter.findElements(root);
    assert.strictEqual(found.length, 2);
    assert.ok(found.includes(a1));
    assert.ok(found.includes(a2));
  }
});

tests.push({
  name: 'adapters/facebook: findElements handles null gracefully',
  fn: () => {
    assert.deepStrictEqual(FacebookAdapter.findElements(null), []);
    assert.deepStrictEqual(FacebookAdapter.findElements({}), []);
  }
});

tests.push({
  name: 'adapters/facebook: extractText picks first long-enough [dir="auto"] child',
  fn: () => {
    const a = el('div', { role: 'article' });
    // Short child (button label)
    const btn = el('div', { dir: 'auto' });
    btn._textContent = 'Like';
    a.appendChild(btn);
    // Long child (post body)
    const body = el('div', { dir: 'auto' });
    body._textContent = 'This is the actual post body. It is important to note that the model ' +
                        'demonstrates significant improvements. Furthermore, the architecture is novel.';
    a.appendChild(body);
    assert.strictEqual(FacebookAdapter.extractText(a), body._textContent);
  }
});

tests.push({
  name: 'adapters/facebook: extractText falls back to textContent when no [dir="auto"] found',
  fn: () => {
    const a = el('div', { role: 'article' });
    a._textContent = 'fallback text from the article element itself that is long enough to pass';
    assert.strictEqual(FacebookAdapter.extractText(a), a._textContent);
  }
});

tests.push({
  name: 'adapters/facebook: extractText handles null gracefully',
  fn: () => {
    assert.strictEqual(FacebookAdapter.extractText(null), '');
    assert.strictEqual(FacebookAdapter.extractText(undefined), '');
  }
});

tests.push({
  name: 'adapters/facebook: decorate adds severity class + appends badge (no innerHTML)',
  fn: () => {
    global.document = { createElement(tag) { return el(tag); } };
    try {
      const a = el('div', { role: 'article' });
      const body = el('div', { dir: 'auto' });
      body._textContent = 'long enough text for the badge to be appended here ' +
                          'with enough words to pass the shouldScore threshold';
      a.appendChild(body);
      FacebookAdapter.decorate(a, 75, 1);
      assert.strictEqual(a.dataset.noaisScored, '1', 'marks element as scored');
      assert.ok(a.classList.contains('noais-score-high'), 'adds high severity class');
      // Find appended badge
      const badges = [];
      findAll(a, 'span', badges);
      const badge = badges.find((n) => n.classList && n.classList.contains('noais-badge'));
      assert.ok(badge, 'badge was appended');
      assert.strictEqual(badge.dataset.noaisAdapter, 'facebook');
    } finally {
      delete global.document;
    }
  }
});

tests.push({
  name: 'adapters/facebook: decorate is idempotent (no second badge on second call)',
  fn: () => {
    global.document = { createElement(tag) { return el(tag); } };
    try {
      const a = el('div', { role: 'article' });
      const body = el('div', { dir: 'auto' });
      body._textContent = 'long enough text for the badge to be appended here ' +
                          'with enough words to pass the shouldScore threshold';
      a.appendChild(body);
      FacebookAdapter.decorate(a, 75, 0);
      FacebookAdapter.decorate(a, 25, 0); // re-call with new score
      const spans = [];
      findAll(a, 'span', spans);
      const noaisBadges = spans.filter((n) => n.classList && n.classList.contains('noais-badge'));
      assert.strictEqual(noaisBadges.length, 1, 'only one badge after two calls');
      assert.ok(a.classList.contains('noais-score-zero'), 'severity updated to zero');
    } finally {
      delete global.document;
    }
  }
});

tests.push({
  name: 'adapters/facebook: does not use innerHTML anywhere (static check)',
  fn: () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'extension/core/adapters/facebook.js'),
      'utf8'
    );
    assert.ok(!/\.innerHTML\s*=/.test(src), 'facebook.js must not assign to innerHTML');
  }
});

module.exports = tests;
