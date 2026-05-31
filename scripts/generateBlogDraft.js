import { config } from 'dotenv';
config();

import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import Parser from 'rss-parser';

// --- Config ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const gemini = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: { temperature: 0.7 },
});

// Helper: call Gemini and return plain text response
async function geminiGenerate(prompt, maxOutputTokens = 2048) {
  const result = await gemini.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens, temperature: 0.7 },
  });
  return result.response.text().trim();
}

// Current date injected into all agent prompts so the model knows what year it is
// and doesn't reason as if it's still in its training window.
const TODAY = new Date().toLocaleDateString('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric', month: 'long', day: 'numeric',
}); // e.g. "May 2, 2026"
const THIS_YEAR = new Date().getFullYear();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL || 'shinypull@proton.me';
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
const REVIEW_SCORE_THRESHOLD = 7;

// --- RSS Feeds ---
const RSS_FEEDS = [
  // Creator economy & platform news
  { url: 'https://www.tubefilter.com/feed/', name: 'TubeFilter' },
  { url: 'https://www.theverge.com/rss/creators/index.xml', name: 'The Verge (Creators)' },
  { url: 'https://www.theverge.com/rss/streaming/index.xml', name: 'The Verge (Streaming)' },
  { url: 'https://digiday.com/feed/', name: 'Digiday' },
  { url: 'https://streamersquare.com/feed/', name: 'StreamerSquare' },
  // Gaming, streaming drama & culture
  { url: 'https://www.dexerto.com/feed/', name: 'Dexerto' },
  { url: 'https://dotesports.com/feed', name: 'Dot Esports' },
  { url: 'https://www.kotaku.com/rss', name: 'Kotaku' },
  // Industry / broader creator business
  { url: 'https://influencermarketinghub.com/feed/', name: 'Influencer Marketing Hub' },
  { url: 'https://www.socialmediaexaminer.com/feed/', name: 'Social Media Examiner' },
  // Platform-official
  { url: 'https://blog.youtube/rss/', name: 'YouTube Official Blog' },
  { url: 'https://deadline.com/feed/', name: 'Deadline' },
];

// ---------------------------------------------------------------------------
// Forbidden Title Patterns
// Any generated title matching these gets sent to the refinement agent.
// These formulas make the blog look like a content farm.
// ---------------------------------------------------------------------------
const FORBIDDEN_TITLE_PATTERNS = [
  { re: /what creators (need|must|should) (to )?know/i,              label: 'lazy-what-creators-know' },
  { re: /what (it|this) means for creators/i,                         label: 'lazy-what-it-means' },
  { re: /changes? the game/i,                                          label: 'cliche-changes-game' },
  { re: /^(\d+)\s+(tips?|ways?|steps?|reasons?|things?|lessons?|mistakes?|secrets?|tricks?)/i, label: 'numbered-listicle' },
  { re: /: a (guide|warning|lesson|playbook|wake.?up call|primer|breakdown) for creators/i,     label: 'subtitle-for-creators' },
  { re: /everything (you|creators) (need|should|must) (to )?know/i,  label: 'everything-you-need' },
  { re: /the (ultimate|complete|definitive|comprehensive) (guide|breakdown|playbook)/i,          label: 'ultimate-guide' },
  { re: /for creators in \d{4}$/i,                                     label: 'year-trailing-suffix' },
  { re: /why (every|all) creator(s)? (should|must|need)/i,            label: 'generic-every-creator' },
];

function titlePassesFilter(title) {
  const violations = FORBIDDEN_TITLE_PATTERNS.filter(f => f.re.test(title));
  return { passes: violations.length === 0, violations: violations.map(f => f.label) };
}

// --- Helpers ---
function safeParseJSON(text, fallback = null) {
  let cleaned = text.trim();
  // Strip markdown code fences if the model wrapped output despite instructions
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // If JSON is truncated (common when max_tokens is hit), try to extract
    // just the fields we need via regex before giving up.
    if (fallback !== null) {
      console.warn(`⚠️  JSON parse failed (${e.message}) — using fallback`);
      return fallback;
    }
    throw e;
  }
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
    .substring(0, 60);
}

