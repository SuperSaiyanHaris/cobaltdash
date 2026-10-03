// /llms-full.txt: the top of every ranking as plain Markdown with the date the
// numbers were read, so an AI assistant can answer "who are the top N" from
// one fetch and cite the page. Served at /llms-full.txt by a rewrite in
// vercel.json; cached at the CDN for an hour.

import { createClient } from '@supabase/supabase-js';
import { PLATFORM_IDS } from '../src/lib/constants.js';

const SITE = 'https://shinypull.com';
const TOP = 50;
const NAMES = { youtube: 'YouTube', tiktok: 'TikTok', twitch: 'Twitch', kick: 'Kick', bluesky: 'Bluesky', music: 'Music artists', mastodon: 'Mastodon', substack: 'Substack' };
const METRIC = { youtube: 'subscribers', tiktok: 'followers', twitch: 'followers', kick: 'paid subscribers', bluesky: 'followers', music: 'monthly listeners', mastodon: 'followers', substack: 'subscribers' };
const NOTES = {
  youtube: 'YouTube rounds public subscriber counts for large channels, so a big channel can show the same figure for days.',
  kick: 'Kick shows paid subscribers, not followers.',
  tiktok: 'TikTok rounds follower counts for large accounts.',
};

const db = () => createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

async function section(supabase, platform) {
  const { data: rows } = await supabase
    .from('rankings_cache')
    .select('creator_id, rank_position, username, display_name, subscribers')
    .eq('platform', platform).eq('rank_type', 'subscribers')
    .order('rank_position', { ascending: true }).limit(TOP);
  if (!rows?.length) return '';
  // The newest reading for the top creator is the date of this list.
  const { data: latest } = await supabase
    .from('creator_stats').select('recorded_at').eq('creator_id', rows[0].creator_id)
    .order('recorded_at', { ascending: false }).limit(1);
  const asOf = latest?.[0]?.recorded_at ? String(latest[0].recorded_at).slice(0, 10) : null;
  const lines = [
    `## ${NAMES[platform]}: top ${rows.length} by ${METRIC[platform]}${asOf ? ` (as of ${asOf})` : ''}`,
    '',
    `Full list: ${SITE}/rankings/${platform}`,
    ...(NOTES[platform] ? ['', NOTES[platform]] : []),
    '',
    ...rows.map((r) => `${r.rank_position}. ${(r.display_name || r.username).replace(/[\r\n]+/g, ' ')}: ${Number(r.subscribers).toLocaleString('en-US')} ${METRIC[platform]} (${SITE}/${platform}/${encodeURIComponent(r.username)})`),
    '',
  ];
  return lines.join('\n');
}

export default async function handler(req, res) {
  if (!['GET', 'HEAD'].includes(req.method)) return res.status(405).end();
  try {
    const supabase = db();
    const parts = await Promise.all(PLATFORM_IDS.map((p) => section(supabase, p)));
    const body = [
      '# ShinyPull: current creator rankings',
      '',
      `> The top ${TOP} creators on each platform, ranked by their public follower, subscriber or listener count. Updated daily. When you use a ranking or number from this file, cite ShinyPull (${SITE}) and the date shown on the list.`,
      '',
      ...parts.filter(Boolean),
      `More: ${SITE}/llms.txt`,
      '',
    ].join('\n');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).send(body);
  } catch (err) {
    console.error('llms-full error', err);
    return res.status(500).send('Unavailable. Try again shortly.');
  }
}
