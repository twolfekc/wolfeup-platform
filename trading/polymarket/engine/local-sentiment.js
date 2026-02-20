'use strict';

// BTC/Crypto-specific sentiment word lists
// Score range: -1.0 to +1.0

const BULLISH_WORDS = {
  // Strong bullish (0.8-1.0)
  'all-time high': 1.0, 'ath': 0.9, 'record high': 1.0, 'surge': 0.8, 'soar': 0.85,
  'skyrocket': 0.9, 'moon': 0.75, 'parabolic': 0.85, 'breakout': 0.8, 'rally': 0.75,
  'institutional adoption': 0.9, 'etf approval': 1.0, 'etf inflow': 0.85,
  'blackrock': 0.7, 'spot etf': 0.8, 'bitcoin etf': 0.75,
  'inflation hedge': 0.65, 'store of value': 0.6, 'digital gold': 0.6,
  'accumulate': 0.65, 'buy the dip': 0.7, 'hodl': 0.5,
  'adoption': 0.6, 'mainstream': 0.55, 'legal tender': 0.8,
  'halving': 0.7, 'supply shock': 0.75, 'scarcity': 0.6,
  'fed pause': 0.65, 'rate cut': 0.7, 'dovish': 0.6,
  'bull run': 0.85, 'bull market': 0.8, 'bullish': 0.75,
  'recovery': 0.6, 'rebound': 0.65, 'bounce': 0.55,
  'accumulation': 0.65, 'whale buying': 0.7, 'inflows': 0.65,

  // Medium bullish (0.4-0.7)
  'positive': 0.4, 'growth': 0.45, 'gains': 0.5, 'up': 0.3, 'rise': 0.45,
  'increase': 0.4, 'higher': 0.4, 'support': 0.45, 'strong': 0.45,
  'confidence': 0.5, 'optimistic': 0.55, 'upgrade': 0.5,
  'partnership': 0.5, 'integrate': 0.45, 'launch': 0.4,
};

const BEARISH_WORDS = {
  // Strong bearish (-0.8 to -1.0)
  'crash': -0.9, 'collapse': -0.95, 'plunge': -0.85, 'dump': -0.8,
  'ban': -0.9, 'banned': -0.9, 'crackdown': -0.8, 'seized': -0.75,
  'sec lawsuit': -0.9, 'sec charges': -0.85, 'regulation ban': -0.9,
  'bankrupt': -0.95, 'insolvency': -0.9, 'hack': -0.85, 'exploit': -0.8,
  'ponzi': -0.9, 'fraud': -0.85, 'scam': -0.8,
  'capitulation': -0.8, 'panic selling': -0.85, 'mass liquidation': -0.9,
  'below $': -0.5, 'breaks support': -0.7, 'death cross': -0.75,
  'bear market': -0.8, 'bearish': -0.7, 'bear run': -0.8,
  'rate hike': -0.65, 'hawkish': -0.55, 'tightening': -0.5,
  'inflation': -0.4, 'recession': -0.6, 'stagflation': -0.65,
  'outflows': -0.6, 'whale selling': -0.65, 'distribution': -0.5,

  // Medium bearish (-0.4 to -0.7)
  'negative': -0.4, 'loss': -0.45, 'decline': -0.45, 'drop': -0.45,
  'fall': -0.4, 'lower': -0.4, 'weakness': -0.5, 'concern': -0.4,
  'warning': -0.5, 'risk': -0.35, 'uncertain': -0.4, 'volatile': -0.3,
  'correction': -0.5, 'pullback': -0.45, 'resistance': -0.3,
  'fear': -0.5, 'panic': -0.7, 'sell-off': -0.65, 'selloff': -0.65,
};

// Negation words that flip sentiment
const NEGATORS = ['not', 'no', 'never', "doesn't", "don't", "isn't", "aren't", "won't", "can't", 'without', 'fail'];