// Hard strip em dashes from content — never trust the AI to catch these.
// Runs after every write/rewrite step before anything gets saved.
// " — " (spaced) → ", "  |  "—" (bare) → "-"
// Also covers HTML entities and Unicode variants.
function stripEmDashes(text) {
  return text
    .replace(/\s*—\s*/g, (match) => match.trim() === '—' ? '-' : ', ')
    .replace(/&mdash;/gi, ', ')
    .replace(/&#8212;/g, ', ')
    .replace(/&#x2014;/gi, ', ');
}

function estimateReadTime(content) {
  const words = content.split(/\s+/).length;
  const minutes = Math.ceil(words / 200);
  return `${minutes} min read`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Category → chart palette (matches src/lib/blogTheme.js) ---
// Keep in sync with the renderer so charts match the post accent.
const CATEGORY_CHART_PALETTE = {
  'Industry News':     'amber',
  'Platform Updates':  'sky',
  'Twitch Trends':     'purple',
  'YouTube News':      'red',
  'Creator Economy':   'emerald',
  'Creator Spotlight': 'pink',
  'Tips & Strategy':   'indigo',
  'Growth Tips':       'indigo',
  'Industry Insights': 'cyan',
  'Streaming Gear':    'orange',
  'Tutorials':         'green',
  'Analytics':         'blue',
  'Rankings':          'yellow',
};

// --- Hero image pool by category (Pexels + Unsplash, no API key needed) ---
// Each post gets a deterministic pick from its category's pool based on slug hash
// so the same draft always lands on the same image (and posts within a category vary).
const HERO_IMAGES = {
  'Industry News': [
    'https://images.pexels.com/photos/8438916/pexels-photo-8438916.jpeg?auto=compress&cs=tinysrgb&w=1600',
    'https://images.pexels.com/photos/3944405/pexels-photo-3944405.jpeg?auto=compress&cs=tinysrgb&w=1600',
    'https://images.pexels.com/photos/3585047/pexels-photo-3585047.jpeg?auto=compress&cs=tinysrgb&w=1600',
    'https://images.pexels.com/photos/3568520/pexels-photo-3568520.jpeg?auto=compress&cs=tinysrgb&w=1600',
  ],
  'Platform Updates': [
    'https://images.pexels.com/photos/16773548/pexels-photo-16773548.jpeg?auto=compress&cs=tinysrgb&w=1600',
    'https://images.pexels.com/photos/4974915/pexels-photo-4974915.jpeg?auto=compress&cs=tinysrgb&w=1600',
    'https://images.pexels.com/photos/267350/pexels-photo-267350.jpeg?auto=compress&cs=tinysrgb&w=1600',
    'https://images.pexels.com/photos/1591056/pexels-photo-1591056.jpeg?auto=compress&cs=tinysrgb&w=1600',
  ],
  'Twitch Trends': [
    'https://images.pexels.com/photos/3165335/pexels-photo-3165335.jpeg?auto=compress&cs=tinysrgb&w=1600',
    'https://images.pexels.com/photos/2007647/pexels-photo-2007647.jpeg?auto=compress&cs=tinysrgb&w=1600',
    'https://images.pexels.com/photos/3165334/pexels-photo-3165334.jpeg?auto=compress&cs=tinysrgb&w=1600',
    'https://images.pexels.com/photos/7915437/pexels-photo-7915437.jpeg?auto=compress&cs=tinysrgb&w=1600',
  ],
  'YouTube News': [
    'https://images.pexels.com/photos/3945313/pexels-photo-3945313.jpeg?auto=compress&cs=tinysrgb&w=1600',
    'https://images.pexels.com/photos/2510428/pexels-photo-2510428.jpeg?auto=compress&cs=tinysrgb&w=1600',
    'https://images.pexels.com/photos/4974914/pexels-photo-4974914.jpeg?auto=compress&cs=tinysrgb&w=1600',
  ],
  'Creator Economy': [
    'https://images.pexels.com/photos/9830817/pexels-photo-9830817.jpeg?auto=compress&cs=tinysrgb&w=1600',
    'https://images.pexels.com/photos/4968630/pexels-photo-4968630.jpeg?auto=compress&cs=tinysrgb&w=1600',
    'https://images.pexels.com/photos/210600/pexels-photo-210600.jpeg?auto=compress&cs=tinysrgb&w=1600',
    'https://images.pexels.com/photos/4348404/pexels-photo-4348404.jpeg?auto=compress&cs=tinysrgb&w=1600',
  ],
  'Creator Spotlight': [
    'https://images.pexels.com/photos/187041/pexels-photo-187041.jpeg?auto=compress&cs=tinysrgb&w=1600',
    'https://images.pexels.com/photos/2747449/pexels-photo-2747449.jpeg?auto=compress&cs=tinysrgb&w=1600',
    'https://images.pexels.com/photos/3756879/pexels-photo-3756879.jpeg?auto=compress&cs=tinysrgb&w=1600',
  ],
  'Tips & Strategy': [
    'https://images.pexels.com/photos/3184325/pexels-photo-3184325.jpeg?auto=compress&cs=tinysrgb&w=1600',
    'https://images.pexels.com/photos/3194519/pexels-photo-3194519.jpeg?auto=compress&cs=tinysrgb&w=1600',
    'https://images.pexels.com/photos/3178818/pexels-photo-3178818.jpeg?auto=compress&cs=tinysrgb&w=1600',
  ],
  'Growth Tips': [
    'https://images.pexels.com/photos/3184325/pexels-photo-3184325.jpeg?auto=compress&cs=tinysrgb&w=1600',
    'https://images.pexels.com/photos/186461/pexels-photo-186461.jpeg?auto=compress&cs=tinysrgb&w=1600',
  ],
  'Industry Insights': [
    'https://images.pexels.com/photos/669610/pexels-photo-669610.jpeg?auto=compress&cs=tinysrgb&w=1600',
    'https://images.pexels.com/photos/590016/pexels-photo-590016.jpeg?auto=compress&cs=tinysrgb&w=1600',
  ],
  'Streaming Gear': [
    'https://images.pexels.com/photos/3779662/pexels-photo-3779662.jpeg?auto=compress&cs=tinysrgb&w=1600',
    'https://images.pexels.com/photos/164938/pexels-photo-164938.jpeg?auto=compress&cs=tinysrgb&w=1600',
    'https://images.pexels.com/photos/144429/pexels-photo-144429.jpeg?auto=compress&cs=tinysrgb&w=1600',
  ],
  'Tutorials': [
    'https://images.pexels.com/photos/4144923/pexels-photo-4144923.jpeg?auto=compress&cs=tinysrgb&w=1600',
    'https://images.pexels.com/photos/4348401/pexels-photo-4348401.jpeg?auto=compress&cs=tinysrgb&w=1600',
  ],
  'Analytics': [
    'https://images.pexels.com/photos/669610/pexels-photo-669610.jpeg?auto=compress&cs=tinysrgb&w=1600',
    'https://images.pexels.com/photos/186461/pexels-photo-186461.jpeg?auto=compress&cs=tinysrgb&w=1600',
  ],
  'Rankings': [
    'https://images.pexels.com/photos/207983/pexels-photo-207983.jpeg?auto=compress&cs=tinysrgb&w=1600',
  ],
};

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function pickHeroImageFallback(category, slug) {
  const pool = HERO_IMAGES[category] || HERO_IMAGES['Industry News'];
  return pool[hashString(slug || '') % pool.length];
}

// Fetch a topic-relevant image from Pexels using the post title as the search query.
// Falls back to the static category pool if no API key is set or the search fails.
async function pickHeroImage(title, category, slug) {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    console.log('ℹ️  No PEXELS_API_KEY — using static image pool');
    return pickHeroImageFallback(category, slug);
  }

  // Build a clean search query from the title: strip punctuation, take first 5 words
  const query = title
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 5)
    .join(' ');

  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=10&orientation=landscape`,
      { headers: { Authorization: apiKey }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) throw new Error(`Pexels API ${res.status}`);
    const data = await res.json();
    const photos = data.photos || [];
    if (photos.length === 0) throw new Error('No results');

    // Pick deterministically so the same slug always gets the same image
    const photo = photos[hashString(slug || '') % photos.length];
    const url = photo.src.large2x || photo.src.large || photo.src.original;
    console.log(`🖼️  Hero image: "${photo.alt || query}" (Pexels ID ${photo.id})`);
    return url;
  } catch (err) {
    console.warn(`⚠️  Pexels search failed (${err.message}) — falling back to static pool`);
    return pickHeroImageFallback(category, slug);
  }
}

// --- Structural archetypes ---
// Each draft randomly picks one. Forces variety in opening + body shape so
// every post doesn't follow the same skeleton.
const ARCHETYPES = [
  {
    name: 'data-deep-dive',
    fitsPostType: ['data-driven', 'analysis'],
    opening: 'Open with a single punchy 2-3 sentence hook paragraph that frames the most surprising stat. The hook MUST land before the {{stats}} block.',
    structure: 'After the hook, drop a {{stats}} strip with 3 key numbers. Then 4-5 H2 sections that unpack the data. Use a {{callout:stat}} mid-post for the headline number.',
    requiredCallouts: ['stat', 'insight'],
  },
  {
    name: 'narrative-explainer',
    fitsPostType: ['analysis', 'news', 'drama'],
    opening: 'Open with a vivid scene-setting paragraph. Tell a tiny story (real moment, person, or beat) in 3-5 sentences. No stats in the opening.',
    structure: 'Use 4 H2 sections that walk the reader through cause → context → consequence → takeaway. Drop a {{tldr}} block right after the intro with 3 bullet points. Use one {{callout:insight}} mid-post.',
    requiredCallouts: ['insight'],
    tldrRequired: true,
  },
  {
    name: 'news-breakdown',
    fitsPostType: ['news', 'analysis'],
    opening: 'Open with a {{tldr}} block FIRST (before any prose) summarizing what changed in 3 short bullets. Then a single 2-3 sentence intro paragraph explaining why it matters.',
    structure: '3-4 H2 sections covering: what is it, why it matters, who it affects, what to do. Use one {{callout:update}} for the official platform announcement detail.',
    requiredCallouts: ['update'],
    tldrFirst: true,
  },
  {
    name: 'hot-take',
    fitsPostType: ['drama', 'analysis'],
    opening: 'Open with a one-sentence opinion as a single short paragraph. Be direct. No hedging.',
    structure: '3-4 H2 sections that defend the take with concrete examples. Include one strong > blockquote with the central claim. Use one {{callout:tip}} or {{callout:warning}} near the end.',
    requiredCallouts: ['tip'],
  },
  {
    name: 'creator-spotlight',
    fitsPostType: ['drama', 'analysis', 'news'],
    opening: 'Open by naming the creator and the moment in 2-3 sentences. Make it feel like the start of a profile, not a press release.',
    structure: '4 H2 sections: the moment, the backstory, the numbers, what it means for other creators. Use a {{stats}} strip with 3 key numbers from this creator. Use one {{callout:insight}}.',
    requiredCallouts: ['insight'],
  },
  {
    name: 'myth-busting',
    fitsPostType: ['analysis', 'data-driven'],
    opening: 'Open with a single sentence stating the wrong belief most creators hold about this topic. Follow immediately with the counter-claim. No setup, no preamble.',
    structure: '4 H2 sections: name the myth and trace its origin, show the data that contradicts it, explain why the myth persists, what the reality means practically. One {{callout:insight}} for the key correction. One > blockquote with the most counterintuitive stat.',
    requiredCallouts: ['insight'],
  },
  {
    name: 'reported-story',
    fitsPostType: ['news', 'drama', 'analysis'],
    opening: 'Open with a tight journalist lede: who did what, when, and why it matters. Exactly 2-3 sentences. No rhetorical questions, no "Here\'s...".',
    structure: '4-5 H2 sections in inverted pyramid: main development, context/backstory, reactions and implications, what happens next. {{tldr}} block right after the intro. One {{callout:update}} for a key quote or stat.',
    requiredCallouts: ['update'],
    tldrRequired: true,
  },
  {
    name: 'counter-narrative',
    fitsPostType: ['analysis', 'drama'],
    opening: 'Open by restating the dominant take on this topic in 1-2 sentences, then immediately follow with the opposing interpretation. No hedging.',
    structure: '3-4 H2 sections building the counter case with evidence. One strong > blockquote for the most compelling counter-evidence. End with what changes if the counter-narrative is right. One {{callout:insight}}.',
    requiredCallouts: ['insight'],
  },
  {
    name: 'platform-comparison',
    fitsPostType: ['data-driven', 'analysis'],
    opening: 'Open with a single sentence that names both sides being compared and the core tension between them. Then 1-2 sentences on why the comparison matters right now.',
    structure: '3 H2 sections — one per platform/option being compared, each with the same sub-structure (what it offers, the catch, the numbers). Then a final "Verdict" H2 that picks a winner or declares a draw with a clear reason. The markdown comparison table is MANDATORY. Use one {{callout:stat}} for the most decisive number.',
    requiredCallouts: ['stat'],
  },
  {
    name: 'money-breakdown',
    fitsPostType: ['data-driven', 'analysis', 'news'],
    opening: 'Open with the dollar figure or revenue number that frames the whole story. One sentence. Then 2-3 sentences of context — where that money comes from and who gets it.',
    structure: '4 H2 sections that follow the money: what the total opportunity is, how the split actually works (platform vs creator), which creators are positioned to win, and what changes if the model shifts. {{stats}} strip with 3 dollar/percentage figures is MANDATORY. One {{callout:insight}} for the key structural insight about where the leverage is.',
    requiredCallouts: ['insight'],
  },
  {
    name: 'timeline-story',
    fitsPostType: ['analysis', 'news', 'data-driven'],
    opening: 'Open with where things stand TODAY in 2-3 sentences. Then immediately zoom out with one sentence framing how different things looked 12-24 months ago.',
    structure: '4 H2 sections ordered chronologically: where it started, the turning point, where it is now, where it is going. A line chart showing the progression is MANDATORY if the data supports it — embed it where the trend becomes clear. One {{callout:insight}} for the single most significant inflection point.',
    requiredCallouts: ['insight'],
  },
  {
    name: 'creator-qa',
    fitsPostType: ['news', 'analysis'],
    opening: 'Open with 1-2 sentences framing why creators are confused or asking questions about this topic right now. No scene-setting, no stats — just the context for why the Q&A format makes sense.',
    structure: 'The body is structured as 5 H2 sections, each phrased as a direct question a creator would actually ask ("Does this affect small channels?" "How much can I actually earn?" "Do I need to do anything right now?"). Each answer is 2-4 sentences max — direct, no fluff, no restating the question. One {{callout:tip}} for the most actionable answer. End with a short "Bottom line" paragraph, not another question.',
    requiredCallouts: ['tip'],
  },
];

function pickArchetype(postType, recentArchetypeNames = []) {
  const candidates = ARCHETYPES.filter(a => a.fitsPostType.includes(postType));
  const pool = candidates.length > 0 ? candidates : ARCHETYPES;
  // Avoid the last 2 archetypes used — enforces structural rotation
  const recentSet = new Set(recentArchetypeNames.slice(0, 2));
  const preferred = pool.filter(a => !recentSet.has(a.name));
  const finalPool = preferred.length > 0 ? preferred : pool;
  return finalPool[Math.floor(Math.random() * finalPool.length)];
}

// Retry wrapper for Gemini API calls — handles 429 (quota), 503/502 (transient) errors.
async function callWithRetry(fn, retries = 6) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = err.status || err.httpStatusCode || 0;
      const msg = (err.message || '').toLowerCase();
      const isRetryable = status === 429 || status === 503 || status === 502
        || msg.includes('rate limit') || msg.includes('quota') || msg.includes('overload');
      if (isRetryable && attempt < retries) {
        const delaySec = 30 * attempt; // 30s, 60s, 90s, 120s, 150s
        console.warn(`⚠️  API ${status || 'error'} (attempt ${attempt}/${retries}), retrying in ${delaySec}s...`);
        await sleep(delaySec * 1000);
        continue;
      }
      throw err;
    }
  }
}

// --- RSS Fetching ---
async function fetchArticles() {
  const parser = new Parser({ timeout: 10000 });
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const articles = [];

  for (const feed of RSS_FEEDS) {
    try {
      const parsed = await parser.parseURL(feed.url);
      for (const item of (parsed.items || []).slice(0, 20)) {
        const pubDate = item.pubDate ? new Date(item.pubDate).getTime() : Date.now();
        if (pubDate > sevenDaysAgo) {
          articles.push({
            title: item.title || '',
            description: (item.contentSnippet || item.summary || '').substring(0, 800),
            url: item.link || '',
            source: feed.name,
            pubDate: item.pubDate || '',
          });
        }
      }
    } catch (err) {
      console.warn(`⚠️  Failed to fetch ${feed.name}: ${err.message}`);
    }
  }

  console.log(`📰 Fetched ${articles.length} articles from ${RSS_FEEDS.length} feeds`);
  return articles;
}

// --- Load all post data for full deduplication and context ---
// Returns all-time titles (dedup), recent titles (strong exclusion),
// category distribution (balance), and recent slugs (archetype rotation).
async function fetchAllPostData() {
  const { data } = await supabase
    .from('blog_posts')
    .select('title, category, published_at, slug')
    .order('published_at', { ascending: false })
    .limit(200);

  const posts = data || [];
  const allTitles = posts.map(p => p.title);

  // Which categories are over-represented (> 20% of total)
  const counts = {};
  posts.forEach(p => { counts[p.category] = (counts[p.category] || 0) + 1; });
  const total = posts.length || 1;
  const saturatedCategories = Object.entries(counts)
    .filter(([, n]) => n / total > 0.20)
    .map(([cat]) => cat);

  // Last 5 slugs — used to infer archetype rotation
  const recentSlugs = posts.slice(0, 5).map(p => p.slug);

  // Last 5 categories in order — used to detect and break category streaks
  const recentCategories = posts.slice(0, 5).map(p => p.category);

  // Last 30 days — strongest exclusion zone
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const recentTitles = posts.filter(p => p.published_at >= cutoff).map(p => p.title);

  return { allTitles, recentTitles, saturatedCategories, recentSlugs, recentCategories };
}

// --- Research Agent ---
async function researchAgent(articles, postData) {
  const { allTitles, recentTitles, saturatedCategories, recentCategories } = postData;
  console.log('🔍 Research Agent: selecting best topic...');
  console.log(`   Deduplicating against ${allTitles.length} all-time titles, ${recentTitles.length} recent`);
  if (recentCategories.length > 0) {
    console.log(`   Recent category streak: ${recentCategories.slice(0, 3).join(' → ')}`);
  }

  const articleList = articles
    .map((a, i) => `${i + 1}. [${a.source}] ${a.title}\n   ${a.description}`)
    .join('\n\n');

  // Pass all-time titles capped at 60 to keep prompt size manageable
  const allTitleBlock = allTitles.length > 0
    ? `\nALL-TIME PUBLISHED TITLES — topic-level exclusion zone. If an article involves the SAME person, company, platform event, or story as any title below, SKIP IT — even if the angle or wording is different. "Jonah Peretti BuzzFeed post-mortem" and "Jonah Peretti explains BuzzFeed sale" are the same topic. Same creator + same controversy = duplicate. Same platform feature + same time period = duplicate:\n${allTitles.slice(0, 60).map(t => `- ${t}`).join('\n')}\n`
    : '';

  const recentBlock = recentTitles.length > 0
    ? `\nRECENT (last 30 days) — strongest exclusion. Any article about the same person, company, or event as these titles is off-limits:\n${recentTitles.map(t => `- ${t}`).join('\n')}\n`
    : '';

  // STRICT category rotation: every new post MUST be a different category from
  // the previous post AND must avoid any category used in the last 3 posts.
  // Past leniency (warn-at-2, block-at-3) let the model run 7 Industry News
  // posts in a row in May 2026. No more.
  const ALL_CATEGORIES = [
    'Creator Economy', 'Industry News', 'Platform Updates', 'Analytics',
    'Tips & Strategy', 'Growth Tips', 'Industry Insights', 'Streaming Gear',
    'Tutorials', 'YouTube News', 'Twitch Trends', 'Creator Spotlight', 'Rankings',
  ];
  const forbiddenCategories = [...new Set(recentCategories.slice(0, 3))]; // last 3 posts' categories
  const allowedCategories = ALL_CATEGORIES.filter(c => !forbiddenCategories.includes(c));
  // Prioritize categories that haven't been used in the last 7 posts at all
  const lastSeven = new Set(recentCategories.slice(0, 7));
  const freshCategories = allowedCategories.filter(c => !lastSeven.has(c));
  const priorityList = freshCategories.length > 0 ? freshCategories : allowedCategories;

  const categoryHint = [
    saturatedCategories.length > 0
      ? `OVER-REPRESENTED all-time (>20% of total posts — deprioritize): ${saturatedCategories.join(', ')}`
      : '',
    forbiddenCategories.length > 0
      ? `STRICTLY FORBIDDEN — the last ${forbiddenCategories.length} posts already used these. Picking one will be auto-rejected: ${forbiddenCategories.join(', ')}`
      : '',
    `ALLOWED categories (pick exactly one for "suggestedCategory"): ${allowedCategories.join(', ')}`,
    freshCategories.length > 0
      ? `STRONGLY PREFERRED — these haven't appeared in the last 7 posts and we want variety: ${freshCategories.join(', ')}`
      : '',
    `If no article in the list fits any allowed category, you may bend an angle to fit. Do NOT pick a forbidden category.`,
  ].filter(Boolean).join('\n');

  const categoryBlock = `\n${categoryHint}\n`;

  // Extract proper nouns from all titles as an entity-level exclusion signal
  const entityBlacklist = [...new Set(
    allTitles.flatMap(t =>
      (t.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*|YouTube|TikTok|Twitch|Kick|Instagram|Netflix|Meta|Spotify|Bluesky|Mastodon|Rumble|MrBeast|BuzzFeed)\b/g) || [])
    )
  )].slice(0, 80);

  // Build a hard "recent topics" blocklist from the last 10 posts. Any selected
  // article that overlaps in subject matter with these is auto-rejected by the
  // model. This prevents back-to-back posts about "AI vs creators," "NYT vs AI,"
  // etc. that we saw in late May 2026.
  const recentTopicTitles = (allTitles.slice(0, 10) || []);
  const entityBlock = entityBlacklist.length > 0
    ? `\nKEY ENTITIES already covered (people, companies, platforms, products). If a new article is primarily ABOUT one of these AND the subject overlaps with any of the last 10 posts, SKIP IT. We need genuinely new subject matter:\n${entityBlacklist.join(', ')}\n\nHARD subject-overlap block — if the article shares the same core subject (e.g. "AI and journalism", "X platform's algorithm change", "Y creator's controversy") as any of these recent posts, you must skip it and pick a different article:\n${recentTopicTitles.map(t => `- ${t}`).join('\n')}\n`
    : '';

  const text = await callWithRetry(() => geminiGenerate(`You are a research editor for ShinyPull, a creator analytics platform tracking YouTube, TikTok, Twitch, Kick, Bluesky, Mastodon, Rumble, Substack, and Music stats.

Today's date: ${TODAY}. All articles below are from this week. Write as if you know it is ${THIS_YEAR}.

Our audience: streamers, YouTubers, TikTokers, aspiring creators, and people into creator economy data and analytics.
${allTitleBlock}
${recentBlock}
${entityBlock}
${categoryBlock}
MANDATORY: The "suggestedTitle" must NOT match any of these lazy formulas:
- "[X]: What Creators Need/Must Know"
- "[X]: What It/This Means for Creators"
- "X Changes the Game"
- "N Tips/Ways/Steps/Reasons..."
- "[X]: A Guide/Warning/Lesson/Playbook for Creators"
- "Everything Creators Need to Know About X"
- "The Ultimate/Complete Guide to X"
Good titles: specific to THIS story, use a strong verb, state something counterintuitive, or name the company/creator + what they did.

From the articles below, select the SINGLE most interesting and relevant topic. Prioritize recency. Cover varied topic types:
- Platform policy or algorithm changes affecting creators
- Monetization and creator economy shifts
- Creator drama, controversies, or community moments with broader lessons
- Streaming and creator industry trends
- Platform feature launches (YouTube, TikTok, Twitch, Kick, Mastodon, Rumble, Substack)
- Creator growth, analytics, or business strategy
- Viral moments that reveal something about the platform or creator business

Avoid: celebrity gossip unrelated to creator economy, movies/TV unrelated to streaming, politics, general business news with no creator angle.

Articles:
${articleList}

Respond with ONLY valid JSON (no markdown fences, no explanation):
{
  "selectedTitle": "exact title of chosen article",
  "source": "publication name",
  "angle": "what unique angle to take for our creator-focused audience (1-2 sentences)",
  "keyFacts": ["fact 1", "fact 2", "fact 3"],
  "suggestedTitle": "specific, fresh title under 70 chars — must NOT match any forbidden formula above",
  "suggestedCategory": "MUST be one of these ALLOWED categories — picking anything else will be auto-rejected: ${allowedCategories.join(', ')}"
}`, 4096));

  const research = safeParseJSON(text, {
    selectedTitle: articles[0]?.title || 'Unknown',
    source: articles[0]?.source || 'Unknown',
    angle: 'General creator economy news',
    keyFacts: [],
    suggestedTitle: articles[0]?.title?.substring(0, 70) || 'Creator News',
    suggestedCategory: allowedCategories[0] || 'Creator Economy',
  });

  // ENFORCE category rotation. If the model ignored the constraint and picked a
  // forbidden category, reassign to the highest-priority allowed one. This is
  // the last line of defense — without it Gemini will gravitate to "Industry
  // News" because most RSS articles fit there.
  if (forbiddenCategories.includes(research.suggestedCategory)) {
    const fallback = priorityList[0] || allowedCategories[0] || 'Creator Economy';
    console.log(`⚠️  Model picked forbidden category "${research.suggestedCategory}". Overriding → "${fallback}"`);
    research.suggestedCategory = fallback;
  }

  console.log(`✅ Research: "${research.suggestedTitle}" [${research.suggestedCategory}]`);
  return research;
}

