// Tests for shortTextMode option in core/heuristics.js
//
// shortTextMode: true means:
//   - minimum word count drops to 5 (was 50)
//   - only TTR + entropy are computed (no burstiness, no hapax)
//   - final score still 0-100

'use strict';

const assert = require('node:assert');
const path = require('node:path');

const tests = [];

// Load heuristics.js as a CommonJS module (it doesn't export via module.exports
// in browser mode, so we shim window first).
function loadHeuristics() {
  const file = path.join(__dirname, '..', 'extension', 'core', 'heuristics.js');
  delete require.cache[require.resolve(file)];
  // Stub `window` so the IIFE's `if (typeof window !== 'undefined')` branch
  // assigns NOAIS_HEURISTICS to a fresh object we can extract.
  const captured = {};
  global.window = { set NOAIS_HEURISTICS(v) { captured.NOAIS_HEURISTICS = v; } };
  try {
    require(file);
    return captured.NOAIS_HEURISTICS;
  } finally {
    delete global.window;
  }
}

tests.push({
  name: 'heuristics: shortTextMode=true accepts texts as short as 5 words',
  fn: () => {
    const H = loadHeuristics();
    const text = 'the quick brown fox jumps'; // 5 words
    const r = H.analyzeText(text, { shortTextMode: true });
    assert.ok(r.score >= 0 && r.score <= 100, 'score in 0-100');
    assert.strictEqual(r.wordCount, 5);
    assert.ok(!r.breakdown.reason, 'no "too short" reason');
  }
});

tests.push({
  name: 'heuristics: shortTextMode=true still rejects texts under 5 words',
  fn: () => {
    const H = loadHeuristics();
    const text = 'one two three four'; // 4 words
    const r = H.analyzeText(text, { shortTextMode: true });
    assert.strictEqual(r.score, 0, 'under 5 words still scores 0');
    assert.ok(r.breakdown.reason, 'has a reason');
  }
});

tests.push({
  name: 'heuristics: shortTextMode=true still rejects empty/short texts',
  fn: () => {
    const H = loadHeuristics();
    const r1 = H.analyzeText('', { shortTextMode: true });
    assert.strictEqual(r1.score, 0);
    const r2 = H.analyzeText('   ', { shortTextMode: true });
    assert.strictEqual(r2.score, 0);
  }
});

tests.push({
  name: 'heuristics: shortTextMode=true uses only TTR + entropy (no burstiness/hapax)',
  fn: () => {
    const H = loadHeuristics();
    const text = 'It is important to note that the new model demonstrates ' +
                 'a significant improvement over its predecessor. Furthermore, ' +
                 'the architecture leverages a novel attention mechanism.';
    const r = H.analyzeText(text, { shortTextMode: true });
    assert.ok(r.breakdown.typeTokenRatio !== undefined, 'has TTR');
    assert.ok(r.breakdown.entropy !== undefined, 'has entropy');
    assert.strictEqual(r.breakdown.burstiness, undefined, 'no burstiness');
    assert.strictEqual(r.breakdown.hapaxRatio, undefined, 'no hapax');
  }
});

tests.push({
  name: 'heuristics: shortTextMode=true on AI-style short text scores high',
  fn: () => {
    const H = loadHeuristics();
    const aiText = 'It is important to note that the model has been ' +
                   'designed to leverage a novel architecture. Furthermore, ' +
                   'the system demonstrates significant improvements. Additionally, ' +
                   'the training process incorporates a comprehensive dataset.';
    const r = H.analyzeText(aiText, { shortTextMode: true });
    // Heuristic: TTR low + entropy low -> score higher
    assert.ok(r.score > 30, `expected score > 30 on AI text, got ${r.score}`);
  }
});

tests.push({
  name: 'heuristics: shortTextMode=true on human-style short text scores lower',
  fn: () => {
    const H = loadHeuristics();
    const humanText = 'I just got mine yesterday. Honestly the build quality ' +
                      'surprised me. Buttons feel solid. Screen is bright. ' +
                      'Battery lasted the whole day of me messing with it. ' +
                      'Only complaint: cable is super short.';
    const r = H.analyzeText(humanText, { shortTextMode: true });
    // Less formulaic, more variety -> score lower than the AI text
    assert.ok(r.score < 50, `expected score < 50 on human text, got ${r.score}`);
  }
});

tests.push({
  name: 'heuristics: shortTextMode=false (default) keeps v0.4 min-50-words rule',
  fn: () => {
    const H = loadHeuristics();
    const r = H.analyzeText('one two three four five six seven eight');
    assert.strictEqual(r.score, 0, '< 50 words -> score 0');
    assert.ok(r.breakdown.reason, 'has a reason');
  }
});

tests.push({
  name: 'heuristics: shortTextMode + sensitivity combine correctly',
  fn: () => {
    const H = loadHeuristics();
    const text = 'It is important to note that the model has been ' +
                 'designed to leverage a novel architecture. Furthermore, ' +
                 'the system demonstrates significant improvements.';
    const r100 = H.analyzeText(text, { shortTextMode: true, sensitivity: 100 });
    const r50 = H.analyzeText(text, { shortTextMode: true, sensitivity: 50 });
    // Lower sensitivity -> lower score (rounded)
    assert.ok(r50.score <= r100.score, `r50 (${r50.score}) should be <= r100 (${r100.score})`);
    assert.ok(r100.score >= 30, 'sanity: full sensitivity on AI text still scores AI');
  }
});

module.exports = tests;