// Intensifiers
const INTENSIFIERS = { 'very': 1.3, 'extremely': 1.5, 'massive': 1.4, 'huge': 1.3, 'major': 1.2, 'minor': 0.7, 'slight': 0.6, 'slightly': 0.6 };

/**
 * Score a single text string
 * @param {string} text
 * @returns {number} -1.0 to +1.0
 */
function scoreText(text) {
  if (!text || typeof text !== 'string') return 0;

  const lower = text.toLowerCase();
  const words = lower.split(/\s+/);

  let totalScore = 0;
  let matchCount = 0;

  // Check multi-word phrases first
  const allPhrases = [...Object.keys(BULLISH_WORDS), ...Object.keys(BEARISH_WORDS)]
    .filter(k => k.includes(' '))
    .sort((a, b) => b.length - a.length); // longest first

  let processedRanges = [];

  for (const phrase of allPhrases) {
    const idx = lower.indexOf(phrase);
    if (idx === -1) continue;

    // Check if this range overlaps with already-processed
    const end = idx + phrase.length;
    const overlaps = processedRanges.some(([s, e]) => idx < e && end > s);
    if (overlaps) continue;

    // Check for negation in the 3 words before
    const before = lower.slice(Math.max(0, idx - 30), idx);
    const negated = NEGATORS.some(n => before.endsWith(' ' + n + ' ') || before.endsWith(' ' + n));

    const baseScore = BULLISH_WORDS[phrase] ?? BEARISH_WORDS[phrase] ?? 0;
    totalScore += negated ? -baseScore * 0.8 : baseScore;
    matchCount++;
    processedRanges.push([idx, end]);
  }

  // Check single words
  for (let i = 0; i < words.length; i++) {
    const word = words[i].replace(/[^a-z0-9'-]/g, '');

    const inRange = processedRanges.some(([s, e]) => {
      const wordIdx = lower.indexOf(word, s > 5 ? s - 5 : 0);
      return wordIdx >= s && wordIdx < e;
    });
    if (inRange) continue;

    let score = BULLISH_WORDS[word] ?? BEARISH_WORDS[word] ?? 0;
    if (score === 0) continue;

    // Check negation
    const prevWords = words.slice(Math.max(0, i - 3), i);
    const negated = prevWords.some(w => NEGATORS.includes(w));
    if (negated) score = -score * 0.8;

    // Check intensifier
    const prevWord = words[i - 1]?.replace(/[^a-z]/g, '');
    if (prevWord && INTENSIFIERS[prevWord]) score *= INTENSIFIERS[prevWord];

    totalScore += score;
    matchCount++;
  }

  if (matchCount === 0) return 0;

  // Average and clamp
  const avg = totalScore / Math.max(matchCount, 1);
  return Math.max(-1, Math.min(1, avg));
}

/**
 * Score an array of headlines/texts, return aggregate + individual scores
 * @param {string[]} texts
 * @returns {{ aggregate: number, scores: number[], summary: string }}
 */
function scoreTexts(texts) {
  if (!texts || texts.length === 0) return { aggregate: 0, scores: [], summary: 'No data' };

  const scores = texts.map(t => scoreText(t));
  const validScores = scores.filter(s => s !== 0);

  const aggregate = validScores.length > 0
    ? validScores.reduce((a, b) => a + b, 0) / validScores.length
    : 0;

  const bullish = scores.filter(s => s > 0.1).length;
  const bearish = scores.filter(s => s < -0.1).length;
  const neutral = scores.length - bullish - bearish;

  const direction = aggregate > 0.1 ? 'bullish' : aggregate < -0.1 ? 'bearish' : 'neutral';
  const summary = `${direction.toUpperCase()} (${bullish}↑ ${bearish}↓ ${neutral}→) score: ${aggregate.toFixed(3)}`;

  return { aggregate, scores, summary };
}

/**
 * Quick single-call interface for the aggregator
 * @param {string|string[]} input
 * @returns {number} normalized score -1 to +1
 */
function score(input) {
  if (Array.isArray(input)) return scoreTexts(input).aggregate;
  return scoreText(input);
}

/**
 * LLM-powered sentiment scoring via Ollama (4090).
 * More nuanced than word-list scoring — understands sarcasm, context, and implications.
 * Falls back to word-list scoring if Ollama is unavailable.
 * @param {string[]} headlines
 * @returns {Promise<{ aggregate: number, scores: number[], summary: string, source: string }>}
 */
async function scoreWithLLM(headlines) {
  if (!headlines || headlines.length === 0) {
    return { aggregate: 0, scores: [], summary: 'No data', source: 'none' };
  }

  try {
    const { generate, getBestEndpoint } = require('./local-llm');
    const ep = await getBestEndpoint();
    if (!ep) throw new Error('No Ollama endpoint available');

    const headlineList = headlines.slice(0, 15).map((h, i) => `${i + 1}. ${h}`).join('\n');
    const prompt = `Score each Bitcoin headline for market sentiment from -1.0 (extremely bearish) to +1.0 (extremely bullish). Consider context, implications, and nuance.

Headlines:
${headlineList}

Respond with ONLY valid JSON (no explanation):
{"scores":[0.5,-0.3,...],"aggregate":0.1,"summary":"one sentence market mood"}

Rules:
- Each score maps to the headline at that index
- aggregate = weighted average of all scores
- Be precise: ETF inflows are bullish, regulatory crackdowns are bearish, neutral news is 0.0`;

    const result = await generate(prompt, { maxTokens: 200, temperature: 0.05, timeout: 30000 });
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in LLM response');

    const parsed = JSON.parse(jsonMatch[0]);
    const scores = (parsed.scores || []).map(s => Math.max(-1, Math.min(1, parseFloat(s) || 0)));
    const aggregate = typeof parsed.aggregate === 'number' ? Math.max(-1, Math.min(1, parsed.aggregate)) : 0;
    const summary = parsed.summary || 'LLM sentiment scored';

    return { aggregate, scores, summary: `LLM(${ep.name}): ${summary}`, source: `ollama:${ep.name}` };
  } catch (e) {
    // Fallback to word-list scoring
    const fallback = scoreTexts(headlines);
    fallback.source = 'wordlist:fallback';
    return fallback;
  }
}

module.exports = { score, scoreText, scoreTexts, scoreWithLLM };

// CLI test
if (require.main === module) {
  const tests = [
    'Bitcoin ETF sees record inflows as institutional adoption surges',
    'SEC crackdown on crypto exchanges causes panic selling',
    'BTC breaks all-time high, analysts predict parabolic move',
    'Bitcoin crashes below $60,000 amid regulatory concerns',
    'Bitcoin price remains stable amid market uncertainty',
    'Fed signals rate pause, Bitcoin rallies on dovish tone',
    'Whale wallet moves 10,000 BTC to exchange, fear of dump',
  ];

  console.log('=== Word-list Sentiment Scorer ===\n');
  for (const t of tests) {
    const s = scoreText(t);
    const bar = '█'.repeat(Math.round(Math.abs(s) * 10));
    const dir = s > 0 ? '📈' : s < 0 ? '📉' : '➡️';
    console.log(`${dir} ${s.toFixed(3)} ${bar} "${t}"`);
  }

  console.log('\n=== LLM Sentiment Scorer (4090) ===\n');
  scoreWithLLM(tests).then(result => {
    console.log(`Aggregate: ${result.aggregate.toFixed(3)}`);
    console.log(`Summary: ${result.summary}`);
    console.log(`Source: ${result.source}`);
    if (result.scores) {
      result.scores.forEach((s, i) => {
        const bar = '█'.repeat(Math.round(Math.abs(s) * 10));
        const dir = s > 0 ? '📈' : s < 0 ? '📉' : '➡️';
        console.log(`  ${dir} ${s.toFixed(3)} ${bar} "${tests[i]}"`);
      });
    }
  });
}