// --- Title Refinement Agent ---
// If the Research Agent produced a lazy/formulaic title, generate 5 alternatives
// and pick the best one that passes the filter.
async function refineTitleIfNeeded(research, allTitles) {
  const { passes, violations } = titlePassesFilter(research.suggestedTitle);
  if (passes) return research;

  console.log(`⚠️  Title matches forbidden pattern (${violations.join(', ')}) — refining...`);

  const raw = await callWithRetry(() => geminiGenerate(`The blog post title "${research.suggestedTitle}" is too formulaic and was rejected.

Topic angle: ${research.angle}
Source article: ${research.selectedTitle}

BANNED formulas (the original title violated one):
- "[X]: What Creators Need/Must Know"
- "[X]: What It/This Means for Creators"
- "X Changes the Game" or "game-changer"
- "N Tips/Ways/Steps/Reasons..."
- ": A Guide/Warning/Lesson/Playbook for Creators"
- "Everything Creators Need to Know"
- "The Ultimate/Complete Guide"

Generate 5 replacement titles that:
1. Are under 70 characters
2. Are specific to THIS exact story, not generic
3. Sound like a human trade journalist wrote them
4. Use one of: strong verb showing what changed, counterintuitive claim, specific number from the story, [person/company] + what they did, a direct declarative about consequence
5. Match none of the banned formulas

Already-published titles to avoid duplicating style/angle:
${allTitles.slice(0, 20).map(t => `- ${t}`).join('\n')}

Return ONLY a valid JSON array of exactly 5 strings:
["Title 1", "Title 2", "Title 3", "Title 4", "Title 5"]`, 2048));

  try {
    const options = safeParseJSON(raw, null);
    if (Array.isArray(options) && options.length > 0) {
      const best = options.find(t => titlePassesFilter(t).passes) || options[0];
      console.log(`✅ Refined title: "${best}"`);
      return { ...research, suggestedTitle: best };
    }
  } catch {
    console.warn('⚠️  Title refinement JSON parse failed — keeping original');
  }
  return research;
}

