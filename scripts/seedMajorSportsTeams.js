/**
 * Seed Major Sports Teams (YouTube)
 *
 * discoverYouTubeCreators.js's generic genre queries ("football channel",
 * "soccer highlights") reliably surface commentary/highlight creators but
 * essentially never surface the official team channels themselves — those
 * only show up when you search their actual name. That's why teams as big
 * as Real Madrid (tens of millions of subscribers) went untracked for six
 * months. This script searches each team by name directly, verifies the
 * best-matching real result against the team's own keywords before adding
 * it, and adds only that one channel — not the whole raw result set (the
 * same indiscriminate-bulk-add mistake that used to live in Search.jsx's
 * persistSearchResults).
 *
 * Usage: node scripts/seedMajorSportsTeams.js
 * One-time / occasional run, not part of the daily discovery cron.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const YOUTUBE_API_KEY = process.env.VITE_YOUTUBE_API_KEY || process.env.YOUTUBE_API_KEY;

const BASE_URL = 'https://www.googleapis.com/youtube/v3';
const MIN_SUBSCRIBERS = 5000; // Lower than general discovery's 10K floor — precision here
                               // comes from the curated list + keyword match, not the size filter.

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

// { query, keywords } — keywords are the distinctive word(s) that MUST appear
// in a candidate channel's title for it to count as a real match. Generic
// league/club words ("FC", "United", "City") are deliberately excluded from
// keywords since they're too common to disambiguate on their own.
const TEAMS = [
  // Football / soccer — La Liga, Premier League, Serie A, Bundesliga, Ligue 1
  { query: 'Real Madrid', keywords: ['madrid'] },
  { query: 'FC Barcelona', keywords: ['barcelona', 'barça', 'barca'] },
  { query: 'Atletico Madrid', keywords: ['atletico', 'atlético'] },
  { query: 'Manchester United', keywords: ['manchester', 'united'] },
  { query: 'Manchester City', keywords: ['manchester', 'city'] },
  { query: 'Liverpool FC', keywords: ['liverpool'] },
  { query: 'Chelsea FC', keywords: ['chelsea'] },
  { query: 'Arsenal', keywords: ['arsenal'] },
  { query: 'Tottenham Hotspur', keywords: ['tottenham', 'spurs'] },
  { query: 'Bayern Munich', keywords: ['bayern'] },
  { query: 'Borussia Dortmund', keywords: ['dortmund', 'bvb'] },
  { query: 'Paris Saint-Germain', keywords: ['paris', 'psg'] },
  { query: 'Juventus', keywords: ['juventus'] },
  { query: 'AC Milan', keywords: ['milan'] },
  { query: 'Inter Milan', keywords: ['inter'] },
  { query: 'AS Roma', keywords: ['roma'] },
  { query: 'Napoli', keywords: ['napoli'] },
  { query: 'Ajax', keywords: ['ajax'] },
  { query: 'Celtic FC', keywords: ['celtic'] },
  { query: 'Benfica', keywords: ['benfica'] },
  { query: 'Boca Juniors', keywords: ['boca'] },
  { query: 'River Plate', keywords: ['river'] },
  { query: 'Flamengo', keywords: ['flamengo'] },

  // NBA
  { query: 'Los Angeles Lakers', keywords: ['lakers'] },
  { query: 'Golden State Warriors', keywords: ['warriors'] },
  { query: 'Boston Celtics', keywords: ['celtics'] },
  { query: 'Chicago Bulls', keywords: ['bulls'] },
  { query: 'Miami Heat', keywords: ['heat'] },
  { query: 'Brooklyn Nets', keywords: ['nets'] },
  { query: 'Dallas Mavericks', keywords: ['mavericks', 'mavs'] },
  { query: 'Milwaukee Bucks', keywords: ['bucks'] },
  { query: 'Phoenix Suns', keywords: ['suns'] },
  { query: 'New York Knicks', keywords: ['knicks'] },

  // NFL
  { query: 'Dallas Cowboys', keywords: ['cowboys'] },
  { query: 'Kansas City Chiefs', keywords: ['chiefs'] },
  { query: 'San Francisco 49ers', keywords: ['49ers', 'niners'] },
  { query: 'Philadelphia Eagles', keywords: ['eagles'] },
  { query: 'Green Bay Packers', keywords: ['packers'] },
  { query: 'Pittsburgh Steelers', keywords: ['steelers'] },
  { query: 'Las Vegas Raiders', keywords: ['raiders'] },
  { query: 'Buffalo Bills', keywords: ['bills'] },
  { query: 'Miami Dolphins', keywords: ['dolphins'] },

  // MLB
  { query: 'New York Yankees', keywords: ['yankees'] },
  { query: 'Los Angeles Dodgers', keywords: ['dodgers'] },
  { query: 'Boston Red Sox', keywords: ['red sox'] },
  { query: 'Chicago Cubs', keywords: ['cubs'] },
  { query: 'San Francisco Giants', keywords: ['giants'] },
  { query: 'Houston Astros', keywords: ['astros'] },

  // NHL
  { query: 'Toronto Maple Leafs', keywords: ['maple leafs'] },
  { query: 'Montreal Canadiens', keywords: ['canadiens'] },
  { query: 'New York Rangers', keywords: ['rangers'] },
  { query: 'Chicago Blackhawks', keywords: ['blackhawks'] },

  // Cricket (IPL) — huge following, global reach via India
  { query: 'Chennai Super Kings', keywords: ['chennai', 'csk'] },
  { query: 'Mumbai Indians', keywords: ['mumbai indians'] },
  { query: 'Royal Challengers Bangalore', keywords: ['royal challengers', 'rcb'] },
  { query: 'Kolkata Knight Riders', keywords: ['kolkata', 'kkr'] },
];

function getTodayLocal() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

async function searchChannels(query, maxResults = 8) {
  const params = new URLSearchParams({ part: 'snippet', type: 'channel', q: query, maxResults: String(maxResults), key: YOUTUBE_API_KEY });
  const res = await fetch(`${BASE_URL}/search?${params}`);
  const data = await res.json();
  if (data.error) throw new Error(`Search API error: ${data.error.message}`);
  return data.items?.map((i) => i.id.channelId) || [];
}

async function getChannelDetails(channelIds) {
  if (channelIds.length === 0) return [];
  const params = new URLSearchParams({ part: 'snippet,statistics', id: channelIds.join(','), key: YOUTUBE_API_KEY });
  const res = await fetch(`${BASE_URL}/channels?${params}`);
  const data = await res.json();
  if (data.error) throw new Error(`Channels API error: ${data.error.message}`);
  return data.items || [];
}

function matchesKeywords(title, keywords) {
  const norm = title.toLowerCase();
  return keywords.some((k) => norm.includes(k.toLowerCase()));
}

async function getExistingChannelIds() {
  const allIds = new Set();
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('creators').select('platform_id').eq('platform', 'youtube')
      .order('id').range(from, from + pageSize - 1);
    if (error) throw new Error(`Supabase error: ${error.message}`);
    data.forEach((c) => allIds.add(c.platform_id));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return allIds;
}

async function run() {
  console.log(`\n🏟️  Major Sports Teams Seed - ${getTodayLocal()}\n`);
  if (!YOUTUBE_API_KEY) throw new Error('YouTube API key not configured');

  const existingIds = await getExistingChannelIds();
  console.log(`Found ${existingIds.size} existing YouTube creators\n`);

  let added = 0, skippedExisting = 0, noMatch = 0, failed = 0;

  for (const team of TEAMS) {
    try {
      const ids = await searchChannels(team.query);
      const details = await getChannelDetails(ids);

      const candidates = details.filter((ch) => matchesKeywords(ch.snippet?.title || '', team.keywords));
      candidates.sort((a, b) => (parseInt(b.statistics?.subscriberCount) || 0) - (parseInt(a.statistics?.subscriberCount) || 0));
      const best = candidates[0];

      if (!best) {
        console.log(`   ❓ ${team.query} — no result matched keywords [${team.keywords.join(', ')}], skipped`);
        noMatch++;
        continue;
      }

      if (existingIds.has(best.id)) {
        console.log(`   ⏭️  ${team.query} — already tracked (${best.snippet.title})`);
        skippedExisting++;
        continue;
      }

      const subs = parseInt(best.statistics?.subscriberCount) || 0;
      if (subs < MIN_SUBSCRIBERS) {
        console.log(`   ❓ ${team.query} — best match "${best.snippet.title}" only has ${subs} subs, skipped`);
        noMatch++;
        continue;
      }

      const customUrl = best.snippet?.customUrl;
      if (!customUrl) {
        console.log(`   ❓ ${team.query} — best match "${best.snippet.title}" has no public handle, skipped`);
        noMatch++;
        continue;
      }

      // search_alias covers the case where a channel's real display_name
      // (e.g. "Man City") doesn't contain the full name people actually
      // search for (e.g. "Manchester City") — the fuzzy search RPC matches
      // against it too. Only set when it isn't already a substring of the
      // real display_name, so we're not duplicating a match that already works.
      const alias = best.snippet.title.toLowerCase().includes(team.query.toLowerCase()) ? null : team.query;

      const { data: creator, error: insertErr } = await supabase.from('creators').insert({
        platform: 'youtube',
        platform_id: best.id,
        username: customUrl.replace('@', ''),
        display_name: best.snippet.title,
        profile_image: best.snippet.thumbnails?.high?.url || best.snippet.thumbnails?.default?.url,
        description: best.snippet.description?.substring(0, 500) || null,
        category: 'Sports',
        search_alias: alias,
      }).select().single();

      if (insertErr) {
        if (insertErr.code === '23505') { console.log(`   ⏭️  ${team.query} — race condition, already added`); skippedExisting++; continue; }
        throw insertErr;
      }

      await supabase.from('creator_stats').insert({
        creator_id: creator.id,
        recorded_at: getTodayLocal(),
        subscribers: subs,
        total_views: parseInt(best.statistics?.viewCount) || 0,
        total_posts: parseInt(best.statistics?.videoCount) || 0,
      });

      console.log(`   ✅ ${team.query} → ${best.snippet.title} (@${customUrl.replace('@', '')}, ${subs.toLocaleString()} subs)`);
      existingIds.add(best.id);
      added++;
    } catch (err) {
      console.error(`   ❌ ${team.query}: ${err.message}`);
      failed++;
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log(`\n✨ Done. Added ${added}, already tracked ${skippedExisting}, no confident match ${noMatch}, failed ${failed}.\n`);
}

run().then(() => process.exit(0)).catch((err) => { console.error('❌ Seed failed:', err.message); process.exit(1); });
