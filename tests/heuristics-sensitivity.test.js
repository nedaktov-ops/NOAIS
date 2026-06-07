// Tests for heuristics.js with sensitivity parameter
// RED: heuristics.js currently has analyzeText(text) — no options arg yet.

'use strict';

const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

function loadHeuristics() {
  const file = path.join(__dirname, '..', 'extension', 'core', 'heuristics.js');
  const code = fs.readFileSync(file, 'utf8');
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'heuristics.js' });
  return sandbox.window.NOAIS_HEURISTICS;
}

// Reusable long text fixture (human-style blog about selling a car).
const HUMAN_TEXT = `
The clutch had been making this awful grinding noise since November. I kept telling
myself I'd get it looked at, but you know how it goes. Money was tight, the garage
down the road is run by a bloke who always finds something else wrong, and honestly
I was half hoping the whole thing would just die on the motorway so insurance would
pay out. It didn't. Instead it died at the Tesco roundabout on a Tuesday morning,
which is the most embarrassing place a car can possibly die. I sat there for forty
minutes waiting for the AA, watching a woman in a white Peugeot repeatedly beep at
me like I had personally ruined her Tuesday. Fair enough, maybe I had. I tried to
wave apologetically but I think she wanted blood. Anyway, the mechanic took one
look under the bonnet, sighed, and wrote a number on a piece of paper that made me
laugh. Not in a good way. He said, and I quote, you could fix it, but at this
point you are basically polishing a turd. I respected the honesty even if it stung.
So I sold it. Four fifty to a guy named Dean who turned up in a van with no seats
in the back and a dog called Brian. Brian licked my hand during the test drive. I
drove around the block feeling genuinely sad about the whole thing, that stupid car
had taken me to Cornwall twice, to my grandma funeral, to a music festival in
twenty nineteen where I lost my wallet and somehow found a better one. It was a
rubbish car. I loved it. What I miss, the radio, the heater that only worked on
setting four, the way the wing mirror was held on with electrical tape after
someone clipped me in Asda. What I do not miss, the anxiety, the one eighty a
month, the constant low grade dread every time the engine made a sound I did not
recognise. I have been cycling instead. My legs are now significantly more
muscular than they were in January. My mum is thrilled. The Peugeot woman,
presumably, is still out there beeping at someone. Probably Brian.
`.toLowerCase().replace(/\s+/g, ' ').trim();

// Long AI-style text (formulaic listicle, repeated transitions).
const AI_TEXT = `
Regular exercise is an important component of a healthy lifestyle. It is important
to note that engaging in physical activity on a consistent basis can yield numerous
benefits for both physical and mental well-being. Furthermore, exercise has been
shown to improve cardiovascular health, increase muscle strength, and enhance
overall quality of life. In this article, we will explore the various benefits of
regular exercise and provide practical recommendations for incorporating physical
activity into your daily routine. First and foremost, regular exercise is essential
for maintaining a healthy cardiovascular system. It is important to understand that
physical activity helps to strengthen the heart muscle, improve blood circulation,
and reduce the risk of heart disease. Additionally, exercise can help to lower blood
pressure, reduce cholesterol levels, and improve overall cardiovascular function.
These benefits are particularly important for individuals who are at risk of
developing heart disease or other cardiovascular conditions. Furthermore, regular
exercise plays a crucial role in maintaining a healthy weight. It is important to
recognize that physical activity helps to burn calories, build muscle mass, and
increase metabolism. Additionally, exercise can help to reduce body fat, improve
body composition, and enhance overall physical appearance. These benefits are
particularly important for individuals who are looking to lose weight or maintain
a healthy weight over the long term. In addition to physical benefits, regular
exercise has been shown to have a positive impact on mental health. It is
important to note that physical activity can help to reduce stress, anxiety, and
depression. Additionally, exercise can help to improve mood, increase self-esteem,
and enhance overall cognitive function. These benefits are particularly important
for individuals who are looking to improve their mental well-being and overall
quality of life. Moreover, regular exercise can help to improve sleep quality,
boost energy levels, and enhance overall productivity. It is important to
understand that physical activity helps to regulate sleep patterns, increase
energy expenditure, and improve overall physical and mental performance. These
benefits are particularly important for individuals who are looking to improve
their overall health and well-being. In conclusion, regular exercise is an
important component of a healthy lifestyle. It is important to incorporate
physical activity into your daily routine in order to experience the numerous
benefits that exercise has to offer. Whether you prefer walking, running,
cycling, or swimming, there are many different types of physical activity to
choose from. By making exercise a regular part of your routine, you can improve
your physical health, mental well-being, and overall quality of life.
`.toLowerCase().replace(/\s+/g, ' ').trim();