// --- URL Validator ---
// Checks each URL the Enrichment Agent produced. Removes any that 404 or error
// so the Writer never receives a broken link to embed in the post.
async function validateEnrichmentUrls(enrichment) {
  // Collect all unique URLs from stats, caseStudy, and links
  const allUrls = new Set();
  enrichment.stats.forEach((s) => s.url && allUrls.add(s.url));
  if (enrichment.caseStudy.applicable && enrichment.caseStudy.sourceUrl) {
    allUrls.add(enrichment.caseStudy.sourceUrl);
  }
  enrichment.links.forEach((l) => l.url && allUrls.add(l.url));

  if (allUrls.size === 0) return enrichment;

  // Check all URLs in parallel
  const results = await Promise.all(
    [...allUrls].map(async (url) => {
      try {
        const r = await fetch(url, {
          method: 'HEAD',
          redirect: 'follow',
          signal: AbortSignal.timeout(8000),
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ShinyPull/1.0)' },
        });
        return { url, ok: r.ok };
      } catch {
        return { url, ok: false };
      }
    })
  );

  const badUrls = new Set(results.filter((r) => !r.ok).map((r) => r.url));
  if (badUrls.size > 0) {
    console.warn(`⚠️  URL validation: removed ${badUrls.size} broken link(s): ${[...badUrls].join(', ')}`);
  } else {
    console.log('✅ URL validation: all enrichment links are live');
  }

  // Strip broken URLs from each section
  return {
    ...enrichment,
    stats: enrichment.stats.filter((s) => !badUrls.has(s.url)),
    caseStudy: enrichment.caseStudy.applicable && badUrls.has(enrichment.caseStudy.sourceUrl)
      ? { ...enrichment.caseStudy, sourceUrl: null }
      : enrichment.caseStudy,
    links: enrichment.links.filter((l) => !badUrls.has(l.url)),
  };
}

