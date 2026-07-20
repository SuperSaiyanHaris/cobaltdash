/**
 * Seed Major Individual Creators (YouTube)
 *
 * Same root cause as seedMajorSportsTeams.js, different symptom: discoverYouTubeCreators.js
 * only samples 8 of ~80 generic genre queries per run, and even when a relevant one gets
 * picked, YouTube's search ranks results by literal text relevance to that phrase, not by
 * who's actually biggest in the genre. A channel branded just "IShowSpeed" doesn't score
 * high relevance for "react channel" or "prank videos" even though that's exactly what he
 * does, so he went untracked for 6+ months despite 59M subscribers. This script searches
 * each name directly, verifies the best-matching real result against keywords before
 * adding it, and adds only that one channel, never the raw result set.
 *
 * Usage: node scripts/seedMajorIndividualCreators.js
 * One-time / occasional run, not part of the daily discovery cron.
 *
 * Known limitation: picking the highest-subscriber keyword match can grab a
 * creator's separate music/clips/second channel instead of their real main
 * one when the second channel happens to have more subs (happened with KSI:
 * "KSI Music" outranked his actual main @ksi channel). Spot-check the run
 * output against each creator's real current handle before trusting it,
 * the same way seedMajorSportsTeams.js's results still need a human glance.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const YOUTUBE_API_KEY = process.env.VITE_YOUTUBE_API_KEY || process.env.YOUTUBE_API_KEY;

const BASE_URL = 'https://www.googleapis.com/youtube/v3';
const MIN_SUBSCRIBERS = 1_000_000; // These are all supposed to be household names — a low
                                    // match here means we found the wrong channel, not a real gap.

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

// { query, keywords } — keywords are the distinctive word(s) that MUST appear in a
// candidate channel's title for it to count as a real match, same verification pattern
// as seedMajorSportsTeams.js's TEAMS list.
const CREATORS = [
  { query: 'IShowSpeed', keywords: ['ishowspeed'] },
  { query: 'Adin Ross', keywords: ['adin ross'] },
  { query: 'xQc', keywords: ['xqc'] },
  { query: 'SSSniperWolf', keywords: ['sssniperwolf'] },
  { query: 'Dream', keywords: ['dream'] },
  { query: 'KSI', keywords: ['ksi'] },
  { query: 'Logan Paul', keywords: ['logan paul'] },
  { query: 'Jake Paul', keywords: ['jake paul'] },
  { query: 'Sidemen', keywords: ['sidemen'] },
  { query: 'Duke Dennis', keywords: ['duke dennis'] },
  { query: 'KreekCraft', keywords: ['kreekcraft'] },
  { query: 'Ryan\'s World', keywords: ['ryan'] },
  { query: 'Dude Perfect', keywords: ['dude perfect'] },
  { query: 'Jacksepticeye', keywords: ['jacksepticeye'] },
  { query: 'Emma Chamberlain', keywords: ['emma chamberlain'] },
  { query: 'David Dobrik', keywords: ['david dobrik'] },
  { query: 'James Charles', keywords: ['james charles'] },
  { query: 'Zach King', keywords: ['zach king'] },
  { query: 'Charli D\'Amelio', keywords: ['charli'] },
  { query: 'Khaby Lame', keywords: ['khaby'] },
  { query: 'Airrack', keywords: ['airrack'] },
  { query: 'Kwebbelkop', keywords: ['kwebbelkop'] },
  { query: 'Preston', keywords: ['preston'] },
  { query: 'Unspeakable', keywords: ['unspeakable'] },
  { query: 'SSundee', keywords: ['ssundee'] },
  { query: 'Aphmau', keywords: ['aphmau'] },
  { query: 'LazarBeam', keywords: ['lazarbeam'] },
  { query: 'Corpse Husband', keywords: ['corpse'] },
  { query: 'Typical Gamer', keywords: ['typical gamer'] },
  { query: 'VanossGaming', keywords: ['vanoss'] },
  { query: 'TommyInnit', keywords: ['tommyinnit'] },
  { query: 'DanTDM', keywords: ['dantdm'] },
  { query: 'Stokes Twins', keywords: ['stokes'] },
  { query: 'Shane Dawson', keywords: ['shane dawson'] },
  { query: 'Try Guys', keywords: ['try guys'] },
  { query: 'Good Mythical Morning', keywords: ['mythical morning', 'rhett', 'link'] },
  { query: 'Smosh', keywords: ['smosh'] },
  { query: 'Casey Neistat', keywords: ['casey neistat'] },
  { query: 'Valkyrae', keywords: ['valkyrae'] },
  { query: 'Pokimane', keywords: ['pokimane'] },
  { query: 'Disguised Toast', keywords: ['disguised toast'] },
  { query: 'N3on', keywords: ['n3on'] },
  { query: 'Baby Alien', keywords: ['baby alien'] },
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
  console.log(`\nMajor Individual Creators Seed - ${getTodayLocal()}\n`);
  if (!YOUTUBE_API_KEY) throw new Error('YouTube API key not configured');

  const existingIds = await getExistingChannelIds();
  console.log(`Found ${existingIds.size} existing YouTube creators\n`);

  let added = 0, skippedExisting = 0, noMatch = 0, failed = 0;

  for (const creator of CREATORS) {
    try {
      const ids = await searchChannels(creator.query);
      const details = await getChannelDetails(ids);

      const candidates = details.filter((ch) => matchesKeywords(ch.snippet?.title || '', creator.keywords));
      candidates.sort((a, b) => (parseInt(b.statistics?.subscriberCount) || 0) - (parseInt(a.statistics?.subscriberCount) || 0));
      const best = candidates[0];

      if (!best) {
        console.log(`   ? ${creator.query} — no result matched keywords [${creator.keywords.join(', ')}], skipped`);
        noMatch++;
        continue;
      }

      if (existingIds.has(best.id)) {
        console.log(`   -  ${creator.query} — already tracked (${best.snippet.title})`);
        skippedExisting++;
        continue;
      }

      const subs = parseInt(best.statistics?.subscriberCount) || 0;
      if (subs < MIN_SUBSCRIBERS) {
        console.log(`   ? ${creator.query} — best match "${best.snippet.title}" only has ${subs} subs, skipped`);
        noMatch++;
        continue;
      }

      const customUrl = best.snippet?.customUrl;
      if (!customUrl) {
        console.log(`   ? ${creator.query} — best match "${best.snippet.title}" has no public handle, skipped`);
        noMatch++;
        continue;
      }

      const { data: newCreator, error: insertErr } = await supabase.from('creators').insert({
        platform: 'youtube',
        platform_id: best.id,
        username: customUrl.replace('@', ''),
        display_name: best.snippet.title,
        profile_image: best.snippet.thumbnails?.high?.url || best.snippet.thumbnails?.default?.url,
        description: best.snippet.description?.substring(0, 500) || null,
        category: null,
      }).select().single();

      if (insertErr) {
        if (insertErr.code === '23505') { console.log(`   -  ${creator.query} — race condition, already added`); skippedExisting++; continue; }
        throw insertErr;
      }

      await supabase.from('creator_stats').insert({
        creator_id: newCreator.id,
        recorded_at: getTodayLocal(),
        subscribers: subs,
        total_views: parseInt(best.statistics?.viewCount) || 0,
        total_posts: parseInt(best.statistics?.videoCount) || 0,
      });

      console.log(`   + ${creator.query} -> ${best.snippet.title} (@${customUrl.replace('@', '')}, ${subs.toLocaleString()} subs)`);
      existingIds.add(best.id);
      added++;
    } catch (err) {
      console.error(`   x ${creator.query}: ${err.message}`);
      failed++;
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log(`\nDone. Added ${added}, already tracked ${skippedExisting}, no confident match ${noMatch}, failed ${failed}.\n`);
}

run().then(() => process.exit(0)).catch((err) => { console.error('Seed failed:', err.message); process.exit(1); });
