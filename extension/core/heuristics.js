// NOAIS heuristic analysis engine - v0.3.0
// Pure JavaScript, zero dependencies, no models.
// Exposes window.NOAIS_HEURISTICS.analyzeText(text) -> { score, wordCount, breakdown }
//
// Metrics:
//   1. Burstiness       — variation in sentence length. Humans: high. AI: low.
//   2. Type-Token Ratio — unique words / total words. Humans: higher. AI: lower.
//   3. Shannon Entropy  — unpredictability of word distribution. Humans: higher.
//   4. Hapax Ratio      — words used exactly once / unique words. Humans: higher.
//
// Each metric is normalised to a 0–1 "AI-likely" sub-score, then a weighted
// average produces the final 0–100 score. Thresholds are educated guesses
// derived from published stylometric studies; v0.7 may tune them with a model.

(function () {
  'use strict';

  /** Tokenise: lowercase, keep apostrophes, return array of words. */
  function tokenize(text) {
    if (!text) return [];
    const matches = text.toLowerCase().match(/\b[a-z']+\b/g);
    return matches || [];
  }

  /** Split into sentences on . ! ? followed by whitespace or end. */
  function splitSentences(text) {
    if (!text) return [];
    return text
      .split(/[.!?]+(?:\s+|$)/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  function mean(arr) {
    if (!arr || arr.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < arr.length; i++) sum += arr[i];
    return sum / arr.length;
  }

  function stddev(arr) {
    if (!arr || arr.length < 2) return 0;
    const m = mean(arr);
    let sumSq = 0;
    for (let i = 0; i < arr.length; i++) {
      const d = arr[i] - m;
      sumSq += d * d;
    }
    return Math.sqrt(sumSq / (arr.length - 1));
  }

  /** Burstiness: stddev / mean of sentence word-lengths. */
  function burstiness(text) {
    const sentences = splitSentences(text);
    if (sentences.length < 2) return 0;
    const lengths = sentences.map((s) => tokenize(s).length);
    const m = mean(lengths);
    if (m === 0) return 0;
    return stddev(lengths) / m;
  }

  /** Type-Token Ratio: unique / total. */
  function typeTokenRatio(words) {
    if (!words || words.length === 0) return 0;
    const unique = new Set(words);
    return unique.size / words.length;
  }

  /** Shannon entropy of the word distribution (base 2). */
  function shannonEntropy(words) {
    if (!words || words.length === 0) return 0;
    const freq = Object.create(null);
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      freq[w] = (freq[w] || 0) + 1;
    }
    const total = words.length;
    let entropy = 0;
    for (const w in freq) {
      const p = freq[w] / total;
      if (p > 0) entropy -= p * Math.log2(p);
    }
    return entropy;
  }

  /** Hapax ratio: words used once / unique words. */
  function hapaxRatio(words) {
    if (!words || words.length === 0) return 0;
    const freq = Object.create(null);
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      freq[w] = (freq[w] || 0) + 1;
    }
    const unique = Object.keys(freq).length;
    if (unique === 0) return 0;
    let hapax = 0;
    for (const w in freq) if (freq[w] === 1) hapax++;
    return hapax / unique;
  }

  /** Clamp a number to [min, max]. */
  function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  }

  /**
   * Analyse a body of text and return a 0-100 AI-likely score plus the raw
   * metric values. Returns score=0 for text shorter than 50 words.
   *
   * Options (optional, all keys optional):
   *   sensitivity - integer 0-100, default 100. The raw score is multiplied
   *                 by (sensitivity / 100) and clamped to [0, 100] before
   *                 rounding. 0 forces the score to 0; 200 caps at 100.
   *
   * @param {string} text
   * @param {{sensitivity?:number}} [options]
   * @returns {{score:number, wordCount:number, breakdown:object}}
   */
  function analyzeText(text, options) {
    const words = tokenize(text);
    const wordCount = words.length;

    if (wordCount < 50) {
      return {
        score: 0,
        wordCount,
        breakdown: { reason: 'Text too short for analysis (< 50 words).' },
      };
    }

    const b = burstiness(text);
    const ttr = typeTokenRatio(words);
    const entropy = shannonEntropy(words);
    const hapax = hapaxRatio(words);

    // Normalise each metric to a 0-1 "AI-likely" sub-score.
    // Lower raw value = more AI-like. We map the "human range" to 0 and the
    // "AI range" to 1, clamped.
    const bScore = clamp((0.8 - b) / 0.5, 0, 1);   // human ~0.8, AI ~0.3
    const tScore = clamp((0.6 - ttr) / 0.3, 0, 1);  // human ~0.6, AI ~0.3
    const eScore = clamp((10 - entropy) / 3, 0, 1); // human ~10, AI ~7
    const hScore = clamp((0.7 - hapax) / 0.4, 0, 1); // human ~0.7, AI ~0.3

    // Weighted average.
    const score01 = bScore * 0.3 + tScore * 0.25 + eScore * 0.25 + hScore * 0.2;

    // Apply sensitivity multiplier. Default 100 = no change. 0 -> score=0.
    const sensitivity = (options && typeof options.sensitivity === 'number')
      ? options.sensitivity
      : 100;
    const multiplier = clamp(sensitivity, 0, 1000) / 100;
    const final01 = clamp(score01 * multiplier, 0, 1);
    const score = Math.round(final01 * 100);

    return {
      score,
      wordCount,
      breakdown: {
        burstiness: Number(b.toFixed(3)),
        typeTokenRatio: Number(ttr.toFixed(3)),
        entropy: Number(entropy.toFixed(2)),
        hapaxRatio: Number(hapax.toFixed(3)),
        subScores: {
          burstiness: Number(bScore.toFixed(3)),
          typeTokenRatio: Number(tScore.toFixed(3)),
          entropy: Number(eScore.toFixed(3)),
          hapaxRatio: Number(hScore.toFixed(3)),
        },
        sensitivity: Number(sensitivity),
      },
    };
  }

  // Expose to other content scripts in the same isolated world.
  if (typeof window !== 'undefined') {
    window.NOAIS_HEURISTICS = Object.freeze({ analyzeText });
  }
})();
