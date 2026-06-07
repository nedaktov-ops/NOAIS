// Tests for core/adapters/instagram.js
// Pattern mirrors tests/adapters-facebook.test.js (uses the same DOM stub style).

'use strict';

const assert = require('node:assert');

const { BaseAdapter, helpers } = require('../extension/core/adapters/base.js');
globalThis.NOAIS_ADAPTERS = { BaseAdapter, helpers };
const { InstagramAdapter } = require('../extension/core/adapters/instagram.js');

const tests = [];

// ---- Minimal DOM stub (mirrors the Facebook adapters test) ----
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
  name: 'adapters/instagram: has the expected adapter id',
  fn: () => {
    assert.strictEqual(InstagramAdapter.id, 'instagram');
  }
});

tests.push({
  name: 'adapters/instagram: match("instagram.com") -> true',
  fn: () => {
    assert.strictEqual(InstagramAdapter.match('instagram.com'), true);
  }
});

tests.push({
  name: 'adapters/instagram: match("www.instagram.com") -> true',
  fn: () => {
    assert.strictEqual(InstagramAdapter.match('www.instagram.com'), true);
  }
});

tests.push({
  name: 'adapters/instagram: match("m.instagram.com") -> true',
  fn: () => {
    assert.strictEqual(InstagramAdapter.match('m.instagram.com'), true);
  }
});

tests.push({
  name: 'adapters/instagram: match("sub.instagram.com") -> true (subdomain)',
  fn: () => {
    assert.strictEqual(InstagramAdapter.match('sub.instagram.com'), true);
  }
});

tests.push({
  name: 'adapters/instagram: match("notinstagram.com") -> false (suffix attack)',
  fn: () => {
    assert.strictEqual(InstagramAdapter.match('notinstagram.com'), false);
  }
});

tests.push({
  name: 'adapters/instagram: match("facebook.com") -> false',
  fn: () => {
    assert.strictEqual(InstagramAdapter.match('facebook.com'), false);
  }
});

tests.push({
  name: 'adapters/instagram: findElements returns all <article> nodes including nested',
  fn: () => {
    const root = el('div');
    const outer = el('article', { id: 'outer' });
    const inner = el('article', { id: 'inner' });
    const other = el('div');
    root.appendChild(other);
    outer.appendChild(inner);
    root.appendChild(outer);
    const found = InstagramAdapter.findElements(root);
    assert.strictEqual(found.length, 2, 'expected 2 articles (outer + nested inner)');
    assert.ok(found.includes(outer), 'includes outer article');
    assert.ok(found.includes(inner), 'includes nested inner article');
  }
});

tests.push({
  name: 'adapters/instagram: extractText returns first [dir="auto"] descendant >= 30 chars',
  fn: () => {
    const a = el('article');
    // Short child (button label)
    const btn = el('div', { dir: 'auto' });
    btn._textContent = 'Like';
    a.appendChild(btn);
    // Long child (post body)
    const body = el('div', { dir: 'auto' });
    body._textContent = 'This is the actual post body. It is important to note that the model ' +
                        'demonstrates significant improvements. Furthermore, the architecture is novel.';
    a.appendChild(body);
    assert.strictEqual(InstagramAdapter.extractText(a), body._textContent);
  }
});

tests.push({
  name: 'adapters/instagram: extractText returns null when no qualifying [dir="auto"] descendant',
  fn: () => {
    const a = el('article');
    // Only short [dir="auto"] children — none qualify
    const btn1 = el('div', { dir: 'auto' });
    btn1._textContent = 'Like';
    const btn2 = el('div', { dir: 'auto' });
    btn2._textContent = 'Reply';
    a.appendChild(btn1);
    a.appendChild(btn2);
    assert.strictEqual(InstagramAdapter.extractText(a), null);
  }
});

tests.push({
  name: 'adapters/instagram: decorate adds badge + severity class, idempotent, no innerHTML',
  fn: () => {
    global.document = { createElement(tag) { return el(tag); } };
    try {
      const a = el('article');
      const body = el('div', { dir: 'auto' });
      body._textContent = 'long enough text for the badge to be appended here ' +
                          'with enough words to pass the shouldScore threshold';
      a.appendChild(body);
      // Trap any innerHTML assignment on the host nodes
      let innerHTMLUsed = false;
      Object.defineProperty(a, 'innerHTML', {
        configurable: true,
        set() { innerHTMLUsed = true; },
        get() { return ''; }
      });
      Object.defineProperty(body, 'innerHTML', {
        configurable: true,
        set() { innerHTMLUsed = true; },
        get() { return ''; }
      });

      InstagramAdapter.decorate(a, 75, 1);
      assert.strictEqual(a.dataset.noaisScored, '1', 'marks element as scored');
      assert.ok(a.classList.contains('noais-score-high'), 'adds high severity class');

      // Find appended badge
      const badges = [];
      findAll(a, 'span', badges);
      const badge = badges.find((n) => n.classList && n.classList.contains('noais-badge'));
      assert.ok(badge, 'badge was appended');
      assert.strictEqual(badge.dataset.noaisAdapter, 'instagram');

      // Idempotent: second call with new score, no second badge, severity updated
      InstagramAdapter.decorate(a, 25, 0);
      const spans = [];
      findAll(a, 'span', spans);
      const noaisBadges = spans.filter((n) => n.classList && n.classList.contains('noais-badge'));
      assert.strictEqual(noaisBadges.length, 1, 'only one badge after two calls');
      assert.ok(a.classList.contains('noais-score-zero'), 'severity updated to zero on re-call');

      assert.strictEqual(innerHTMLUsed, false, 'no innerHTML assignment occurred');
    } finally {
      delete global.document;
    }
  }
});

module.exports = tests;
