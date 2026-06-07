// NOAIS test runner — no dependencies, plain node:assert.
// Discovers tests/*.test.js, runs each exported {name, fn}, prints results.
//
// Usage: node tests/run.js
//   or:  make test

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('node:assert');

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';

let pass = 0;
let fail = 0;
const failures = [];

const files = fs
  .readdirSync(__dirname)
  .filter((f) => f.endsWith('.test.js') && f !== 'run.js')
  .sort();

if (files.length === 0) {
  console.log('  (no test files found)');
  process.exit(1);
}

for (const file of files) {
  const mod = require(path.join(__dirname, file));
  if (!Array.isArray(mod)) {
    console.error(`  ${RED}!${RESET} ${file}: must export an array of {name, fn}`);
    fail++;
    continue;
  }
  for (const t of mod) {
    const label = `${file}: ${t.name}`;
    try {
      if (typeof t.fn !== 'function') throw new Error('test.fn is not a function');
      t.fn();
      pass++;
      console.log(`  ${GREEN}\u2713${RESET} ${label}`);
    } catch (err) {
      fail++;
      failures.push({ file, name: t.name, err });
      console.log(`  ${RED}\u2717${RESET} ${label}`);
      const msg = err && err.message ? err.message : String(err);
      console.log(`     ${DIM}${msg.split('\n').join('\n     ')}${RESET}`);
    }
  }
}

console.log('');
console.log(`  ${pass} pass, ${fail} fail`);
if (fail > 0) {
  console.log('');
  console.log(`  ${RED}Failures:${RESET}`);
  for (const f of failures) {
    console.log(`    - ${f.file}: ${f.name}`);
  }
  process.exit(1);
}
process.exit(0);
