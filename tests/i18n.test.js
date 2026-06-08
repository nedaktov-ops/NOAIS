// Tests for the i18n catalogue (v1.1.0)
//
// - The en catalogue exists and is valid JSON.
// - Every __MSG_*__ placeholder referenced in manifest.json maps to a key
//   in the catalogue.
// - Every catalogue entry has a non-empty 'message' string.
// - Every key used in chrome.i18n.getMessage('key') across the extension
//   JS/HTML files exists in the catalogue (no orphan references).

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function listFiles(dir, extPattern) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      // Skip _locales (the catalogue itself) so we don't recurse into it.
      if (e.name === '_locales') continue;
      out.push(...listFiles(full, extPattern));
    } else if (extPattern.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

const EXT_DIR = path.join(__dirname, '..', 'extension');
const CATALOGUE_PATH = path.join(EXT_DIR, '_locales', 'en', 'messages.json');
const MANIFEST_PATH = path.join(EXT_DIR, 'manifest.json');

const tests = [];

tests.push({
  name: 'i18n: _locales/en/messages.json exists and is valid JSON',
  fn: () => {
    assert.ok(fs.existsSync(CATALOGUE_PATH), '_locales/en/messages.json must exist');
    const cat = readJSON(CATALOGUE_PATH);
    assert.strictEqual(typeof cat, 'object');
    assert.ok(!Array.isArray(cat), 'catalogue is an object, not an array');
    // It should have at least 30 entries to cover the v1.1 surface.
    assert.ok(Object.keys(cat).length >= 30, `catalogue has ${Object.keys(cat).length} entries (expected >= 30)`);
  },
});

tests.push({
  name: 'i18n: every catalogue entry has a non-empty message string',
  fn: () => {
    const cat = readJSON(CATALOGUE_PATH);
    for (const [key, entry] of Object.entries(cat)) {
      assert.ok(entry && typeof entry === 'object', `${key} must be an object`);
      assert.strictEqual(typeof entry.message, 'string', `${key}.message must be a string`);
      assert.ok(entry.message.length > 0, `${key}.message must be non-empty`);
    }
  },
});

tests.push({
  name: 'i18n: manifest __MSG_*__ placeholders all resolve to catalogue keys',
  fn: () => {
    const cat = readJSON(CATALOGUE_PATH);
    const manifest = fs.readFileSync(MANIFEST_PATH, 'utf8');
    const re = /__MSG_([a-zA-Z0-9_]+)__/g;
    let m;
    const referenced = new Set();
    while ((m = re.exec(manifest)) !== null) {
      referenced.add(m[1]);
    }
    assert.ok(referenced.size > 0, 'manifest must reference at least one __MSG_*__ key');
    for (const key of referenced) {
      assert.ok(Object.prototype.hasOwnProperty.call(cat, key),
        `manifest references __MSG_${key}__ but catalogue does not define '${key}'`);
    }
  },
});

tests.push({
  name: 'i18n: every chrome.i18n.getMessage / __MSG_ key in source files is defined',
  fn: () => {
    const cat = readJSON(CATALOGUE_PATH);
    const files = [
      ...listFiles(EXT_DIR, /\.js$/),
      ...listFiles(EXT_DIR, /\.html$/),
    ];
    const referenced = new Set();
    // chrome.i18n.getMessage('key', ...) — first arg is the key.
    const reJS = /chrome\.i18n\.getMessage\(\s*['"]([a-zA-Z0-9_]+)['"]/g;
    // __MSG_key__ in HTML / JSON.
    const reMSG = /__MSG_([a-zA-Z0-9_]+)__/g;
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      let m;
      while ((m = reJS.exec(src)) !== null) referenced.add(m[1]);
      while ((m = reMSG.exec(src)) !== null) referenced.add(m[1]);
    }
    // It is OK to have zero references (a fresh project), but if there
    // are any, every one of them must be in the catalogue.
    for (const key of referenced) {
      assert.ok(Object.prototype.hasOwnProperty.call(cat, key),
        `source files reference i18n key '${key}' but catalogue does not define it`);
    }
  },
});

module.exports = tests;
