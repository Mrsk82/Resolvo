// Lexicon-based sentiment analysis — no AI/LLM call, no network dependency,
// no API key, no per-request cost or latency, and no customer text ever
// leaves the server. This replaces three inconsistent ad-hoc keyword
// scorers that previously existed in server.js (different word lists,
// different baselines, disagreeing on the same message).
//
// Technique: word-polarity lexicon + negation flipping + intensifier
// scaling + a "comparative score" normalization (sum of matched polarities
// divided by the number of sentiment-bearing words found) — the same core
// approach used by established lexicon libraries (e.g. AFINN-based tools),
// scaled down to a lexicon sized for customer-support language specifically
// rather than general-purpose text.

// Word -> polarity, -5 (very negative) to +5 (very positive). Curated for
// customer-support vocabulary rather than general text.
const LEXICON = {
  // strong negative
  'furious':-5,'outraged':-5,'disgusting':-5,'scam':-5,'fraud':-5,'lawsuit':-5,'unacceptable':-5,
  'horrible':-4,'terrible':-4,'awful':-4,'worst':-4,'pathetic':-4,'useless':-4,'broken':-4,
  'disaster':-4,'ridiculous':-4,'incompetent':-4,'hate':-4,'scammed':-5,
  // moderate negative
  'angry':-3,'frustrated':-3,'disappointed':-3,'annoyed':-3,'unhappy':-3,'upset':-3,
  'complaint':-3,'refund':-2,'cancel':-3,'escalate':-2,'failed':-3,'error':-2,'issue':-2,
  'problem':-2,'wrong':-2,'poor':-3,'bad':-3,'waste':-3,'ignored':-3,'delay':-2,'delayed':-2,
  'crash':-3,'crashed':-3,'bug':-2,'slow':-2,'confusing':-2,'complicated':-2,
  // mild negative / concern
  'concerned':-1,'worried':-1,'urgent':-1,'asap':-1,'waiting':-1,'unclear':-1,'difficult':-1,
  'expensive':-1,'missing':-1,'stuck':-2,'unresponsive':-3,
  // mild positive
  'okay':1,'fine':1,'clear':1,'quick':1,'easy':1,'helpful':2,'works':1,'resolved':2,
  // moderate positive
  'thanks':2,'thank':2,'appreciate':2,'good':2,'nice':2,'satisfied':2,'happy':3,'pleased':2,
  'smooth':2,'convenient':2,'reliable':2,'efficient':2,
  // strong positive
  'excellent':4,'amazing':4,'fantastic':4,'wonderful':4,'perfect':5,'outstanding':4,
  'awesome':4,'brilliant':4,'love':4,'best':4,'great':3,'impressed':4,'exceeded':3,
};

// Multi-word phrases checked before single-word tokenization (higher signal).
const PHRASES = {
  'extremely frustrated':-5,'very disappointed':-4,'waste of money':-4,'waste of time':-4,
  'cancel my subscription':-4,'cancel my account':-4,'never again':-4,'going viral':-3,
  'still broken':-4,'been waiting':-2,'not working':-3,'does not work':-3,"doesn't work":-3,
  'thank you':2,'thank you so much':4,'great job':4,'well done':3,'works great':4,
  'highly recommend':4,'exceeded my expectations':4,
};

const NEGATIONS = new Set(['not',"n't",'no','never','without','hardly','barely',"don't",'dont',"doesn't",'doesnt',"didn't",'didnt',"won't",'wont',"can't",'cant',"wasn't",'wasnt',"isn't",'isnt']);
const INTENSIFIERS = { 'very':1.5,'extremely':1.8,'really':1.4,'so':1.3,'incredibly':1.7,'absolutely':1.6,'totally':1.4 };
const DIMINISHERS = { 'slightly':0.5,'somewhat':0.6,'a bit':0.6,'kind of':0.6,'sort of':0.6 };

// Splits into clauses on , . ; — negation/intensifier scanning must never
// cross a clause boundary (fixes cases like "no response, extremely
// disappointed" where the "no" negates "response" earlier in the sentence,
// not "disappointed" after the comma — a real ambiguity plain word-window
// scanning gets wrong without this).
function _tokenizeClauses(text) {
  return text.toLowerCase().split(/[,.;]+/).map(clause =>
    clause.replace(/[^\w\s'!]/g, ' ').split(/\s+/).filter(Boolean)
  ).filter(words => words.length);
}

/**
 * @param {string} rawText
 * @returns {{score:number, level:'positive'|'negative'|'neutral', comparative:number, matchedWords:number}}
 *   score: 0-100 (50 = neutral midpoint), level: 3-tier classification.
 */
function analyzeSentiment(rawText) {
  const text = String(rawText || '');
  if (!text.trim()) return { score: 50, level: 'neutral', comparative: 0, matchedWords: 0 };

  let workingText = text.toLowerCase();
  let phraseScore = 0, phraseHits = 0;
  for (const [phrase, polarity] of Object.entries(PHRASES)) {
    if (workingText.includes(phrase)) {
      phraseScore += polarity; phraseHits++;
      workingText = workingText.split(phrase).join(' '); // consume so words inside aren't double-counted
    }
  }

  let wordScore = 0, wordHits = 0;
  for (const words of _tokenizeClauses(workingText)) {
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (!(w in LEXICON)) continue;
      let polarity = LEXICON[w];

      // Look back up to 3 words *within this clause only* for negation /
      // intensifiers / diminishers — never crosses a comma/period boundary.
      let negate = false, multiplier = 1;
      for (let j = Math.max(0, i - 3); j < i; j++) {
        if (NEGATIONS.has(words[j])) negate = true;
        if (words[j] in INTENSIFIERS) multiplier = Math.max(multiplier, INTENSIFIERS[words[j]]);
        if (words[j] in DIMINISHERS) multiplier = Math.min(multiplier, DIMINISHERS[words[j]]);
      }
      if (negate) polarity = -polarity * 0.8; // negated sentiment flips but slightly softened (real language is imperfectly literal)
      wordScore += polarity * multiplier;
      wordHits++;
    }
  }

  // Shouting amplifies whatever polarity is already present — it should
  // never invent negativity on its own (e.g. "GREAT JOB!!!" is positive,
  // not negative, unlike the old scorer this replaces).
  const totalHits = phraseHits + wordHits;
  const rawScore = phraseScore + wordScore;
  const capsWords = (text.match(/\b[A-Z]{3,}\b/g) || []).length;
  const exclaims = (text.match(/!/g) || []).length;
  const shoutMultiplier = 1 + Math.min(1, capsWords * 0.15 + exclaims * 0.1);
  const amplified = rawScore * (rawScore !== 0 ? shoutMultiplier : 1);

  // Comparative score = average polarity per sentiment-bearing signal found —
  // keeps a one-line negative message and a five-paragraph negative email
  // comparable instead of the longer one always scoring "worse".
  const comparative = totalHits > 0 ? amplified / totalHits : 0;

  // Map comparative (-5..+5 range) to 0-100, 50 = neutral center.
  const score = Math.max(0, Math.min(100, Math.round(50 + comparative * 10)));
  const level = score >= 58 ? 'positive' : score <= 42 ? 'negative' : 'neutral';

  return { score, level, comparative: Math.round(comparative * 100) / 100, matchedWords: totalHits };
}

module.exports = { analyzeSentiment, LEXICON, PHRASES };
