// Standalone Node test of NOAIS heuristic engine on two HTML fixtures.
// Strips HTML tags to approximate document.body.innerText, then runs
// analyzeText() and prints the score plus the raw metrics.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function htmlToInnerText(html) {
  // Very rough innerText approximation: drop scripts/styles, then tags,
  // collapse whitespace. Good enough for fixture testing.
  let s = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<[^>]+>/g, ' ');
  s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function runFixture(name, file) {
  const html = fs.readFileSync(file, 'utf8');
  const text = htmlToInnerText(html);

  // Load heuristics.js in a sandbox with a fake window.
  const code = fs.readFileSync(path.join('/home/nedaktov/Desktop/NOAIS/extension/core/heuristics.js'), 'utf8');
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'heuristics.js' });

  const h = sandbox.window.NOAIS_HEURISTICS;
  if (!h || typeof h.analyzeText !== 'function') {
    console.error(`[${name}] FAILED to load NOAIS_HEURISTICS`);
    process.exit(1);
  }
  const r = h.analyzeText(text);
  console.log(`\n=== ${name} (${file}) ===`);
  console.log(`  wordCount      : ${r.wordCount}`);
  console.log(`  AI-likely score: ${r.score}/100`);
  console.log(`  breakdown      :`, JSON.stringify(r.breakdown, null, 2));
  return r;
}

const human = runFixture('HUMAN', '/tmp/noais-test-human.html');
const ai    = runFixture('AI',    '/tmp/noais-test-ai.html');

console.log('\n=== Verdict ===');
console.log(`  human score = ${human.score}  (target: < 30)`);
console.log(`  ai    score = ${ai.score}  (target: > 60)`);

let pass = true;
if (human.score >= 30) {
  console.error(`  FAIL: human score ${human.score} is not below 30`);
  pass = false;
}
if (ai.score <= 60) {
  console.error(`  FAIL: ai score ${ai.score} is not above 60`);
  pass = false;
}
if (ai.score <= human.score) {
  console.error(`  FAIL: ai score (${ai.score}) is not greater than human score (${human.score})`);
  pass = false;
}
if (pass) {
  console.log('  PASS: heuristic engine separates human and AI text clearly.');
  process.exit(0);
} else {
  console.error('  FAILED validation.');
  process.exit(2);
}
