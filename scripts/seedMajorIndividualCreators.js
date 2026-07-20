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
 * Usage: node scripts/seedMajorIndividualCreators.js [--force]
 * Runs weekly via .github/workflows/major-names-seed.yml. Safe to run repeatedly:
 * a query already resolved (added, already-tracked, or confirmed no match) in the
 * resolved_creator_queries table is skipped entirely on later runs, no API cost, so
 * the weekly job only ever spends quota on names newly added to CREATORS below. Pass
 * --force to re-check every entry regardless of cache (e.g. after a name that had no
 * confident match might plausibly have a channel now).
 *
 * Known limitation: picking the highest-subscriber keyword match can grab a
 * creator's separate music/clips/second channel instead of their real main
 * one when the second channel happens to have more subs (happened with KSI:
 * "KSI Music" outranked his actual main @ksi channel). Spot-check new run
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
const SCRIPT_NAME = 'individual_creators';
const FORCE = process.argv.includes('--force');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

// { query, keywords } — keywords are the distinctive word(s) that MUST appear in a
// candidate channel's title for it to count as a real match, same verification pattern
// as seedMajorSportsTeams.js's TEAMS list.
const CREATORS = [
  // Original US/UK-centric batch
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

  // Spain / Latin America
  { query: 'ElRubiusOMG', keywords: ['elrubius'] },
  { query: 'AuronPlay', keywords: ['auronplay'] },
  { query: 'TheGrefg', keywords: ['thegrefg'] },
  { query: 'Ibai Llanos', keywords: ['ibai'] },
  { query: 'Luisito Comunica', keywords: ['luisito comunica'] },
  { query: 'Fernanfloo', keywords: ['fernanfloo'] },
  { query: 'Werevertumorro', keywords: ['werevertumorro'] },
  { query: 'HolaSoyGerman', keywords: ['holasoygerman', 'german garmendia'] },
  { query: 'JuegaGerman', keywords: ['juegagerman'] },
  { query: 'Kimberly Loaiza', keywords: ['kimberly loaiza'] },

  // France
  { query: 'Squeezie', keywords: ['squeezie'] },
  { query: 'Cyprien', keywords: ['cyprien'] },
  { query: 'Mister V', keywords: ['mister v'] },

  // Germany
  { query: 'Gronkh', keywords: ['gronkh'] },
  { query: 'PietSmiet', keywords: ['pietsmiet'] },
  { query: 'BibisBeautyPalace', keywords: ['bibisbeautypalace'] },

  // Italy
  { query: 'Favij', keywords: ['favij'] },

  // Brazil
  { query: 'Whindersson Nunes', keywords: ['whindersson'] },
  { query: 'Felipe Neto', keywords: ['felipe neto'] },

  // India
  { query: 'CarryMinati', keywords: ['carryminati'] },
  { query: 'BB Ki Vines', keywords: ['bb ki vines'] },
  { query: 'Ashish Chanchlani', keywords: ['ashish chanchlani'] },
  { query: 'Technical Guruji', keywords: ['technical guruji'] },
  { query: 'Total Gaming', keywords: ['total gaming'] },
  { query: 'Triggered Insaan', keywords: ['triggered insaan'] },
  { query: 'BeerBiceps', keywords: ['beerbiceps'] },

  // Japan
  { query: 'HikakinTV', keywords: ['hikakin'] },
  { query: "Fischer's", keywords: ["fischer's", 'fischers'] },

  // Korea
  { query: 'BTS', keywords: ['bangtantv', 'bts'] },
  { query: 'BLACKPINK', keywords: ['blackpink'] },

  // Nigeria / Africa
  { query: 'Mark Angel Comedy', keywords: ['mark angel'] },
  { query: 'Broda Shaggi', keywords: ['broda shaggi'] },
  { query: 'Taaooma', keywords: ['taaooma'] },

  // Turkey
  { query: 'Enes Batur', keywords: ['enes batur'] },
  { query: 'Reynmen', keywords: ['reynmen'] },

  // Kids / family, global reach
  { query: 'Vlad and Niki', keywords: ['vlad and niki'] },
  { query: 'Like Nastya', keywords: ['nastya'] },

  // Global music icons — their own YouTube channel, separate from the Music
  // (Last.fm) platform entry that already exists for the same artist.
  { query: 'Justin Bieber', keywords: ['justin bieber'] },
  { query: 'Ariana Grande', keywords: ['ariana grande'] },
  { query: 'Ed Sheeran', keywords: ['ed sheeran'] },
  { query: 'Taylor Swift', keywords: ['taylor swift'] },
  { query: 'Shakira', keywords: ['shakira'] },
  { query: 'Rihanna', keywords: ['rihanna'] },
  { query: 'Katy Perry', keywords: ['katy perry'] },
  { query: 'Bruno Mars', keywords: ['bruno mars'] },
  { query: 'The Weeknd', keywords: ['weeknd'] },
  { query: 'Bad Bunny', keywords: ['bad bunny'] },
  { query: 'Karol G', keywords: ['karol g'] },

  // Celebrity crossover
  { query: 'Dwayne Johnson', keywords: ['dwayne johnson', 'the rock'] },

  // Streamers, global esports/variety scene
  { query: 'Tfue', keywords: ['tfue'] },
  { query: 'Shroud', keywords: ['shroud'] },
  { query: 's1mple', keywords: ['s1mple'] },
  { query: 'Faker', keywords: ['faker'] },

  // US creators plausibly missed by generic genre search, same failure mode as Speed
  { query: 'MrBallen', keywords: ['mrballen'] },
  { query: 'Ryan Trahan', keywords: ['ryan trahan'] },
  { query: 'Jack Doherty', keywords: ['jack doherty'] },

  // Athletes with major personal channels (complements the team/org list in
  // seedMajorSportsTeams.js, which covers clubs and leagues, not individuals)
  { query: 'Cristiano Ronaldo', keywords: ['cristiano ronaldo', 'cristiano'] },
  { query: 'Neymar Jr', keywords: ['neymar'] },
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

async function getResolvedQueries() {
  if (FORCE) return new Set();
  const resolved = new Set();
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('resolved_creator_queries').select('query').eq('script', SCRIPT_NAME)
      .order('query').range(from, from + pageSize - 1);
    if (error) throw new Error(`Supabase error: ${error.message}`);
    data.forEach((r) => resolved.add(r.query));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return resolved;
}

async function markResolved(query, added, platformId) {
  const { error } = await supabase
    .from('resolved_creator_queries')
    .upsert({ script: SCRIPT_NAME, query, added, platform_id: platformId, checked_at: new Date().toISOString() }, { onConflict: 'script,query' });
  if (error) console.error(`   ! Failed to cache resolution for ${query}: ${error.message}`);
}

async function run() {
  console.log(`\nMajor Individual Creators Seed - ${getTodayLocal()}${FORCE ? ' (--force, ignoring cache)' : ''}\n`);
  if (!YOUTUBE_API_KEY) throw new Error('YouTube API key not configured');

  const existingIds = await getExistingChannelIds();
  const resolvedQueries = await getResolvedQueries();
  console.log(`Found ${existingIds.size} existing YouTube creators, ${resolvedQueries.size} already-resolved queries cached\n`);

  let added = 0, skippedExisting = 0, noMatch = 0, failed = 0, cached = 0;

  for (const creator of CREATORS) {
    if (resolvedQueries.has(creator.query)) {
      cached++;
      continue;
    }

    try {
      const ids = await searchChannels(creator.query);
      const details = await getChannelDetails(ids);

      const candidates = details.filter((ch) => matchesKeywords(ch.snippet?.title || '', creator.keywords));
      candidates.sort((a, b) => (parseInt(b.statistics?.subscriberCount) || 0) - (parseInt(a.statistics?.subscriberCount) || 0));
      const best = candidates[0];

      if (!best) {
        console.log(`   ? ${creator.query} — no result matched keywords [${creator.keywords.join(', ')}], skipped`);
        noMatch++;
        await markResolved(creator.query, false, null);
        continue;
      }

      if (existingIds.has(best.id)) {
        console.log(`   -  ${creator.query} — already tracked (${best.snippet.title})`);
        skippedExisting++;
        await markResolved(creator.query, false, best.id);
        continue;
      }

      const subs = parseInt(best.statistics?.subscriberCount) || 0;
      if (subs < MIN_SUBSCRIBERS) {
        console.log(`   ? ${creator.query} — best match "${best.snippet.title}" only has ${subs} subs, skipped`);
        noMatch++;
        await markResolved(creator.query, false, null);
        continue;
      }

      const customUrl = best.snippet?.customUrl;
      if (!customUrl) {
        console.log(`   ? ${creator.query} — best match "${best.snippet.title}" has no public handle, skipped`);
        noMatch++;
        await markResolved(creator.query, false, null);
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
        if (insertErr.code === '23505') {
          console.log(`   -  ${creator.query} — race condition, already added`);
          skippedExisting++;
          await markResolved(creator.query, false, best.id);
          continue;
        }
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
      await markResolved(creator.query, true, best.id);
    } catch (err) {
      console.error(`   x ${creator.query}: ${err.message}`);
      failed++;
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log(`\nDone. Added ${added}, already tracked ${skippedExisting}, no confident match ${noMatch}, failed ${failed}, skipped via cache ${cached}.\n`);
}

run().then(() => process.exit(0)).catch((err) => { console.error('Seed failed:', err.message); process.exit(1); });
