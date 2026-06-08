// NOAIS — tests for core/adapters/base.js and core/adapters/youtube.js
//
// Run with: node tests/run.js
//
// We use a tiny JSDOM-free DOM stub (no jsdom dep) that supports just
// the methods our adapters actually call: querySelectorAll, classList,
// dataset, appendChild, textContent, createElement, setAttribute.

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { BaseAdapter, helpers } = require('../extension/core/adapters/base.js');
// Make NOAIS_ADAPTERS visible to youtube.js's IIFE. The IIFE captures
// `globalThis` at load time (because `typeof window === 'undefined'` in
// Node), so we have to set this BEFORE require()'ing youtube.js.
// IMPORTANT: the structure must be { BaseAdapter, helpers: {...} } because
// youtube.js reads `root.NOAIS_ADAPTERS.helpers.applySeverityClass(...)`.
globalThis.NOAIS_ADAPTERS = { BaseAdapter, helpers };
const { YouTubeAdapter, YOUTUBE_HOSTS } = require('../extension/core/adapters/youtube.js');

const tests = [];

// ---------- tiny DOM stub ----------
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
    _textContent: '',
    get textContent() {
      // DOM spec: textContent is the concatenation of all descendant text.
      if (this.children.length === 0) return this._textContent;
      let out = this._textContent;
      for (const c of this.children) out += c.textContent;
      return out;
    },
    set textContent(v) {
      this._textContent = String(v);
      // Setting textContent removes all children
      this.children = [];
      this.childNodes = [];
    },
    appendChild(child) {
      this.children.push(child);
      this.childNodes.push(child);
      child.parentNode = this;
      return child;
    },
    querySelector(sel) {
      return findFirst(this, sel);
    },
    querySelectorAll(sel) {
      const out = [];
      findAll(this, sel, out);
      return out;
    },
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return this.attributes[k]; }
  };
  if (attrs) {
    if (attrs.id) node.attributes.id = attrs.id;
    if (attrs.text != null) node._textContent = String(attrs.text);
    if (attrs.className) node.className = attrs.className;
  }
  return node;
}

function findFirst(root, sel) {
  const out = [];
  findAll(root, sel, out);
  return out[0] || null;
}

function findAll(root, sel, out) {
  // Only support two selector forms used by the adapters:
  //   'tag'  (e.g. 'ytd-comment-renderer')
  //   '#id'  (e.g. '#content-text')
  if (matches(root, sel)) out.push(root);
  for (const child of root.children) {
    findAll(child, sel, out);
  }
}

function matches(node, sel) {
  if (sel.startsWith('#')) {
    return node.attributes && node.attributes.id === sel.slice(1);
  }
  return node.tagName === sel.toUpperCase();
}

// ---------- BaseAdapter helpers ----------

tests.push({
  name: 'adapters/base: severityFromScore maps ranges correctly',
  fn: () => {
    assert.strictEqual(helpers.severityFromScore(0), 'zero');
    assert.strictEqual(helpers.severityFromScore(15), 'zero');
    assert.strictEqual(helpers.severityFromScore(30), 'zero');
    assert.strictEqual(helpers.severityFromScore(31), 'low');
    assert.strictEqual(helpers.severityFromScore(45), 'low');
    assert.strictEqual(helpers.severityFromScore(60), 'low');
    assert.strictEqual(helpers.severityFromScore(61), 'high');
    assert.strictEqual(helpers.severityFromScore(99), 'high');
    assert.strictEqual(helpers.severityFromScore(100), 'high');
  }
});

tests.push({
  name: 'adapters/base: shouldScore rejects empty/short text',
  fn: () => {
    assert.strictEqual(helpers.shouldScore(''), false);
    assert.strictEqual(helpers.shouldScore('   '), false);
    assert.strictEqual(helpers.shouldScore(null), false);
    assert.strictEqual(helpers.shouldScore(undefined), false);
    assert.strictEqual(helpers.shouldScore('first!'), false, '<30 chars');
    assert.strictEqual(helpers.shouldScore('one two three four'), false, '<5 tokens');
    assert.strictEqual(helpers.shouldScore('a b c d e f g h'), false, '15 chars < 30');
    assert.strictEqual(
      helpers.shouldScore('It is important to note that the model has improved significantly.'),
      true,
      'long enough + enough tokens'
    );
    assert.strictEqual(
      helpers.shouldScore('This is a long-ish comment that should pass the threshold fine.'),
      true
    );
  }
});

tests.push({
  name: 'adapters/base: createBadge returns element with severity class + NOAIS label',
  fn: () => {
    // No real DOM here, so we shim createElement onto a fake document.
    global.document = {
      createElement(tag) { return el(tag); }
    };
    try {
      const b = helpers.createBadge('youtube', 81, 0);
      assert.ok(b.className.includes('noais-badge'), 'has noais-badge class');
      assert.ok(b.className.includes('noais-badge-high'), 'has high severity class');
      assert.strictEqual(b.dataset.noaisAdapter, 'youtube');
      assert.ok(b.textContent.includes('NOAIS'), 'shows NOAIS label');
      assert.ok(b.textContent.includes('81'), 'shows the score');
    } finally {
      delete global.document;
    }
  }
});