// --- Enrichment Agent ---
// Runs after topic selection, before writing. Surfaces real stats, tables,
// case studies, and source URLs so the writer can weave them into the first draft.
async function enrichmentAgent(research) {
  console.log('📊 Enrichment Agent: gathering stats, tables, and sources...');

  const enrichmentRaw = await callWithRetry(() => geminiGenerate(`You are a research enrichment specialist for ShinyPull, a creator analytics platform (YouTube, TikTok, Twitch, Kick, Bluesky, Mastodon, Rumble, Substack, and Music stats).

Today's date: ${TODAY}. The post being written is current — it reflects events happening now in ${THIS_YEAR}.

A blog post is about to be written on this topic:
Title: ${research.suggestedTitle}
Angle: ${research.angle}
Key facts from source article: ${research.keyFacts.join('; ')}

Your job: identify concrete supporting material that will make this post credible and visually engaging.

CRITICAL DATA FRESHNESS RULES:
- For time-sensitive metrics (quarterly earnings, annual revenue, monthly active users, market share), only include figures if you can state the specific year/quarter they cover. If your training data only has figures through mid-2025, say so explicitly in the "fact" field rather than presenting stale numbers as current. It is better to cite a clearly-dated historical stat ("YouTube Q1 2025 revenue was $X") than to silently present old data as if it is from ${THIS_YEAR}.
- Do NOT invent or estimate current figures you cannot verify. Leave a stat out rather than fabricate it.
- For evergreen stats (e.g. platform user counts, general industry benchmarks) that change slowly, include the figure with its known date so the writer can decide whether to cite it.

1. STATS: 3-5 specific statistics with real numbers (percentages, dollar amounts, user counts). Include the publication name and URL for each. Prefer well-known industry sources (Influencer Marketing Hub, Sprout Social, Later, Digiday, eMarketer, Pew Research, etc.). Always include the year the stat is from in the "fact" field.

2. TABLE: Is there a natural comparison table for this topic? (Tier comparisons, platform breakdowns, before/after, cost breakdowns, etc.) If yes, provide real data for 3-6 rows. If no clear table fits, set applicable to false.

3. CASE STUDY: Is there a specific real brand or creator story with concrete numbers that illustrates the core point? (e.g. "Daniel Wellington: $200/creator, $220M revenue by 2015"). If yes, include it with a source URL. If not, set applicable to false.

4. LINKS: 3-5 authoritative URLs to cite inline or link from relevant sentences.

5. POST TYPE: Classify as one of: "data-driven" (stats and tables are the backbone), "analysis" (stats help but narrative drives it), "news" (light data, mostly event coverage), "drama" (mostly story/narrative, minimal data needed).

6. CHART: Is there a set of 3-6 numbers that would be more impactful as a bar chart or line chart than as prose or a table? Examples: platform market share comparison, creator revenue by tier, subscriber growth over time, platform MAU over several years. If yes, provide the data. Use "bar" for comparisons, "line" for trends over time. If no clear chart fits OR a table already covers it better, set applicable to false. Do NOT include a colorScheme — the system picks one based on the post category.

7. STATS STRIP: A separate visual element that shows 3 standalone hero numbers across the top of the article (different from the chart, different from prose stats). Pick 3 numbers that, taken together, paint the scope of the topic in one glance. Each item: a short value (e.g. "38.7%", "2.7B", "$31.5B", "7.3M") and a 4-7 word label. If no 3 numbers really stand on their own this way, set applicable to false.

Respond with ONLY valid JSON (no markdown fences, no explanation):
{
  "stats": [
    { "fact": "statistic text with number", "source": "Publication Name", "url": "https://..." }
  ],
  "table": {
    "applicable": true,
    "caption": "what the table shows",
    "headers": ["Col 1", "Col 2", "Col 3"],
    "rows": [["val", "val", "val"], ["val", "val", "val"]]
  },
  "caseStudy": {
    "applicable": true,
    "brand": "Brand or creator name",
    "story": "2-3 sentences with specific numbers and outcome",
    "sourceUrl": "https://..."
  },
  "links": [
    { "label": "anchor text", "url": "https://..." }
  ],
  "postType": "data-driven",
  "chart": {
    "applicable": true,
    "type": "bar",
    "title": "Chart title (concise, under 50 chars)",
    "labels": ["Label 1", "Label 2", "Label 3"],
    "values": [100, 200, 150],
    "valueLabel": "What the numbers represent (e.g. Monthly active users, millions)"
  },
  "statsStrip": {
    "applicable": true,
    "items": [
      { "value": "38.7%", "label": "YouTube share of live watch time" },
      { "value": "2.7B", "label": "Monthly logged-in users" },
      { "value": "$31.5B", "label": "Ad revenue in 2023" }
    ]
  }
}`, 4096));

  try {
    const enrichment = safeParseJSON(enrichmentRaw);
    console.log(`✅ Enrichment: ${enrichment.postType} post, ${enrichment.stats.length} stats, table: ${enrichment.table.applicable}, chart: ${enrichment.chart?.applicable}, case study: ${enrichment.caseStudy.applicable}`);
    return enrichment;
  } catch {
    // If parsing fails, return a safe empty enrichment so the pipeline continues
    console.warn('⚠️  Enrichment Agent returned invalid JSON — continuing without enrichment');
    return { stats: [], table: { applicable: false }, caseStudy: { applicable: false }, links: [], postType: 'analysis' };
  }
}

