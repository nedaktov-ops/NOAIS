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
   * metric values. Returns score=0 for text shorter than 50 words by default;
   * with `shortTextMode: true`, accepts as few as 5 words and uses only
   * TTR + entropy (burstiness and hapax are unreliable on very short text).
   *
   * Options (optional, all keys optional):
   *   sensitivity     - integer 0-100, default 100. The raw score is multiplied
   *                     by (sensitivity / 100) and clamped to [0, 100] before
   *                     rounding. 0 forces the score to 0; 1000 caps at 100.
   *   shortTextMode   - boolean, default false. Lowers the minimum word count
   *                     to 5 and uses only TTR + entropy. Useful for comment
   *                     threads and other short texts.
   *
   * @param {string} text
   * @param {{sensitivity?:number, shortTextMode?:boolean}} [options]
   * @returns {{score:number, wordCount:number, breakdown:object}}
   */
  function analyzeText(text, options) {
    const words = tokenize(text);
    const wordCount = words.length;
    const shortMode = !!(options && options.shortTextMode === true);
    const minWords = shortMode ? 5 : 50;

    if (wordCount < minWords) {
      return {
        score: 0,
        wordCount,
        breakdown: {
          reason: 'Text too short for analysis (< ' + minWords + ' words).',
        },
      };
    }

    // Compute the metrics.
    const ttr = typeTokenRatio(words);
    const entropy = shannonEntropy(words);

    // Sensitivity multiplier. Default 100 = no change. 0 -> score=0.
    const sensitivity = (options && typeof options.sensitivity === 'number')
      ? options.sensitivity
      : 100;
    const multiplier = clamp(sensitivity, 0, 1000) / 100;

    let bScore, hScore;
    if (shortMode) {
      // Short-text mode: only TTR + entropy. Weights renormalised to 1.0.
      // Burstiness and hapax are unreliable on <100 words.
      //
      // Short-text thresholds (different from long-text):
      //   TTR:     human ~0.90, AI ~0.70. (long-text: human 0.6, AI 0.3)
      //   Entropy: human ~6.0,  AI ~4.5.  (long-text: human 10,  AI 7)
      const tScore = clamp((0.90 - ttr) / 0.20, 0, 1);
      const eScore = clamp((6.0 - entropy) / 1.5, 0, 1);
      const score01 = tScore * 0.5 + eScore * 0.5;
      const final01 = clamp(score01 * multiplier, 0, 1);
      const score = Math.round(final01 * 100);
      return {
        score,
        wordCount,
        breakdown: {
          typeTokenRatio: Number(ttr.toFixed(3)),
          entropy: Number(entropy.toFixed(2)),
          subScores: {
            typeTokenRatio: Number(tScore.toFixed(3)),
            entropy: Number(eScore.toFixed(3)),
          },
          sensitivity: Number(sensitivity),
          shortTextMode: true,
        },
      };
    }

    // Long-text mode (default): all four metrics.
    const b = burstiness(text);
    const hapax = hapaxRatio(words);
    bScore = clamp((0.8 - b) / 0.5, 0, 1);       // human ~0.8, AI ~0.3
    const tScore = clamp((0.6 - ttr) / 0.3, 0, 1);  // human ~0.6, AI ~0.3
    const eScore = clamp((10 - entropy) / 3, 0, 1); // human ~10, AI ~7
    hScore = clamp((0.7 - hapax) / 0.4, 0, 1);   // human ~0.7, AI ~0.3

    // Weighted average.
    const score01 = bScore * 0.3 + tScore * 0.25 + eScore * 0.25 + hScore * 0.2;
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