tests.push({
  name: 'adapters/base: createBadge shows +N phrase count when > 0',
  fn: () => {
    global.document = { createElement(tag) { return el(tag); } };
    try {
      const b = helpers.createBadge('youtube', 75, 2);
      assert.ok(b.textContent.includes('+2 phrases'), 'plural form');
      const b1 = helpers.createBadge('youtube', 75, 1);
      assert.ok(b1.textContent.includes('+1 phrase'), 'singular form');
      assert.ok(!b1.textContent.includes('phrases'), 'no plural for n=1');
    } finally {
      delete global.document;
    }
  }
});

tests.push({
  name: 'adapters/base: applySeverityClass adds correct class, removes others',
  fn: () => {
    const n = el('ytd-comment-renderer');
    helpers.applySeverityClass(n, 81);
    assert.ok(n.classList.contains('noais-score-high'));
    assert.ok(!n.classList.contains('noais-score-low'));
    assert.ok(!n.classList.contains('noais-score-zero'));
    helpers.applySeverityClass(n, 25);
    assert.ok(n.classList.contains('noais-score-zero'));
    assert.ok(!n.classList.contains('noais-score-high'));
  }
});

tests.push({
  name: 'adapters/base: BaseAdapter has expected shape',
  fn: () => {
    assert.strictEqual(typeof BaseAdapter.id, 'string');
    assert.strictEqual(typeof BaseAdapter.match, 'function');
    assert.strictEqual(typeof BaseAdapter.findElements, 'function');
    assert.strictEqual(typeof BaseAdapter.extractText, 'function');
    assert.strictEqual(typeof BaseAdapter.decorate, 'function');
  }
});

// ---------- YouTubeAdapter ----------

tests.push({
  name: 'adapters/youtube: hostname matching',
  fn: () => {
    assert.strictEqual(YouTubeAdapter.match('youtube.com'), true);
    assert.strictEqual(YouTubeAdapter.match('www.youtube.com'), true);
    assert.strictEqual(YouTubeAdapter.match('m.youtube.com'), true);
    assert.strictEqual(YouTubeAdapter.match('youtu.be'), true);
    assert.strictEqual(YouTubeAdapter.match('YOUTUBE.COM'), true, 'case-insensitive');
    assert.strictEqual(YouTubeAdapter.match('youtube.com.evil.tld'), false, 'suffix-only');
    assert.strictEqual(YouTubeAdapter.match('example.com'), false);
    assert.strictEqual(YouTubeAdapter.match(''), false);
    assert.strictEqual(YouTubeAdapter.match(null), false);
  }
});

tests.push({
  name: 'adapters/youtube: findElements returns ytd-comment-renderer nodes',
  fn: () => {
    const root = el('div');
    const c1 = el('ytd-comment-renderer');
    const c2 = el('ytd-comment-renderer');
    const other = el('div');
    root.appendChild(c1);
    root.appendChild(other);
    root.appendChild(c2);
    const found = YouTubeAdapter.findElements(root);
    assert.strictEqual(found.length, 2);
    assert.ok(found.includes(c1));
    assert.ok(found.includes(c2));
  }
});

tests.push({
  name: 'adapters/youtube: findElements handles null/empty gracefully',
  fn: () => {
    assert.deepStrictEqual(YouTubeAdapter.findElements(null), []);
    assert.deepStrictEqual(YouTubeAdapter.findElements({}), []);
  }
});

tests.push({
  name: 'adapters/youtube: extractText reads #content-text',
  fn: () => {
    const r = el('ytd-comment-renderer');
    const ct = el('div');
    ct.attributes.id = 'content-text';
    ct._textContent = 'the quick brown fox';
    r.appendChild(ct);
    assert.strictEqual(YouTubeAdapter.extractText(r), 'the quick brown fox');
  }
});

tests.push({
  name: 'adapters/youtube: extractText falls back to element textContent',
  fn: () => {
    const r = el('ytd-comment-renderer');
    r._textContent = 'fallback text only';
    assert.strictEqual(YouTubeAdapter.extractText(r), 'fallback text only');
  }
});

tests.push({
  name: 'adapters/youtube: extractText handles null',
  fn: () => {
    assert.strictEqual(YouTubeAdapter.extractText(null), '');
    assert.strictEqual(YouTubeAdapter.extractText(undefined), '');
  }
});

tests.push({
  name: 'adapters/youtube: decorate adds severity class + appends badge (no innerHTML)',
  fn: () => {
    // The IIFE captured `globalThis` (no `window` in Node), and we set
    // globalThis.NOAIS_ADAPTERS at the top of this file.
    global.document = {
      createElement(tag) { return el(tag); }
    };
    try {
      const r = el('ytd-comment-renderer');
      const ct = el('div');
      ct.attributes.id = 'content-text';
      ct._textContent = 'long enough text for the badge to be appended here';
      r.appendChild(ct);
      YouTubeAdapter.decorate(r, 75, 0);
      assert.strictEqual(r.dataset.noaisScored, '1', 'marks element as scored');
      assert.ok(r.classList.contains('noais-score-high'), 'adds high severity class');
      // Find appended badge
      const badges = [];
      findAll(r, 'span', badges);
      const badge = badges.find((n) => n.className && n.className.includes('noais-badge'));
      assert.ok(badge, 'badge was appended');
      assert.strictEqual(badge.dataset.noaisAdapter, 'youtube');
    } finally {
      delete global.document;
    }
  }
});

