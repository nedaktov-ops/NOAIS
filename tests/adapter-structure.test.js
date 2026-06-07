// Static structural tests for the adapter wiring in manifest + content script.

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'extension/manifest.json'), 'utf8'));
const CONTENT = fs.readFileSync(path.join(ROOT, 'extension/content/content.js'), 'utf8');
const ADAPTER_BASE = fs.readFileSync(path.join(ROOT, 'extension/core/adapters/base.js'), 'utf8');
const ADAPTER_YT = fs.readFileSync(path.join(ROOT, 'extension/core/adapters/youtube.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'extension/styles/adapters.css'), 'utf8');

const tests = [];

tests.push({
  name: 'adapter-structure: manifest version is 0.9.0',
  fn: () => assert.strictEqual(MANIFEST.version, '0.9.0')
});

tests.push({
  name: 'adapter-structure: manifest content_scripts.js includes base.js + youtube.js BEFORE content.js',
  fn: () => {
    const js = MANIFEST.content_scripts[0].js;
    const baseIdx = js.indexOf('core/adapters/base.js');
    const ytIdx = js.indexOf('core/adapters/youtube.js');
    const contentIdx = js.indexOf('content/content.js');
    assert.ok(baseIdx >= 0, 'core/adapters/base.js listed');
    assert.ok(ytIdx >= 0, 'core/adapters/youtube.js listed');
    assert.ok(contentIdx >= 0, 'content/content.js listed');
    assert.ok(baseIdx < ytIdx, 'base.js loaded before youtube.js');
    assert.ok(ytIdx < contentIdx, 'youtube.js loaded before content.js');
  }
});

tests.push({
  name: 'adapter-structure: manifest content_scripts.css includes styles/adapters.css',
  fn: () => {
    const css = MANIFEST.content_scripts[0].css || [];
    assert.ok(css.includes('styles/adapters.css'), 'adapters.css in content_scripts.css');
  }
});

tests.push({
  name: 'adapter-structure: base.js never assigns to innerHTML',
  fn: () => {
    assert.ok(!/\.innerHTML\s*=/.test(ADAPTER_BASE), 'no innerHTML assignment');
  }
});

tests.push({
  name: 'adapter-structure: youtube.js never assigns to innerHTML',
  fn: () => {
    assert.ok(!/\.innerHTML\s*=/.test(ADAPTER_YT), 'no innerHTML assignment');
  }
});

tests.push({
  name: 'adapter-structure: base.js exposes NOAIS_ADAPTERS with helpers.createBadge that uses textContent',
  fn: () => {
    assert.match(ADAPTER_BASE, /window\.NOAIS_ADAPTERS|NOAIS_ADAPTERS/);
    assert.match(ADAPTER_BASE, /createBadge/);
    assert.match(ADAPTER_BASE, /textContent/);
  }
});

tests.push({
  name: 'adapter-structure: youtube.js exposes NOAIS_YOUTUBE_ADAPTER',
  fn: () => {
    assert.match(ADAPTER_YT, /NOAIS_YOUTUBE_ADAPTER/);
  }
});

tests.push({
  name: 'adapter-structure: manifest content_scripts.js includes facebook.js BEFORE content.js',
  fn: () => {
    const js = MANIFEST.content_scripts[0].js;
    const fbIdx = js.indexOf('core/adapters/facebook.js');
    const contentIdx = js.indexOf('content/content.js');
    assert.ok(fbIdx >= 0, 'core/adapters/facebook.js listed');
    assert.ok(contentIdx >= 0, 'content/content.js listed');
    assert.ok(fbIdx < contentIdx, 'facebook.js loaded before content.js');
  }
});

tests.push({
  name: 'adapter-structure: manifest content_scripts.js includes instagram.js + tiktok.js BEFORE content.js',
  fn: () => {
    const js = MANIFEST.content_scripts[0].js;
    const igIdx = js.indexOf('core/adapters/instagram.js');
    const ttIdx = js.indexOf('core/adapters/tiktok.js');
    const contentIdx = js.indexOf('content/content.js');
    assert.ok(igIdx >= 0, 'core/adapters/instagram.js listed');
    assert.ok(ttIdx >= 0, 'core/adapters/tiktok.js listed');
    assert.ok(igIdx < contentIdx, 'instagram.js loaded before content.js');
    assert.ok(ttIdx < contentIdx, 'tiktok.js loaded before content.js');
  }
});

tests.push({
  name: 'adapter-structure: content.js pickAdapter() dispatches instagram + tiktok',
  fn: () => {
    assert.match(CONTENT, /NOAIS_INSTAGRAM_ADAPTER/);
    assert.match(CONTENT, /NOAIS_TIKTOK_ADAPTER/);
  }
});

tests.push({
  name: 'adapter-structure: youtube adapter declares shortTextMode: true',
  fn: () => {
    assert.match(ADAPTER_YT, /shortTextMode:\s*true/);
  }
});

tests.push({
  name: 'adapter-structure: adapters.css includes noais-badge, noais-score-*, noais-hard, dark mode',
  fn: () => {
    assert.match(CSS, /\.noais-badge/);
    assert.match(CSS, /\.noais-score-/);
    assert.match(CSS, /\.noais-hard/);
    assert.match(CSS, /prefers-color-scheme:\s*dark/);
  }
});

tests.push({
  name: 'adapter-structure: content.js registers a MutationObserver on document.body',
  fn: () => {
    assert.match(CONTENT, /MutationObserver/);
    assert.match(CONTENT, /obs\.observe\([^)]*document\.body/);
  }
});

module.exports = tests;