const tests = [];

tests.push({
  name: 'analyzeText: backward compat (no options) still works',
  fn: () => {
    const h = loadHeuristics();
    const r = h.analyzeText(AI_TEXT);
    assert.strictEqual(typeof r.score, 'number');
    assert.ok(r.score > 50, `expected AI score > 50, got ${r.score}`);
  },
});

tests.push({
  name: 'analyzeText: sensitivity=0 forces score to 0',
  fn: () => {
    const h = loadHeuristics();
    const r = h.analyzeText(AI_TEXT, { sensitivity: 0 });
    assert.strictEqual(r.score, 0);
  },
});

tests.push({
  name: 'analyzeText: sensitivity=50 halves the raw score',
  fn: () => {
    const h = loadHeuristics();
    const full = h.analyzeText(AI_TEXT, { sensitivity: 100 });
    const half = h.analyzeText(AI_TEXT, { sensitivity: 50 });
    // half.score should be approximately full.score / 2 (allow ±1 for rounding).
    assert.ok(
      Math.abs(half.score - Math.round(full.score / 2)) <= 1,
      `half=${half.score}, full=${full.score}, expected half ~ full/2`
    );
  },
});

tests.push({
  name: 'analyzeText: sensitivity=100 equals no-options call',
  fn: () => {
    const h = loadHeuristics();
    const a = h.analyzeText(AI_TEXT);
    const b = h.analyzeText(AI_TEXT, { sensitivity: 100 });
    assert.strictEqual(a.score, b.score);
    assert.strictEqual(a.wordCount, b.wordCount);
  },
});

tests.push({
  name: 'analyzeText: sensitivity=200 (over-range) caps at 100',
  fn: () => {
    const h = loadHeuristics();
    const r = h.analyzeText(AI_TEXT, { sensitivity: 200 });
    assert.ok(r.score <= 100, `expected score <= 100, got ${r.score}`);
  },
});

tests.push({
  name: 'analyzeText: sensitivity=0 still returns wordCount and breakdown',
  fn: () => {
    const h = loadHeuristics();
    const r = h.analyzeText(AI_TEXT, { sensitivity: 0 });
    assert.strictEqual(typeof r.wordCount, 'number');
    assert.strictEqual(r.wordCount > 0, true);
    assert.strictEqual(typeof r.breakdown, 'object');
  },
});

tests.push({
  name: 'analyzeText: empty options object = default sensitivity',
  fn: () => {
    const h = loadHeuristics();
    const a = h.analyzeText(AI_TEXT);
    const b = h.analyzeText(AI_TEXT, {});
    assert.strictEqual(a.score, b.score);
  },
});

tests.push({
  name: 'analyzeText: human text + sensitivity=100 still < 30',
  fn: () => {
    const h = loadHeuristics();
    const r = h.analyzeText(HUMAN_TEXT, { sensitivity: 100 });
    assert.ok(r.score < 30, `expected human score < 30, got ${r.score}`);
  },
});

tests.push({
  name: 'analyzeText: human text + sensitivity=0 = 0',
  fn: () => {
    const h = loadHeuristics();
    const r = h.analyzeText(HUMAN_TEXT, { sensitivity: 0 });
    assert.strictEqual(r.score, 0);
  },
});

module.exports = tests;