// --- Chart URL Builder (QuickChart.io) ---
// Converts enrichment chart data to a QuickChart URL that the writer embeds as a markdown image.
// QuickChart renders Chart.js 2 charts server-side — no API key required.
// `paletteName` overrides the chart color so it matches the post category accent.
function buildChartUrl(chart, paletteName = 'indigo') {
  if (!chart?.applicable) return null;

  const palettes = {
    indigo:  { bg: 'rgba(99,102,241,0.85)',  border: 'rgba(99,102,241,1)' },
    purple:  { bg: 'rgba(168,85,247,0.85)',  border: 'rgba(168,85,247,1)' },
    emerald: { bg: 'rgba(52,211,153,0.85)',  border: 'rgba(52,211,153,1)' },
    amber:   { bg: 'rgba(251,191,36,0.85)',  border: 'rgba(251,191,36,1)' },
    sky:     { bg: 'rgba(56,189,248,0.85)',  border: 'rgba(56,189,248,1)' },
    pink:    { bg: 'rgba(244,114,182,0.85)', border: 'rgba(244,114,182,1)' },
    red:     { bg: 'rgba(248,113,113,0.85)', border: 'rgba(248,113,113,1)' },
    cyan:    { bg: 'rgba(34,211,238,0.85)',  border: 'rgba(34,211,238,1)' },
    orange:  { bg: 'rgba(251,146,60,0.85)',  border: 'rgba(251,146,60,1)' },
    green:   { bg: 'rgba(74,222,128,0.85)',  border: 'rgba(74,222,128,1)' },
    blue:    { bg: 'rgba(96,165,250,0.85)',  border: 'rgba(96,165,250,1)' },
    yellow:  { bg: 'rgba(250,204,21,0.85)',  border: 'rgba(250,204,21,1)' },
  };
  const palette = palettes[paletteName] || palettes.indigo;
  const isLine = chart.type === 'line';

  const config = {
    type: isLine ? 'line' : 'bar',
    data: {
      labels: chart.labels,
      datasets: [{
        label: chart.valueLabel || '',
        data: chart.values,
        backgroundColor: isLine ? palette.bg.replace('0.85', '0.2') : palette.bg,
        borderColor: palette.border,
        borderWidth: isLine ? 2 : 0,
        fill: isLine ? true : undefined,
        lineTension: isLine ? 0.4 : undefined,
        pointBackgroundColor: isLine ? palette.border : undefined,
        pointRadius: isLine ? 4 : undefined,
      }],
    },
    options: {
      title: {
        display: true,
        text: chart.title,
        fontColor: '#f3f4f6',
        fontSize: 14,
        fontStyle: 'bold',
        padding: 14,
      },
      legend: {
        display: !!(chart.valueLabel),
        labels: { fontColor: '#9ca3af', fontSize: 12 },
      },
      scales: {
        xAxes: [{ ticks: { fontColor: '#9ca3af', fontSize: 11 }, gridLines: { color: '#1f2937', zeroLineColor: '#374151' } }],
        yAxes: [{ ticks: { fontColor: '#9ca3af', fontSize: 11 }, gridLines: { color: '#1f2937', zeroLineColor: '#374151' } }],
      },
    },
  };

  const encoded = encodeURIComponent(JSON.stringify(config));
  return `https://quickchart.io/chart?c=${encoded}&w=700&h=360&backgroundColor=%23111827&devicePixelRatio=2`;
}

// --- Writer Agent ---
async function writerAgent(research, enrichment, creatorList = '', archetype = null, recentArchetypeNames = []) {
  const arch = archetype || pickArchetype(enrichment.postType || 'analysis', recentArchetypeNames);
  console.log(`✍️  Writer Agent: drafting post (archetype: ${arch.name})...`);

  const styleGuide = `MANDATORY writing style rules (violating these is a failure):
- Write conversationally, like a knowledgeable friend. Not corporate, not academic.
- NEVER use em dashes (—). Use commas, colons, or rewrite the sentence.
- NEVER start a sentence with "Here's [anything]" — not "Here's what", "Here's where", "Here's the thing", "Here's why", "Here's how", "Here's a breakdown", "Here's what it signals", "Here's the math". Rewrite as a direct statement instead.
- NEVER use "This isn't X. It's Y." or "isn't just X, it's Y" — rewrite as a direct positive statement.
- NEVER use these phrases: "seismic shift", "game-changer", "landscape" (as industry jargon), "paradigm", "in an era where", "in a world where", "the question isn't", "And that's exactly the point", "And that's precisely the point", "Let that sink in", "it's worth noting", "it bears mentioning", "importantly", "genuinely", "beautifully", "spectacularly", "borderline absurd", "sheer audacity"
- Short sentences. Fragments are fine. Contractions are good (it's, don't, that's, they're).
- Use casual language naturally: "basically", "pretty much", "kind of", "a ton of", "honestly", "nah"
- State opinions directly. No hedging with qualifiers.
- Vary sentence length — mix short punchy lines with longer explanations.`;

  const wordTarget = enrichment.postType === 'data-driven' ? '1000-1200' : '800-1000';

  const blogFormat = `Blog format rules:
- Start with an intro paragraph (NO H1 title in content — title is displayed separately in the header)
- Use ## for section headings (H2 only)
- ${wordTarget} words total — do not cut the post short. Hit the word target.
- End with a 2-3 sentence takeaway paragraph
- No bullet lists in the intro paragraph
- MANDATORY visual elements: every post must include at minimum (1) one callout block, (2) either a {{tldr}} or {{stats}} strip, (3) one > blockquote. These are not optional.`;

  // Build the enrichment context block for the writer
  const statsBlock = enrichment.stats.length > 0
    ? `\nSTATISTICS TO USE (weave these naturally into the text — bold the key number, name the source in prose):\n${enrichment.stats.map((s) => `- **${s.fact}** (source: ${s.source} — ${s.url})`).join('\n')}\n\nDO NOT turn these into hyperlinks. State facts like a journalist: "According to the IAB, podcast revenue hit $1.8B in 2022." Bold the number. Name the source in text. That's it.`
    : '';

  const tableBlock = enrichment.table.applicable
    ? `\nMARKDOWN TABLE: Include this comparison table in a relevant section. Caption: "${enrichment.table.caption}"\nHeaders: ${enrichment.table.headers.join(' | ')}\nData rows:\n${enrichment.table.rows.map((r) => r.join(' | ')).join('\n')}`
    : '';

  const caseStudyBlock = enrichment.caseStudy.applicable
    ? `\nCASE STUDY: Weave this into a dedicated section or as supporting evidence:\n${enrichment.caseStudy.brand}: ${enrichment.caseStudy.story}${enrichment.caseStudy.sourceUrl ? ` (source: ${enrichment.caseStudy.sourceUrl})` : ''}`
    : '';

  const linksBlock = enrichment.links.length > 0
    ? `\nLINKS (use at most 1-2 of these in the ENTIRE post — only when the source name itself is the natural anchor text, never wrap a whole sentence):\n${enrichment.links.map((l) => `- [${l.label}](${l.url})`).join('\n')}`
    : '';

  const chartPalette = CATEGORY_CHART_PALETTE[research.category] || 'indigo';
  const chartUrl = buildChartUrl(enrichment.chart, chartPalette);

  // Archetype-driven structure rules — forces variety across posts
  const archetypeRules = `
STRUCTURAL ARCHETYPE for this post: "${arch.name}"
Opening rule (CRITICAL — follow exactly): ${arch.opening}
Body structure: ${arch.structure}
Required callout types in this post: ${arch.requiredCallouts.map(t => `{{callout:${t}}}`).join(', ')}
${arch.tldrFirst ? '⚠ TLDR FIRST: This archetype requires a {{tldr}} block at the very top of the post BEFORE any prose paragraph.' : ''}
${arch.tldrRequired && !arch.tldrFirst ? '⚠ Include a {{tldr}} block right after the intro paragraph.' : ''}`;

  const embedDocs = `
EMBED SYNTAX REFERENCE (use these to vary the visual rhythm — don't dump them all in every post, follow the archetype above):

1. TLDR block — a styled "Quick Read" summary (3 short bullets):
{{tldr}}
- First key takeaway as a short sentence
- Second key takeaway
- Third key takeaway
{{/tldr}}

2. STATS strip — 3 hero numbers in a row (use this when the archetype calls for it). Each line is "value | label", one per line:
{{stats}}
2.7B | YouTube monthly users
$31.5B | YouTube ad revenue 2023
38.7% | Share of live watch time
{{/stats}}
Use exactly 3 stats. Values should be short (e.g., "$31.5B", "63%", "1.5M"). Labels should be 3-7 words.

3. CALLOUT box — a single highlighted insight. Available types: stat, insight, tip, update, warning. Use the type the archetype requires:
{{callout:insight}}
A single tight paragraph with the key insight. Bold the most important phrase.
{{/callout}}

4. CREATORS tag (MANDATORY at the very end of the post if you name any creators in the body):
{{creators:platform/username:Display Name,platform/username:Display Name}}`;

  const visualRules = `
Visual and data elements:
- HYPERLINKS: max 2-3 in the ENTIRE post. Link only when the destination name is the natural anchor text. NEVER wrap a full sentence or bolded number in a link.
- Bold key numbers: **bold** the single most important stat per section, not every number.
- Cite sources in prose: "According to X..." not as hyperlinks.
- Pull quote: use > blockquote ONCE for the single most striking stat or quote.
${chartUrl ? `- Data chart: a chart has been prepared. Embed it exactly as-is on its own line where the data is most relevant:\n  ![${enrichment.chart.title}](${chartUrl})\n  Don't modify the URL.` : ''}
${enrichment.table.applicable ? '- Markdown table: include the provided table in a natural section using pipe syntax.' : ''}
${enrichment.caseStudy.applicable ? '- Case study: include the provided brand/creator example with specific numbers.' : ''}
- ShinyPull plug: mention ShinyPull once near the end where it naturally fits.
${creatorList ? `- CREATORS TAG (mandatory if any creator from the list is named in the post body): emit a {{creators:...}} tag on its own line at the very END of the content. Format: {{creators:platform/username:Display Name}}, comma-separated. Only tag creators you actually name. Available: ${creatorList}` : ''}`;

  const enrichmentContext = `${statsBlock}${tableBlock}${caseStudyBlock}${linksBlock}`;

  const context = `Research context:
- Topic: ${research.suggestedTitle}
- Angle for our audience: ${research.angle}
- Key facts from source: ${research.keyFacts.join('; ')}
- Source publication: ${research.source}`;

  // Step 1: get metadata as JSON (no long string fields — avoids escaping issues)
  const metaPrompt = `You are a blog editor for ShinyPull (shinypull.com), a creator analytics platform.

Today's date: ${TODAY}. This post is being written and published in ${THIS_YEAR}.

${context}

Return ONLY valid JSON (no markdown fences, no explanation):
{
  "title": "final post title under 70 chars",
  "slug": "url-slug-from-title",
  "description": "meta description 120-155 chars, no em dashes, no double-quotes inside",
  "category": "${research.suggestedCategory}"
}`;

  const metaRaw = await callWithRetry(() => geminiGenerate(metaPrompt, 2048));
  const meta = safeParseJSON(metaRaw, {
    title: research.suggestedTitle,
    slug: slugify(research.suggestedTitle),
    description: research.angle,
    category: research.suggestedCategory,
  });

  await sleep(1000);

  // Step 2: get content as plain markdown (no JSON wrapper — no escaping needed)
  const contentPrompt = `You are writing a blog post for ShinyPull (shinypull.com), a creator analytics platform.

Today's date: ${TODAY}. This post is publishing in ${THIS_YEAR}. Never refer to ${THIS_YEAR} as "this year" without stating the year explicitly at least once. If citing a stat from ${THIS_YEAR - 1} or earlier, clearly note the year so readers know it is historical context, not current data.

${styleGuide}

${blogFormat}

${archetypeRules}

${embedDocs}

${visualRules}
${enrichmentContext}


${context}
Post title: ${meta.title}

Write the full blog post content now. Output ONLY the markdown content — no JSON, no code fences, no preamble, no title heading. Follow the archetype structure above EXACTLY — that's what makes each post visually different from the last one.`;

  const contentRaw = await callWithRetry(() => geminiGenerate(contentPrompt, 4096));
  const content = stripEmDashes(contentRaw);

  const draft = { ...meta, content };
  draft.readTime = estimateReadTime(draft.content);
  console.log(`✅ Draft: "${draft.title}" (~${draft.readTime})`);
  return draft;
}

