// Tests for options/welcome.{html,css,js} (v1.1.0)
// TDD discipline: these tests fail BEFORE the welcome page exists.

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WELCOME_HTML = path.join(__dirname, '..', 'extension', 'options', 'welcome.html');
const WELCOME_CSS  = path.join(__dirname, '..', 'extension', 'options', 'welcome.css');
const WELCOME_JS   = path.join(__dirname, '..', 'extension', 'options', 'welcome.js');

const tests = [];

tests.push({
  name: 'welcome: all three files exist (html + css + js)',
  fn: () => {
    assert.ok(fs.existsSync(WELCOME_HTML), 'options/welcome.html missing');
    assert.ok(fs.existsSync(WELCOME_CSS), 'options/welcome.css missing');
    assert.ok(fs.existsSync(WELCOME_JS), 'options/welcome.js missing');
  },
});

tests.push({
  name: 'welcome: HTML contains the 4 onboarding cards (i18n placeholders or English)',
  fn: () => {
    const html = fs.readFileSync(WELCOME_HTML, 'utf8');
    // Each card has a recognisable heading. The exact wording uses the
    // catalogue, but the structural anchors are the 4 card sections.
    const cardMatches = html.match(/class=["'][^"']*\bcard\b[^"']*["']/g) || [];
    assert.ok(cardMatches.length >= 4,
      `welcome.html must contain at least 4 .card sections, found ${cardMatches.length}`);
    // The page must reference the welcome i18n keys (either via __MSG_
    // placeholders in HTML or via JS that calls chrome.i18n.getMessage).
    const js = fs.readFileSync(WELCOME_JS, 'utf8');
    const referencesWelcomeTitle =
      /__MSG_welcome_title__/.test(html) ||
      /['"]welcome_title['"]/.test(js);
    assert.ok(referencesWelcomeTitle, 'welcome page must reference welcome_title');
  },
});

tests.push({
  name: 'welcome: HTML loads welcome.css and welcome.js',
  fn: () => {
    const html = fs.readFileSync(WELCOME_HTML, 'utf8');
    assert.match(html, /href=["'][^"']*welcome\.css["']/);
    assert.match(html, /src=["'][^"']*welcome\.js["']/);
  },
});

tests.push({
  name: 'welcome.js: does not use innerHTML (XSS discipline)',
  fn: () => {
    const src = fs.readFileSync(WELCOME_JS, 'utf8');
    const codeOnly = src
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n')
      .replace(/(['"`])(?:(?=(\\?))\2.)*?\1/g, '""');
    const matches = codeOnly.match(/\.innerHTML\s*=/g) || [];
    assert.strictEqual(matches.length, 0, 'welcome.js must not use .innerHTML');
  },
});

tests.push({
  name: 'welcome.js: "Get started" button opens the options page',
  fn: () => {
    const src = fs.readFileSync(WELCOME_JS, 'utf8');
    // The handler should call chrome.runtime.openOptionsPage() or
    // chrome.tabs.create with options/options.html.
    const callsOpenOptions =
      /chrome\.runtime\.openOptionsPage\s*\(/.test(src) ||
      /options\/options\.html/.test(src);
    assert.ok(callsOpenOptions, 'welcome.js must open the options page on Get Started');
  },
});

tests.push({
  name: 'welcome.js: loads in a vm sandbox without throwing',
  fn: () => {
    const src = fs.readFileSync(WELCOME_JS, 'utf8');
    // Minimal DOM: createElement, getElementById, addEventListener.
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
          openOptionsPage: () => {},
          getURL: (p) => 'chrome-extension://abc/' + p,
        },
        tabs: { create: () => {} },
      },
    };
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox, { filename: 'welcome.js' });
  },
});

module.exports = tests;