tests.push({
  name: 'adapters/youtube: decorate is idempotent (no second badge on second call)',
  fn: () => {
    global.document = { createElement(tag) { return el(tag); } };
    try {
      const r = el('ytd-comment-renderer');
      const ct = el('div');
      ct.attributes.id = 'content-text';
      ct._textContent = 'long enough text for the badge to be appended here';
      r.appendChild(ct);
      YouTubeAdapter.decorate(r, 75, 0);
      YouTubeAdapter.decorate(r, 25, 0); // re-call with new score
      const spans = [];
      findAll(r, 'span', spans);
      // Count exact "noais-badge" class matches (not noais-badge-label etc.)
      const noaisBadges = spans.filter((n) =>
        n.classList && n.classList.contains('noais-badge')
      );
      assert.strictEqual(noaisBadges.length, 1, 'only one badge after two calls');
      // Severity class reflects the latest score
      assert.ok(r.classList.contains('noais-score-zero'), 'severity updated to zero');
    } finally {
      delete global.document;
    }
  }
});

tests.push({
  name: 'adapters/youtube: does not use innerHTML anywhere (static check)',
  fn: () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'extension/core/adapters/youtube.js'),
      'utf8'
    );
    assert.ok(
      !/\.innerHTML\s*=/.test(src),
      'youtube.js must not assign to innerHTML'
    );
  }
});

// ---------- v1.1 — createBadge accepts a breakdown payload (adapters) ----------

tests.push({
  name: 'adapters/base: createBadge serialises the breakdown payload to data-noais-breakdown (v1.1)',
  fn: () => {
    global.document = { createElement(tag) { return el(tag); } };
    try {
      const breakdown = {
        score: 76,
        burstiness: 0.21,
        typeTokenRatio: 0.45,
        entropy: 6.8,
        hapaxRatio: 0.32,
        wordCount: 80,
        count: 0,
      };
      const b = helpers.createBadge('youtube', 76, 0, breakdown);
      assert.strictEqual(b.dataset.noaisBreakdown, JSON.stringify(breakdown),
        'breakdown is JSON-serialised into the data-noais-breakdown attribute');
      // Round-trip parse to confirm it's valid JSON with all the expected keys.
      const parsed = JSON.parse(b.dataset.noaisBreakdown);
      assert.strictEqual(parsed.score, 76);
      assert.strictEqual(parsed.burstiness, 0.21);
      assert.strictEqual(parsed.typeTokenRatio, 0.45);
      assert.strictEqual(parsed.entropy, 6.8);
      assert.strictEqual(parsed.hapaxRatio, 0.32);
    } finally {
      delete global.document;
    }
  }
});

tests.push({
  name: 'adapters/base: createBadge omits data-noais-breakdown when no breakdown is passed',
  fn: () => {
    global.document = { createElement(tag) { return el(tag); } };
    try {
      const b = helpers.createBadge('youtube', 50, 0);
      // No breakdown was passed — the attribute should either be absent or
      // empty/undefined. We just check it is not a valid JSON object.
      const raw = b.dataset.noaisBreakdown;
      assert.ok(raw == null || raw === '' || raw === undefined,
        'no breakdown payload → no data-noais-breakdown value (raw=' + raw + ')');
    } finally {
      delete global.document;
    }
  }
});

tests.push({
  name: 'adapters/youtube: decorate passes the breakdown to createBadge (v1.1)',
  fn: () => {
    global.document = { createElement(tag) { return el(tag); } };
    try {
      const r = el('ytd-comment-renderer');
      const ct = el('div');
      ct.attributes.id = 'content-text';
      ct._textContent = 'long enough text for the badge to be appended here';
      r.appendChild(ct);
      const breakdown = {
        score: 81, burstiness: 0.15, typeTokenRatio: 0.6, entropy: 7.0,
        hapaxRatio: 0.25, wordCount: 100, count: 1
      };
      YouTubeAdapter.decorate(r, 81, 1, breakdown);
      // Find appended badge
      const spans = [];
      findAll(r, 'span', spans);
      const badge = spans.find((n) => n.className && n.className.includes('noais-badge'));
      assert.ok(badge, 'badge was appended');
      assert.strictEqual(badge.dataset.noaisBreakdown, JSON.stringify(breakdown),
        'breakdown forwarded from decorate() to createBadge()');
    } finally {
      delete global.document;
    }
  }
});

if (require.main === module) {
  // Allow direct invocation: node tests/adapters.test.js
  let pass = 0, fail = 0;
  for (const t of tests) {
    try { t.fn(); pass++; console.log(`  \u2713 ${t.name}`); }
    catch (e) { fail++; console.log(`  \u2717 ${t.name}: ${e.message}`); }
  }
  console.log(`  ${pass} pass, ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
}

module.exports = tests;