// --- Review Agent ---
async function reviewAgent(draft) {
  console.log('🔎 Review Agent: auditing draft...');

  const reviewRaw = await callWithRetry(() => geminiGenerate(`You are a strict editor reviewing a blog post for ShinyPull. Check for violations of the style guide.

Today's date: ${TODAY}. The post should reflect ${THIS_YEAR} as the present year.

FAIL conditions (deduct 2 points each from a starting score of 10):
1. Em dashes (—) present anywhere in the content
2. Any sentence starting with "Here's [anything]" — "Here's what", "Here's where", "Here's why", "Here's how", "Here's the thing", "Here's a breakdown", "Here's what it signals", "Here's the math", etc.
3. "This isn't X. It's Y." or "isn't just X, it's Y" constructions
4. Any of these AI cliché phrases: "game-changer", "seismic shift", "landscape" as industry jargon, "paradigm", "Let that sink in", "it's worth noting", "in an era where", "genuinely [adjective]", "beautifully", "spectacularly", "borderline absurd", "sheer audacity", "And that's exactly the point"
5. Corporate/stiff/academic tone — reads like a press release or college essay
6. H1 heading (#) used anywhere in the content body
7. First paragraph is a bullet list instead of prose
8. More than 3 hyperlinks total in the post — over-linking is the #1 AI tell. Real writers link sparingly. Wrapping a bolded number or a full sentence in a link is an automatic fail.
9. Stale year problem: time-sensitive stats (earnings, revenue, MAU, market share) cited for a year earlier than ${THIS_YEAR - 1} without being explicitly framed as historical context.
10. Post body is fewer than 650 words — too thin to be useful. Count every word in the content.
11. Title matches a lazy formula: "[X]: What Creators Need/Must Know", "[X]: What It/This Means for Creators", "Changes the Game", "N Tips/Ways/Steps/Reasons...", "The Ultimate/Complete Guide"

WARN conditions (deduct 0.5 points each):
- More than two sentences over 25 words
- Semicolons used for dramatic effect rather than practical grammar

Blog post to review:
Title: ${draft.title}
Content:
${draft.content}

Return ONLY valid JSON (no markdown fences, no explanation):
{
  "score": 8,
  "violations": ["specific violation description"],
  "warnings": ["warning description"],
  "approved": true,
  "feedback": "1-2 sentence overall note for the author"
}`, 2048));

  // Fallback: if JSON is truncated, approve with a note rather than crashing
  const review = safeParseJSON(reviewRaw, {
    score: 7,
    violations: [],
    warnings: ['Review JSON was truncated — manual check recommended'],
    approved: true,
    feedback: 'Automated review incomplete due to response truncation.',
  });
  review.approved = review.score >= REVIEW_SCORE_THRESHOLD;
  console.log(`📊 Review score: ${review.score}/10 — ${review.approved ? 'APPROVED' : 'NEEDS REWRITE'}`);
  if (review.violations.length > 0) {
    review.violations.forEach((v) => console.log(`   ❌ ${v}`));
  }
  return review;
}

// --- Rewrite Agent ---
async function rewriteAgent(draft, review) {
  console.log('🔄 Rewrite Agent: fixing violations...');

  const issueList = [...review.violations, ...review.warnings].join('\n- ');

  const rewritten = await callWithRetry(() => geminiGenerate(`Rewrite the following blog post to fix these specific style issues:
- ${issueList}

Today's date: ${TODAY}. The post is publishing in ${THIS_YEAR}. Do not present stats from ${THIS_YEAR - 2} or earlier as current without clearly labeling them as historical.

MANDATORY style rules to follow throughout the rewrite (do not introduce new violations):
- NEVER use em dashes (—). Use commas, colons, or rewrite the sentence.
- NEVER start a sentence with "Here's [anything]" — rewrite as a direct statement instead.
- NEVER use "This isn't X. It's Y." or "isn't just X, it's Y" — rewrite as a direct positive statement.
- NEVER use: "game-changer", "seismic shift", "landscape" as jargon, "paradigm", "Let that sink in", "it's worth noting", "in an era where", "And that's exactly the point", "genuinely", "beautifully", "spectacularly"
- Keep the same structure, topic, facts, and approximate length
- Fix only the style violations — don't change the substance
- Return ONLY the rewritten markdown content (no JSON, no explanation, no code fences)

Original content:
${draft.content}`, 4096));

  draft.content = stripEmDashes(rewritten);
  draft.readTime = estimateReadTime(draft.content);
  console.log('✅ Rewrite complete');
  return draft;
}

