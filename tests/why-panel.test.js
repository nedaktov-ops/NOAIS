// Tests for sidepanel/why.{html,css,js} (v1.1.0)
// TDD discipline: these tests fail BEFORE the sidepanel exists.

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WHY_HTML = path.join(__dirname, '..', 'extension', 'sidepanel', 'why.html');
const WHY_CSS  = path.join(__dirname, '..', 'extension', 'sidepanel', 'why.css');
const WHY_JS   = path.join(__dirname, '..', 'extension', 'sidepanel', 'why.js');

const tests = [];

tests.push({
  name: 'why: all three files exist (html + css + js) at extension/sidepanel/',
  fn: () => {
    assert.ok(fs.existsSync(WHY_HTML), 'sidepanel/why.html missing');
    assert.ok(fs.existsSync(WHY_CSS), 'sidepanel/why.css missing');
    assert.ok(fs.existsSync(WHY_JS), 'sidepanel/why.js missing');
  },
});

tests.push({
  name: 'why: HTML is self-contained and standalone (no external assets, no relative links to popup/options)',
  fn: () => {
    const html = fs.readFileSync(WHY_HTML, 'utf8');
    assert.match(html, /href=["'][^"']*why\.css["']/, 'must link why.css');
    assert.match(html, /src=["'][^"']*why\.js["']/, 'must link why.js');
    // No relative links to other extension files that wouldn't exist in
    // a side-panel context. The privacy link is OK because it's absolute.
    assert.doesNotMatch(html, /href=["']popup\//, 'must not link into popup/');
    assert.doesNotMatch(html, /href=["']options\/options\.html/, 'must not link into options/options.html');
  },
});

tests.push({
  name: 'why: HTML renders a score (current page AI score) and a breakdown',
  fn: () => {
    const html = fs.readFileSync(WHY_HTML, 'utf8');
    // The side panel is a per-page scoreboard with breakdown by element type.
    // Look for a score region, a breakdown region, and some text that maps
    // to the why_panel_score / why_panel_breakdown i18n keys.
    const referencesScore =
      /__MSG_why_panel_score__/.test(html) ||
      /id=["']score["']/.test(html) ||
      /['"]why_panel_score['"]/.test(fs.readFileSync(WHY_JS, 'utf8'));
    const referencesBreakdown =
      /__MSG_why_panel_breakdown__/.test(html) ||
      /id=["']breakdown["']/.test(html) ||
      /['"]why_panel_breakdown['"]/.test(fs.readFileSync(WHY_JS, 'utf8'));
    assert.ok(referencesScore, 'why panel must reference why_panel_score');
    assert.ok(referencesBreakdown, 'why panel must reference why_panel_breakdown');
  },
});

tests.push({
  name: 'why.js: does not use innerHTML (XSS discipline)',
  fn: () => {
    const src = fs.readFileSync(WHY_JS, 'utf8');
    const codeOnly = src
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n')
      .replace(/(['"`])(?:(?=(\\?))\2.)*?\1/g, '""');
    const matches = codeOnly.match(/\.innerHTML\s*=/g) || [];
    assert.strictEqual(matches.length, 0, 'why.js must not use .innerHTML');
  },
});

tests.push({
  name: 'why.js: handles a NOAIS_PAGE_SCORE message from the background script',
  fn: () => {
    const src = fs.readFileSync(WHY_JS, 'utf8');
    // The background broadcasts a NOAIS_PAGE_SCORE message; why.js must
    // register a listener and update the DOM with the new score.
    const hasListener = /chrome\.runtime\.onMessage\.addListener/.test(src) ||
                        /runtime\.onMessage\.addListener/.test(src);
    assert.ok(hasListener, 'why.js must register a chrome.runtime.onMessage listener');
    // And it must inspect the message type.
    const inspectsType = /NOAIS_PAGE_SCORE/.test(src);
    assert.ok(inspectsType, 'why.js must inspect the NOAIS_PAGE_SCORE message type');
  },
});

tests.push({
  name: 'why.js: loads in a vm sandbox without throwing',
  fn: () => {
    const src = fs.readFileSync(WHY_JS, 'utf8');
    function makeEl(tag) {
      return {
        tagName: String(tag || '').toUpperCase(),
        children: [],
        classList: {
          _set: new Set(),
          add(c) { this._set.add(c); },
          remove(c) { this._set.delete(c); },
          contains(c) { return this._set.has(c); },
        },
        attributes: {},
        _textContent: '',
        get textContent() { return this._textContent; },
        set textContent(v) { this._textContent = String(v); },
        setAttribute(k, v) { this.attributes[k] = String(v); },
        getAttribute(k) { return this.attributes[k]; },
        appendChild(c) { this.children.push(c); return c; },
        removeChild(c) { this.children = this.children.filter(x => x !== c); return c; },
        addEventListener() {},
        removeEventListener() {},
        click() {},
        style: {},
        dataset: {},
      };
    }
    const sandbox = {
      document: {
        createElement: makeEl,
        getElementById: () => makeEl('div'),
        querySelector: () => makeEl('div'),
        querySelectorAll: () => [],
        addEventListener: () => {},
        body: makeEl('body'),
        documentElement: makeEl('html'),
        readyState: 'complete',
      },
      window: {},
      console,
      setTimeout, clearTimeout,
      chrome: {
        i18n: { getMessage: (k) => k },
        runtime: {
          onMessage: { addListener: () => {} },
          sendMessage: () => {},
          lastError: null,
        },
        storage: {
          local: { get: (k, cb) => { if (typeof cb === 'function') cb({}); } },
          sync: { get: (k, cb) => { if (typeof cb === 'function') cb({}); } },
        },
      },
    };
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox, { filename: 'why.js' });
  },
});

module.exports = tests;
