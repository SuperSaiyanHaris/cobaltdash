/**
 * Classify YouTube creators into hub categories.
 *
 * YouTube creators have no category data (0 of 6,523), which blocks the
 * /best/:slug hub pages for our biggest platform. The Data API's
 * `topicDetails.topicCategories` returns a fixed taxonomy of Wikipedia URLs
 * per channel; this maps those to our own category names.
 *
 * Safe to re-run. Writes ONLY `creators.category` for platform='youtube'.
 * Nothing else touches that column for YouTube: collectDailyStats.js
 * deliberately avoids upserting it, and discoverYouTubeCreators.js only sets
 * category:null on channels not already in the DB.
 *
 * Usage:
 *   node scripts/classifyYouTubeCreators.js            # dry run, prints distribution
 *   node scripts/classifyYouTubeCreators.js --write    # persist
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const API_KEY = process.env.VITE_YOUTUBE_API_KEY;
const WRITE = process.argv.includes('--write');

/**
 * YouTube topic (Wikipedia slug) -> our category.
 *
 * Order matters: a channel usually carries several topics, and the generic ones
 * ("Lifestyle (sociology)", "Entertainment") ride along with almost everything.
 * MrBeast is [Lifestyle, Entertainment]; Marques Brownlee is [Lifestyle,
 * Technology]. So we walk this list in order and take the FIRST match, putting
 * specific topics ahead of generic ones. The generic buckets sit at the bottom
 * as a last resort.
 */
const TOPIC_MAP = [
  // --- Specific -----------------------------------------------------------
  ['Gaming',      ['Video_game_culture', 'Action_game', 'Action-adventure_game', 'Casual_game',
                   'Music_video_game', 'Puzzle_video_game', 'Racing_video_game',
                   'Role-playing_video_game', 'Simulation_video_game', 'Sports_game',
                   'Strategy_video_game']],
  ['Music',       ['Music', 'Christian_music', 'Classical_music', 'Country_music',
                   'Electronic_music', 'Hip_hop_music', 'Independent_music', 'Jazz',
                   'Music_of_Asia', 'Music_of_Latin_America', 'Pop_music', 'Reggae',
                   'Rock_music', 'Rhythm_and_blues', 'Soul_music']],
  ['Sports',      ['Sport', 'American_football', 'Baseball', 'Basketball', 'Boxing',
                   'Cricket', 'Association_football', 'Golf', 'Ice_hockey',
                   'Mixed_martial_arts', 'Motorsport', 'Tennis', 'Volleyball',
                   'Professional_wrestling']],
  ['Technology',  ['Technology', 'Computer_hardware', 'Electronics', 'Software']],
  ['Food',        ['Food']],
  ['Fitness',     ['Physical_fitness']],
  ['Health',      ['Health']],
  ['Beauty',      ['Fashion', 'Physical_attractiveness']],
  ['Cars',        ['Vehicle', 'Motor_vehicle']],
  ['Travel',      ['Tourism']],
  ['Pets',        ['Pet']],
  ['Film & TV',   ['Film', 'Television_program', 'Performing_arts']],
  ['Comedy',      ['Humor']],
  ['Education',   ['Knowledge']],
  ['Politics',    ['Politics']],
  ['Business',    ['Business']],
  ['Religion',    ['Religion']],
  ['Military',    ['Military']],
  ['Hobby',       ['Hobby']],
  // --- Generic: only if nothing above matched -----------------------------
  ['Entertainment', ['Entertainment']],
  ['Society',       ['Society']],
  ['Lifestyle',     ['Lifestyle_(sociology)']],
];

/** Wikipedia URL -> bare slug ("https://en.wikipedia.org/wiki/Pop_music" -> "Pop_music"). */
function topicSlug(url) {
  return decodeURIComponent(url.split('/wiki/')[1] || '');
}

function classify(topicUrls) {
  if (!topicUrls || !topicUrls.length) return null;
  const slugs = new Set(topicUrls.map(topicSlug));
  for (const [category, topics] of TOPIC_MAP) {
    if (topics.some((t) => slugs.has(t))) return category;
  }
  return null;
}

async function fetchAllCreators() {
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('creators')
      .select('id, platform_id, display_name, category')
      .eq('platform', 'youtube')
      // .order() is REQUIRED: range pagination without a stable sort lets
      // Postgres return rows in any order per page, which silently repeats some
      // rows and skips others. That made an earlier run over-count Gaming as
      // 1308 (true value 1060) and leave real channels unclassified.
      .order('id')
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return rows;
}

async function fetchTopics(channelIds) {
  const res = await fetch(
    'https://www.googleapis.com/youtube/v3/channels' +
      `?part=topicDetails&id=${channelIds.join(',')}&key=${API_KEY}&maxResults=50`
  );
  // Never let a failed call be read as "no topics" — that would wipe good
  // categories on a re-run. Throw so the batch is skipped instead.
  if (!res.ok) throw new Error(`YouTube API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  if (data.error) throw new Error(`YouTube API: ${data.error.message}`);
  const out = new Map();
  for (const item of data.items || []) {
    out.set(item.id, item.topicDetails?.topicCategories || []);
  }
  return out;
}

async function main() {
  if (!API_KEY) throw new Error('VITE_YOUTUBE_API_KEY missing');

  const creators = await fetchAllCreators();
  console.log(`YouTube creators: ${creators.length}${WRITE ? '' : '  (DRY RUN — pass --write to persist)'}`);

  const byId = new Map(creators.map((c) => [c.platform_id, c]));
  const ids = creators.map((c) => c.platform_id).filter(Boolean);

  const assignments = new Map(); // creator id -> category
  const dist = new Map();
  let noTopics = 0;
  let missing = 0;
  let failedBatches = 0;

  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    let topics;
    try {
      topics = await fetchTopics(batch);
    } catch (e) {
      failedBatches++;
      console.error(`  batch ${i / 50}: ${e.message}`);
      continue;
    }
    for (const pid of batch) {
      const creator = byId.get(pid);
      if (!creator) continue;
      if (!topics.has(pid)) { missing++; continue; } // channel deleted/private
      const cat = classify(topics.get(pid));
      if (!cat) { noTopics++; continue; }
      assignments.set(creator.id, cat);
      dist.set(cat, (dist.get(cat) || 0) + 1);
    }
    if ((i / 50) % 20 === 0) process.stdout.write(`  ${i}/${ids.length}\r`);
  }

  console.log(`\nClassified: ${assignments.size}  |  no usable topics: ${noTopics}  |  not returned by API: ${missing}  |  failed batches: ${failedBatches}`);
  console.log('\nDistribution:');
  [...dist.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  ${String(v).padStart(5)}  ${k}${v >= 15 ? '' : '   (below hub threshold)'}`));

  if (!WRITE) {
    console.log('\nDry run — nothing written.');
    return;
  }

  console.log('\nWriting categories...');
  let ok = 0;
  const entries = [...assignments.entries()];
  for (let i = 0; i < entries.length; i++) {
    const [id, category] = entries[i];
    const { error } = await supabase.from('creators').update({ category }).eq('id', id);
    if (!error) ok++;
    else console.error(`  ${id}: ${error.message}`);
    if (i % 250 === 0) process.stdout.write(`  ${i}/${entries.length}\r`);
  }
  console.log(`\nUpdated ${ok}/${entries.length} creators.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