// --- Save to Supabase ---
async function saveDraft(draft) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

  // Final hard strip — belt and suspenders. Even if both agents missed em dashes,
  // they will never make it into the database.
  draft.content = stripEmDashes(draft.content);
  draft.description = stripEmDashes(draft.description);
  draft.title = stripEmDashes(draft.title);

  let slug = draft.slug || slugify(draft.title);

  // Ensure unique slug
  const { data: existing } = await supabase
    .from('blog_posts')
    .select('slug')
    .eq('slug', slug)
    .limit(1);

  if (existing && existing.length > 0) {
    slug = `${slug}-${Date.now().toString(36)}`;
  }

  const post = {
    slug,
    title: draft.title,
    description: draft.description,
    content: draft.content,
    category: draft.category || 'Industry News',
    author: 'ShinyPull',
    image: await pickHeroImage(draft.title, draft.category, slug),
    read_time: draft.readTime,
    published_at: today,
    is_published: false,
  };

  const { data, error } = await supabase.from('blog_posts').insert(post).select().single();
  if (error) throw new Error(`Failed to save draft: ${error.message}`);

  console.log(`💾 Saved draft: /blog/${slug}`);
  return data;
}

// --- Send Email ---
async function sendNotification(savedPost, draft, review, rewritten) {
  if (!resend) {
    console.log('📧 Skipping email notification (RESEND_API_KEY not set)');
    return;
  }
  const plainText = draft.content
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*/g, '')
    .replace(/\n+/g, ' ')
    .substring(0, 450);

  const scoreColor = review.score >= 8 ? '#16a34a' : review.score >= 7 ? '#d97706' : '#dc2626';
  const scoreLabel = review.approved ? '✅ Approved' : '⚠️ Low quality — rewrite applied';

  const violationsHtml =
    review.violations.length > 0
      ? `<ul style="margin:8px 0;padding-left:20px">${review.violations.map((v) => `<li style="margin:4px 0">${v}</li>`).join('')}</ul>`
      : '<p style="color:#666;margin:8px 0">None found</p>';

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;color:#111;background:#fff">
  <div style="background:#6366f1;padding:24px 32px">
    <h1 style="color:white;margin:0;font-size:20px">Blog Draft Ready</h1>
    <p style="color:#c7d2fe;margin:4px 0 0;font-size:14px">ShinyPull AI Pipeline</p>
  </div>

  <div style="padding:32px">
    <h2 style="margin:0 0 8px;font-size:22px">${savedPost.title}</h2>
    <p style="color:#666;font-size:13px;margin:0 0 24px">${savedPost.category} &nbsp;·&nbsp; ${savedPost.read_time} &nbsp;·&nbsp; ${savedPost.published_at}</p>

    <div style="background:#f8fafc;border-left:3px solid #6366f1;padding:16px 20px;margin-bottom:24px;border-radius:0 8px 8px 0">
      <p style="margin:0;font-size:15px;line-height:1.7;color:#374151">${plainText}...</p>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-weight:600;width:140px">Review Score</td>
        <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:${scoreColor};font-weight:600">${review.score}/10 — ${scoreLabel}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-weight:600;vertical-align:top">Violations</td>
        <td style="padding:10px 0;border-bottom:1px solid #f0f0f0">${violationsHtml}</td>
      </tr>
      ${rewritten ? `<tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-weight:600">Rewrite</td><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#d97706">⚙️ Automatic rewrite was applied to fix violations</td></tr>` : ''}
      <tr>
        <td style="padding:10px 0;font-weight:600;vertical-align:top">Notes</td>
        <td style="padding:10px 0;color:#555">${review.feedback}</td>
      </tr>
    </table>

    <a href="https://shinypull.com/blog/admin" style="display:inline-block;background:#6366f1;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Review &amp; Publish Draft →</a>

    <p style="color:#999;font-size:12px;margin-top:24px">Remember to add a cover photo before publishing. The draft is saved but not visible to users until you publish it.</p>
  </div>
</div>`;

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: NOTIFICATION_EMAIL,
    subject: `Blog Draft Ready: ${savedPost.title}`,
    html,
  });

  if (error) {
    console.error('⚠️  Email notification failed:', error);
  } else {
    console.log(`📧 Notification sent to ${NOTIFICATION_EMAIL}`);
  }
}

// --- Main ---
async function main() {
  console.log(`\n🚀 Blog Draft Generator`);
  console.log('='.repeat(60));

  // 1. Research: fetch articles + all-time post data for deduplication + context
  const [articles, postData] = await Promise.all([
    fetchArticles(),
    fetchAllPostData(),
  ]);
  if (articles.length === 0) throw new Error('No articles fetched from any RSS feed');
  console.log(`📋 ${postData.allTitles.length} all-time titles loaded for deduplication`);
  if (postData.saturatedCategories.length > 0) {
    console.log(`   Over-represented categories: ${postData.saturatedCategories.join(', ')}`);
  }
  if (postData.recentCategories.length > 0) {
    const last3 = postData.recentCategories.slice(0, 3);
    const streak = last3[0] === last3[1] ? `⚠️  "${last3[0]}" streak detected` : 'varied';
    console.log(`   Recent categories: ${last3.join(' → ')} (${streak})`);
  }

  await sleep(1000);
  const rawResearch = await researchAgent(articles, postData);

  // 1b. Enforce title quality — refine if it hit a forbidden formula
  await sleep(500);
  const research = await refineTitleIfNeeded(rawResearch, postData.allTitles);

  // 2. Enrich: gather stats, tables, case studies, and links for the writer
  await sleep(1500);
  const rawEnrichment = await enrichmentAgent(research);

  // 2b. Validate URLs — strip any 404s before they reach the Writer
  const enrichment = await validateEnrichmentUrls(rawEnrichment);

  // 3. Load top creators for internal linking + creator-mention chips
  const { data: topCreators } = await supabase
    .from('creators')
    .select('platform, username, display_name')
    .in('platform', ['youtube', 'twitch', 'tiktok', 'kick', 'bluesky'])
    .order('updated_at', { ascending: false })
    .limit(120);
  const creatorList = (topCreators || [])
    .map(c => `${c.platform}/${c.username}:${c.display_name}`)
    .join(', ');
  console.log(`👤 Loaded ${topCreators?.length || 0} creators for internal linking`);

  // 4. Write — pass recent archetype names for rotation enforcement
  // Infer archetypes from recent slugs using a simple hash (avoids schema changes)
  const recentArchetypeNames = postData.recentSlugs.map(slug => {
    const idx = Math.abs(slug.split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)) % ARCHETYPES.length;
    return ARCHETYPES[idx].name;
  });
  await sleep(2000);
  let draft = await writerAgent(research, enrichment, creatorList, null, recentArchetypeNames);

  // 5. Review
  await sleep(2000);
  const review = await reviewAgent(draft);
  let rewritten = false;

  // 6. Rewrite if needed (one pass only)
  if (!review.approved) {
    await sleep(2000);
    draft = await rewriteAgent(draft, review);
    rewritten = true;
    review.feedback += ' Automatic rewrite was applied to address violations.';
    // Bump score estimate — assume rewrite improved it by ~2 points
    review.score = Math.min(review.score + 2, 10);
  }

  // 7. Save draft to Supabase
  const savedPost = await saveDraft(draft);

  // 8. Send email notification
  await sendNotification(savedPost, draft, review, rewritten);

  console.log('\n✅ Done! Draft saved and notification sent.');
  console.log(`   Blog admin: https://shinypull.com/blog/admin`);
}

main().catch((err) => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
