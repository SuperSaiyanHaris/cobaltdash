// Moderation for profile comments and commenter handles (api/comments.js).
// Pure word and pattern rules, no paid services. Anything subtler is caught
// by user reports and the owner's daily look at the To review list in /admin.

import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';

const matcher = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });

export const MAX_COMMENT = 500;
export const MIN_COMMENT = 2;

// What the person sees for each rejection. Written for them, not for us.
export const MESSAGES = {
  length: `Comments are ${MIN_COMMENT} to ${MAX_COMMENT} characters.`,
  links: "Links, emails and phone numbers can't be posted.",
  self_harm: "This can't be posted. If you're going through something, you can call or text 988 (US) any time.",
  duplicate: 'You already posted that.',
};

export const swearingMessage = (words) => `Try that without "${words[0]}".`;

// "f.u.c.k", "f u c k", "f-u-c-k": join runs of single characters split by
// dots, spaces, dashes or stars so the word filter sees the word.
export function collapseSpaced(text) {
  return text.replace(/\b(?:[a-z0-9@$!][\s.\-_*]+){2,}[a-z0-9@$!]\b/gi, (run) => run.replace(/[\s.\-_*]+/g, ''));
}

// Spellings the word list does not know. Each token is lower-cased, de-leeted
// and has repeated letters squeezed ("f@akn" -> "fakn") before the lookup.
const EXTRA_BLOCKED = new Set(['fkn', 'fkin', 'fking', 'fakn', 'fukn', 'fuking', 'fcking', 'fckn', 'fcken', 'fuk', 'fuq', 'phuck', 'sht', 'shyt', 'btch', 'biatch']);
const LEET = { '@': 'a', '$': 's', '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '!': 'i' };
export function extraBlocked(text) {
  const found = [];
  for (const raw of String(text).toLowerCase().split(/[^a-z0-9@$!]+/)) {
    if (!raw) continue;
    const squeezed = raw.replace(/[@$01345!]/g, (c) => LEET[c]).replace(/(.)\1+/g, (m, c) => c);
    if (EXTRA_BLOCKED.has(squeezed)) found.push(raw);
  }
  return found;
}

export function profanityIn(text) {
  const words = new Set(extraBlocked(text));
  for (const t of [text, collapseSpaced(text)]) {
    for (const m of matcher.getAllMatches(t)) {
      const word = englishDataset.getPayloadWithPhraseMetadata(m).phraseMetadata?.originalWord;
      if (word) words.add(word);
    }
  }
  return [...words];
}

const URL_RE = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|net|org|io|gg|tv|ly|xyz|app|link|info|biz|ru)\b(\/\S*)?/i;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
// 10+ digits with the usual separators. Counts like "100,000,000" are digit
// groups of three with commas only, so they don't match.
const PHONE_RE = /(\+?\d[\s().-]?){3}\d{3}[\s.-]?\d{4}\b/;

// Directed self-harm phrases. The classifier covers the rest; this catches
// the common ones instantly even if the classifier is down.
const SELF_HARM_RE = /\b(k\s*y\s*s|kill\s*(your|ur|you)\s*sel(f|ves)|go\s+(die|unalive)|unalive\s*(your|ur)\s*sel(f|ves)|end\s*(your|ur)\s*(life|sel(f|ves))|hang\s*(your|ur)\s*sel(f|ves))\b/i;

/**
 * Local checks for a comment body. Returns null when it passes, or
 * { reason, message, words? } when it can't be posted.
 */
export function localCheck(body) {
  const text = String(body ?? '').trim();
  if (text.length < MIN_COMMENT || text.length > MAX_COMMENT) return { reason: 'length', message: MESSAGES.length };
  const phoneCandidate = text.replace(/\d{1,3}(,\d{3})+/g, '');
  if (URL_RE.test(text) || EMAIL_RE.test(text) || PHONE_RE.test(phoneCandidate)) return { reason: 'links', message: MESSAGES.links };
  if (SELF_HARM_RE.test(text) || SELF_HARM_RE.test(collapseSpaced(text))) return { reason: 'self_harm', message: MESSAGES.self_harm };
  const words = profanityIn(text);
  if (words.length) return { reason: 'swearing', message: swearingMessage(words), words };
  return null;
}

const RESERVED = /^(admin|administrator|mod|moderator|shinypull|shiny_pull|support|official|staff|system|null|undefined|anonymous|deleted)$/;

/** Handle rules: 3 to 20 of a-z 0-9 _ . and nothing rude. Official-looking
 * names (shinypull, admin...) are reserved for admin accounts. */
export function handleProblem(raw, { allowReserved = false } = {}) {
  const h = String(raw ?? '').trim().toLowerCase();
  if (!/^[a-z0-9_.]{3,20}$/.test(h)) return 'Use 3 to 20 letters, numbers, dots or underscores.';
  if (/^[._]|[._]$|[._]{2}/.test(h)) return "Dots and underscores can't start, end or repeat.";
  if (!allowReserved && RESERVED.test(h.replace(/[._]/g, ''))) return "That name isn't available.";
  if (profanityIn(h.replace(/[._]/g, ' ')).length || profanityIn(h.replace(/[._]/g, '')).length) return "That name isn't available.";
  return null;
}
