/**
 * Vercel Edge Middleware — server-renders SEO content for crawlers + social previews.
 *
 * Problem: ShinyPull is a React SPA. Crawlers and link-preview bots fetch a URL and
 * get index.html — an empty <div id="root"></div>. Google can render JS, but it
 * won't spend render budget on 40K pages of a low-authority domain, so pages were
 * indexed as empty shells (416 impressions, 0 clicks in 6 months).
 *
 * Solution, in two layers:
 *  1. META layer (all matched routes): rewrite <title>/<meta> via string replacement.
 *  2. CONTENT layer (profile / rankings / blog routes): fetch real data from Supabase
 *     PostgREST (anon key, read-only, same rows the SPA reads) and inject a
 *     server-rendered HTML block into <div id="root"> plus JSON-LD into <head>.
 *     React 18's createRoot().render() replaces the div's children on mount, so
 *     real users see the static block only for the brief moment before hydration.
 *     Crawlers with no JS see full content. Everyone gets the SAME html — no
 *     user-agent sniffing, no cloaking.
 *
 * Failure mode is always graceful: any fetch error/timeout falls back to the
 * meta-only rewrite (or the untouched index.html), never a 5xx.
 *
 * IMPORTANT: keep PLATFORM_NAMES + METRIC_LABELS + the static page map in sync with
 * new platforms/routes. The "adding a new platform" checklist in CLAUDE.md flags this file.
 */

// The hub taxonomy is shared with the app and the sitemap builder. It is plain
// ESM with no dependencies specifically so it can be bundled into the edge runtime.
import { getHub, HUBS } from './src/lib/hubs.js';
import { HUB_INTROS } from './src/lib/hubIntros.js';

export const config = {
  matcher: [
    // All paths except API routes and static assets (files with extensions).
    '/((?!api|.*\\..*).*)',
    // Usernames containing dots (Bluesky handles, Mastodon instances, TikTok/YouTube
    // handles with periods) are excluded by the pattern above, so match profile and
    // live-count routes explicitly. :username matches any non-slash chars incl. dots.
    '/:platform(youtube|tiktok|twitch|kick|bluesky|music|mastodon|rumble|substack)/:username',
    '/live/:platform(youtube|tiktok|twitch|kick|bluesky|music|mastodon|rumble|substack)/:username',
    // Embeddable SVG stats badge (served straight from the edge, no Vercel function)
    '/badge/:platform(youtube|tiktok|twitch|kick|bluesky|music|mastodon|rumble|substack)/:username',
  ],
};

const PLATFORM_NAMES = {
  youtube:  'YouTube',
  tiktok:   'TikTok',
  twitch:   'Twitch',
  kick:     'Kick',
  bluesky:  'Bluesky',
  music:    'Music',
  mastodon: 'Mastodon',
  rumble:   'Rumble',
  substack: 'Substack',
};

// What the `subscribers` column means per platform (matches the SPA's labels).
const METRIC_LABELS = {
  youtube:  'subscribers',
  tiktok:   'followers',
  twitch:   'followers',
  kick:     'paid subscribers',
  bluesky:  'followers',
  music:    'monthly listeners',
  mastodon: 'followers',
  rumble:   'followers',
  substack: 'subscribers',
};

// Real, platform-specific context for rankings pages (mirrors Rankings.jsx's
// getPlatformIntro — kept as a separate literal here, same pattern as
// PLATFORM_NAMES/METRIC_LABELS above, since this file can't import from the
// React app).
const PLATFORM_INTROS = {
  youtube: "YouTube is the biggest platform tracked here by total watch time and advertiser spend, and subscriber counts for the largest channels are rounded to three significant figures under YouTube's own display policy. Because of that rounding, day-to-day subscriber changes for huge channels often show as zero even when the real number is moving, so total views tend to be the more accurate signal of a channel's actual growth.",
  tiktok: "TikTok rankings move faster than almost any other platform tracked here, since a single video can add millions of followers in days through the recommendation feed rather than a following a creator already had. That speed cuts both ways, and accounts can fall out of the top ranks quickly too once their reach cools off.",
  twitch: "Twitch dropped its public view-count metric in 2022, so these rankings lean on Hours Watched, the number the industry actually uses to compare channel size. Follower counts here are accurate, but they measure who clicked follow at some point, not who's actually watching right now.",
  kick: "Kick's public number is paid subscribers, not total followers, so this ranking reflects who pays to support a channel rather than its total reach, which tends to run much higher. That makes Kick's numbers look smaller than other platforms at a glance, but they're a more direct measure of a channel's paying, engaged audience.",
  bluesky: "Bluesky is one of the newest platforms tracked here, and its follower numbers are still growing fast as people migrate over from older social apps. Growth tends to come in waves tied to those migrations rather than a steady daily climb.",
  music: "This ranking uses monthly listeners, the standard way the music industry measures an artist's active audience rather than lifetime plays. It rewards artists who are getting played right now, so a big playlist placement can move an artist up the list fast, even without a new release.",
  mastodon: "Mastodon is federated, meaning accounts live on independent servers instead of one central platform, so a follower count here reflects an account's full reach across the network, not just its home server. Growth tends to be steadier and less viral than on centralized platforms.",
  rumble: "Rumble rankings track follower counts and video output for one of YouTube's biggest video alternatives. Growth here often tracks political and independent media news cycles more than entertainment trends, since a large share of Rumble's biggest channels sit in that space.",
  substack: "Substack publishes subscriber counts as approximate ranges for most newsletters rather than exact numbers, so this ranking uses the most precise figure available for each publication and falls back to that range as a floor when it isn't. Growth here tends to be slower and steadier than on video or social platforms, built on people opting into recurring email rather than a single viral moment.",
};

// Optional second metric per platform: [column, label].
const SECONDARY_METRICS = {
  youtube:  ['total_views', 'total views'],
  tiktok:   ['total_views', 'total likes'],
  bluesky:  ['total_posts', 'posts'],
  mastodon: ['total_posts', 'posts'],
  rumble:   ['total_posts', 'videos'],
  music:    ['total_views', 'total plays'],
};

const ALL_PLATFORM_LIST = 'YouTube, TikTok, Twitch, Kick, Bluesky, Mastodon, Rumble, Substack, and Music';

const SITE_URL = 'https://shinypull.com';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatNumber(num) {
  if (num === null || num === undefined) return '-';
  if (Math.abs(num) >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (Math.abs(num) >= 1e6) return (num / 1e6).toFixed(1) + 'M';
  if (Math.abs(num) >= 1e3) return (num / 1e3).toFixed(1) + 'K';
  return num.toLocaleString('en-US');
}

function formatDate(iso) {
  // Both call sites pass bare DATE values (creator_stats.recorded_at,
  // blog_posts.published_at), which JS parses as UTC midnight. This function
  // runs on Vercel's edge, whose local timezone is not guaranteed to be UTC,
  // so toLocaleDateString could roll the display back a day depending on
  // where the edge region lands relative to UTC. Force local noon so no
  // timezone offset can ever cross a day boundary — same fix as
  // toISODateTime below and the equivalent fix in Blog.jsx/BlogPost.jsx.
  const d = new Date(String(iso).includes('T') ? iso : `${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * JSON-LD datePublished/dateModified need a full ISO 8601 datetime, not a
 * bare date. Several source columns (creator_stats.recorded_at,
 * blog_posts.published_at) are Postgres DATE, not TIMESTAMPTZ, so PostgREST
 * serializes them as "2026-07-25" with no time or timezone component.
 * Google's structured data parser flags that as "invalid date format" even
 * though it's valid schema.org Date syntax on its own — Search Console
 * reported this on two creator profile pages in July 2026, but the bug is
 * sitewide: every profile page's dateModified and every blog post's
 * datePublished used the same bare-date columns. Pass through untouched if
 * it's already a full timestamp (e.g. blog_posts.updated_at).
 */
function toISODateTime(dateStr) {
  if (!dateStr) return dateStr;
  return dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00Z`;
}

/** Fetch JSON from Supabase PostgREST with the anon key (read-only via RLS). */
async function supabaseGet(path, timeoutMs = 2500) {
  const base = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!base || !key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/rest/v1/${path}`, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** POST to a PostgREST RPC. Same anon key, timeout, and graceful-null contract as supabaseGet. */
async function supabaseRpc(fn, body, timeoutMs = 2500) {
  const base = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!base || !key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Hub page content (/best/:slug)
// ---------------------------------------------------------------------------

async function getHubContent(hub) {
  // Via RPC, not rankings_cache: that table only holds each platform's global
  // top 500, which for a genre hub returns a near-empty list.
  const rows = await supabaseRpc('get_hub_creators', {
    p_platform: hub.platform,
    p_categories: hub.categories,
    p_limit: 100,
  });
  if (!rows || !rows.length) return { status: 'error' };

  const metric = METRIC_LABELS[hub.platform] || 'followers';
  const top = rows[0];
  const nounTitle = hub.noun.charAt(0).toUpperCase() + hub.noun.slice(1);

  const title = `Best ${hub.title} ${nounTitle} (${new Date().getFullYear()}) - Top ${rows.length} Ranked`;
  const description = `The best ${hub.title} ${hub.noun} ranked by ${metric}. ` +
    `#1 is ${top.display_name || top.username} with ${formatNumber(top.subscribers)} ${metric}. ` +
    `${rows.length} ${hub.noun} tracked, updated daily.`;

  let html = `<div style="max-width:720px;margin:0 auto;padding:48px 24px;font-family:ui-sans-serif,system-ui,sans-serif;color:#171717;line-height:1.65">`;
  html += `<h1 style="font-size:1.5rem;font-weight:600">Best ${esc(hub.title)} ${esc(nounTitle)}</h1>`;
  html += `<p>The biggest ${esc(hub.title)} ${esc(hub.noun)}, ranked by ${metric} and updated daily.</p>`;
  if (HUB_INTROS[hub.slug]) html += `<p>${esc(HUB_INTROS[hub.slug])}</p>`;
  html += `<ol>`;
  for (const r of rows) {
    const nm = r.display_name || r.username;
    html += `<li><a href="/${hub.platform}/${encodeURIComponent(r.username)}" style="color:#171717">${esc(nm)}</a>` +
      (r.subscribers !== null && r.subscribers !== undefined ? `, ${formatNumber(r.subscribers)} ${metric}` : '') + `</li>`;
  }
  html += `</ol>`;

  // Sibling links so a crawler landing on any hub can reach the whole set.
  const siblings = HUBS.filter(h => h.platform === hub.platform && h.slug !== hub.slug);
  if (siblings.length) {
    html += `<p>Other categories: `;
    html += siblings
      .map(h => `<a href="/best/${h.slug}" style="color:#171717">${esc(h.title)}</a>`)
      .join(' · ');
    html += `</p>`;
  }
  html += `<p><a href="/best" style="color:#171717">All categories</a> · <a href="/rankings/${hub.platform}" style="color:#171717">All ${esc(hub.platform)} rankings</a></p>`;
  html += `</div>`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Best ${hub.title} ${nounTitle}`,
    description: `The best ${hub.title} ${hub.noun} ranked by ${metric}, updated daily.`,
    numberOfItems: rows.length,
    itemListElement: rows.slice(0, 25).map((r, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: r.display_name || r.username,
      url: `${SITE_URL}/${hub.platform}/${encodeURIComponent(r.username)}`,
    })),
  };

  return { status: 'ok', title, description, html, jsonLd };
}

// ---------------------------------------------------------------------------
// Creator profile content
// ---------------------------------------------------------------------------

async function getProfileContent(platform, username) {
  const select = 'id,platform_id,username,display_name,description,category,country,created_at,profile_image,banner_image,verified,' +
    'latest_post_title,latest_post_url,latest_post_at,latest_post_thumbnail,latest_post_views,' +
    'creator_stats(subscribers,followers,total_views,total_posts,hours_watched_day,hours_watched_week,hours_watched_month,peak_viewers_day,avg_viewers_day,recorded_at)';
  const rows = await supabaseGet(
    `creators?platform=eq.${platform}&username=ilike.${encodeURIComponent(username)}` +
    `&select=${encodeURIComponent(select)}` +
    `&creator_stats.order=recorded_at.desc&creator_stats.limit=31` +
    `&order=updated_at.desc&limit=1`
  );
  if (rows === null) return { status: 'error' };          // fetch failed — fall back silently
  if (!rows.length) return { status: 'notfound' };        // real 404 — noindex the shell

  const c = rows[0];
  const stats = (c.creator_stats || []).filter(s => s.subscribers !== null && s.subscribers !== undefined);
  const platformName = PLATFORM_NAMES[platform];
  const metric = METRIC_LABELS[platform] || 'followers';
  const name = c.display_name || c.username;
  const canonicalPath = `/${platform}/${encodeURIComponent(c.username)}`;

  const latest = stats[0] || null;
  const oldest = stats.length > 1 ? stats[stats.length - 1] : null;
  const count = latest ? latest.subscribers : null;
  const growth = latest && oldest ? latest.subscribers - oldest.subscribers : null;

  // Thin-content gate (added 2026-08-19, see the AdSense content audit): a
  // profile with no bio and under 1,000 subscribers/followers is close to
  // content-free (e.g. a name and a table of the digit "1"). The page still
  // renders normally for real visitors below; this only tells Google not to
  // index it until the creator has a bio or clears the bar. Same threshold
  // as get_sitemap_eligible_creators (generateSitemap.js), kept in sync
  // deliberately so a page can't be in the sitemap yet noindexed, or vice
  // versa. Never based on existence or activity alone, only content thinness.
  const hasBio = typeof c.description === 'string' && c.description.trim().length > 0;
  const thin = !hasBio && (count === null || count < 1000);

  // Title/description with real numbers — this is what shows in the SERP.
  const title = count !== null
    ? `${name} ${platformName} Stats: ${formatNumber(count)} ${metric.replace(/^./, ch => ch.toUpperCase())} - ShinyPull`
    : `${name} ${platformName} Stats - ShinyPull`;

  let description = count !== null
    ? `${name} has ${count.toLocaleString('en-US')} ${metric} on ${platformName}.`
    : `${name}'s ${platformName} stats on ShinyPull.`;
  if (growth !== null && growth !== 0) {
    description += ` ${growth > 0 ? '+' : ''}${formatNumber(growth)} in the last 30 days.`;
  }
  description += ' Daily stats history, growth charts, and rankings.';

  // --- Visible content block -------------------------------------------------
  const sec = SECONDARY_METRICS[platform];
  const secValue = sec && latest ? latest[sec[0]] : null;

  let html = `<div style="max-width:720px;margin:0 auto;padding:48px 24px;font-family:ui-sans-serif,system-ui,sans-serif;color:#171717;line-height:1.65">`;
  html += `<h1 style="font-size:1.5rem;font-weight:600">${esc(name)} ${platformName} Stats</h1>`;

  let intro = `<strong>${esc(name)}</strong> (@${esc(c.username)})`;
  intro += count !== null
    ? ` has <strong>${count.toLocaleString('en-US')} ${metric}</strong> on ${platformName}.`
    : ` is tracked on ShinyPull for ${platformName}.`;
  if (growth !== null && growth !== 0 && oldest) {
    intro += ` In the last 30 days, ${esc(name)} ${growth > 0 ? 'gained' : 'lost'} <strong>${Math.abs(growth).toLocaleString('en-US')} ${metric}</strong>.`;
  }
  if (secValue !== null && secValue !== undefined) {
    intro += ` ${esc(name)} has ${secValue.toLocaleString('en-US')} ${sec[1]}.`;
  }
  html += `<p>${intro}</p>`;

  if (c.description) html += `<p>${esc(String(c.description).slice(0, 400))}</p>`;

  const facts = [];
  if (c.category) facts.push(`Category: ${esc(c.category)}`);
  if (c.country) facts.push(`Country: ${esc(c.country)}`);
  if (c.created_at) facts.push(`Tracked since ${formatDate(c.created_at)}`);
  if (facts.length) html += `<p>${facts.join(' · ')}</p>`;

  if (stats.length > 1) {
    const cap = s => s.replace(/^./, ch => ch.toUpperCase());
    html += `<h2 style="font-size:1.125rem;font-weight:600;margin-top:1.5rem">Daily ${cap(metric)} History</h2>`;
    html += `<table style="border-collapse:collapse;width:100%"><thead><tr>` +
      `<th style="text-align:left;padding:6px 12px 6px 0">Date</th>` +
      `<th style="text-align:right;padding:6px 0 6px 12px">${cap(metric)}</th>` +
      (sec ? `<th style="text-align:right;padding:6px 0 6px 12px">${cap(sec[1])}</th>` : '') +
      `</tr></thead><tbody>`;
    for (const s of stats.slice(0, 10)) {
      html += `<tr>` +
        `<td style="padding:4px 12px 4px 0;border-top:1px solid #e5e5e5">${formatDate(s.recorded_at)}</td>` +
        `<td style="text-align:right;padding:4px 0 4px 12px;border-top:1px solid #e5e5e5">${s.subscribers.toLocaleString('en-US')}</td>` +
        (sec ? `<td style="text-align:right;padding:4px 0 4px 12px;border-top:1px solid #e5e5e5">${s[sec[0]] !== null && s[sec[0]] !== undefined ? s[sec[0]].toLocaleString('en-US') : '-'}</td>` : '') +
        `</tr>`;
    }
    html += `</tbody></table>`;
  }

  html += `<p style="margin-top:1.5rem">` +
    `<a href="/rankings/${platform}" style="color:#171717">Top ${platformName} creators</a> · ` +
    `<a href="/compare" style="color:#171717">Compare creators</a> · ` +
    `<a href="/" style="color:#171717">ShinyPull</a></p>`;
  html += `</div>`;

  // --- JSON-LD ----------------------------------------------------------------
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    ...(latest ? { dateModified: toISODateTime(latest.recorded_at) } : {}),
    mainEntity: {
      '@type': 'Person',
      name,
      alternateName: c.username,
      ...(c.description ? { description: String(c.description).slice(0, 300) } : {}),
      ...(c.profile_image ? { image: c.profile_image } : {}),
      url: `${SITE_URL}${canonicalPath}`,
      ...(count !== null ? {
        interactionStatistic: [{
          '@type': 'InteractionCounter',
          interactionType: 'https://schema.org/FollowAction',
          userInteractionCount: count,
        }],
      } : {}),
    },
  };

  // --- Initial data payload ---------------------------------------------------
  // Embedded alongside the HTML so CreatorProfile.jsx can seed its first render
  // with real data instead of an empty loading skeleton. Without this, React's
  // createRoot().render() replaces the HTML above with a content-free spinner
  // on mount, and if a crawler's render pass samples the page during that
  // window (which at scale it does, routinely), it sees an empty shell —
  // this is what was mass-triggering Search Console's Soft 404 classification
  // across creator profile pages. Real users get a faster, flash-free first
  // paint as a side effect. Field names are camelCase to match the shape
  // CreatorProfile.jsx's `creator` state already uses; statsHistory rows stay
  // in their raw snake_case DB column form since that's what the component's
  // history/table/chart code already expects from `getCreatorStats()`.
  const initialData = {
    platform,
    dbId: c.id,
    platformId: c.platform_id,
    username: c.username,
    displayName: name,
    profileImage: c.profile_image,
    bannerImage: c.banner_image,
    verified: c.verified,
    description: c.description,
    country: c.country,
    category: c.category,
    dbCreatedAt: c.created_at,
    subscribers: latest ? latest.subscribers : null,
    followers: latest ? (latest.followers ?? latest.subscribers) : null,
    totalViews: latest ? latest.total_views : null,
    totalPosts: latest ? latest.total_posts : null,
    hoursWatchedDay: latest ? latest.hours_watched_day : null,
    hoursWatchedWeek: latest ? latest.hours_watched_week : null,
    hoursWatchedMonth: latest ? latest.hours_watched_month : null,
    peakViewersDay: latest ? latest.peak_viewers_day : null,
    avgViewersDay: latest ? latest.avg_viewers_day : null,
    latestPost: c.latest_post_at ? {
      publishedAt: c.latest_post_at,
      title: c.latest_post_title,
      url: c.latest_post_url,
      thumbnail: c.latest_post_thumbnail,
      views: c.latest_post_views,
      reactions: c.latest_post_views,
    } : null,
    statsHistory: stats,
  };

  return { status: 'ok', title, description, html, jsonLd, canonicalPath, initialData, dataId: '__CREATOR_DATA__', image: c.profile_image || null, thin };
}

// ---------------------------------------------------------------------------
// Rankings page content
// ---------------------------------------------------------------------------

async function getRankingsContent(platform) {
  const rows = await supabaseGet(
    `rankings_cache?platform=eq.${platform}&rank_type=eq.subscribers` +
    `&select=rank_position,username,display_name,subscribers` +
    `&order=rank_position.asc&limit=50`
  );
  if (!rows || !rows.length) return { status: 'error' };

  const platformName = PLATFORM_NAMES[platform];
  const metric = METRIC_LABELS[platform] || 'followers';
  const top = rows[0];

  const title = `Top ${platformName} Creators (${new Date().getFullYear()}) - ShinyPull`;
  const description = `The top ${platformName} creators ranked by ${metric}, updated daily. ` +
    `#1 is ${top.display_name || top.username} with ${formatNumber(top.subscribers)} ${metric}.`;

  let html = `<div style="max-width:720px;margin:0 auto;padding:48px 24px;font-family:ui-sans-serif,system-ui,sans-serif;color:#171717;line-height:1.65">`;
  html += `<h1 style="font-size:1.5rem;font-weight:600">Top ${platformName} Creators</h1>`;
  html += `<p>The most-${metric.includes('subscriber') ? 'subscribed' : 'followed'} ${platformName} creators, ranked by ${metric} and updated daily.</p>`;
  if (PLATFORM_INTROS[platform]) html += `<p>${esc(PLATFORM_INTROS[platform])}</p>`;
  html += `<ol>`;
  for (const r of rows) {
    const nm = r.display_name || r.username;
    html += `<li><a href="/${platform}/${encodeURIComponent(r.username)}" style="color:#171717">${esc(nm)}</a>` +
      (r.subscribers !== null && r.subscribers !== undefined ? `, ${formatNumber(r.subscribers)} ${metric}` : '') + `</li>`;
  }
  html += `</ol>`;
  html += `<p><a href="/rankings" style="color:#171717">All rankings</a> · <a href="/trending" style="color:#171717">Trending creators</a></p>`;
  html += `</div>`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Top ${platformName} Creators`,
    itemListElement: rows.slice(0, 25).map(r => ({
      '@type': 'ListItem',
      position: r.rank_position,
      name: r.display_name || r.username,
      url: `${SITE_URL}/${platform}/${encodeURIComponent(r.username)}`,
    })),
  };

  return { status: 'ok', title, description, html, jsonLd };
}

// ---------------------------------------------------------------------------
// Milestones content — real threshold-crossing events, refreshed daily by
// refresh_creator_milestones(). This is the freshest page on the site content-
// wise, so it's worth its own server-rendered content rather than meta-only.
// ---------------------------------------------------------------------------

async function getMilestonesContent() {
  const rows = await supabaseGet(
    `creator_milestones?select=platform,threshold,metric_value,crossed_at,creators(username,display_name)` +
    `&order=crossed_at.desc&order=metric_value.desc&limit=40`
  );
  if (!rows || !rows.length) return { status: 'error' };

  const title = `Creator Milestones (${new Date().getFullYear()}) - ShinyPull`;
  const description = `Real subscriber, follower, and listener thresholds crossed across ${ALL_PLATFORM_LIST}, updated daily as they happen.`;

  let html = `<div style="max-width:720px;margin:0 auto;padding:48px 24px;font-family:ui-sans-serif,system-ui,sans-serif;color:#171717;line-height:1.65">`;
  html += `<h1 style="font-size:1.5rem;font-weight:600">Creator Milestones</h1>`;
  html += `<p>Real subscriber, follower, and listener thresholds crossed, detected straight from daily snapshots. Nothing here is written by hand.</p>`;
  html += `<ol>`;
  for (const r of rows) {
    const nm = r.creators?.display_name || r.creators?.username;
    const username = r.creators?.username;
    if (!nm || !username) continue;
    const metric = METRIC_LABELS[r.platform] || 'followers';
    html += `<li><a href="/${r.platform}/${encodeURIComponent(username)}" style="color:#171717">${esc(nm)}</a>` +
      ` crossed ${formatNumber(r.threshold)} ${metric} on ${r.crossed_at}` +
      (r.metric_value !== null && r.metric_value !== undefined ? ` (${formatNumber(r.metric_value)} at the time)` : '') + `</li>`;
  }
  html += `</ol>`;
  html += `<p><a href="/rankings" style="color:#171717">All rankings</a> · <a href="/trending" style="color:#171717">Trending creators</a></p>`;
  html += `</div>`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Creator Milestones',
    description,
    itemListElement: rows.slice(0, 25).map((r, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: r.creators?.display_name || r.creators?.username,
      url: `${SITE_URL}/${r.platform}/${encodeURIComponent(r.creators?.username || '')}`,
    })),
  };

  return { status: 'ok', title, description, html, jsonLd };
}

// ---------------------------------------------------------------------------
// Blog post content
// ---------------------------------------------------------------------------

/** Minimal markdown -> HTML. Escapes everything first; supports the subset our posts use. */
function markdownToHtml(md) {
  // Drop product/creator embed directives — they only render client-side.
  // Raw {{html}} blocks are bespoke visual layout; crawlers get the prose.
  let text = md
    .replace(/\{\{html\}\}[\s\S]*?\{\{\/html\}\}/g, '')
    .replace(/\{\{product-grid\}\}[\s\S]*?\{\{\/product-grid\}\}/g, '')
    .replace(/\{\{[^}]*\}\}/g, '');

  const lines = text.split('\n');
  const out = [];
  let list = null; // 'ul' | 'ol'
  let para = [];

  const flushPara = () => {
    if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; }
  };
  const flushList = () => {
    if (list) { out.push(`</${list}>`); list = null; }
  };
  const inline = (s) => esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g, '<a href="$2" style="color:#171717">$1</a>');

  for (const raw of lines) {
    const line = raw.trimEnd();
    const t = line.trim();
    if (!t) { flushPara(); flushList(); continue; }
    const h = t.match(/^(#{2,4})\s+(.*)$/);
    if (h) {
      flushPara(); flushList();
      const level = h[1].length;
      out.push(`<h${level} style="font-weight:600;margin-top:1.5rem">${inline(h[2])}</h${level}>`);
      continue;
    }
    const li = t.match(/^[-*]\s+(.*)$/);
    const oli = t.match(/^\d+\.\s+(.*)$/);
    if (li || oli) {
      flushPara();
      const want = li ? 'ul' : 'ol';
      if (list !== want) { flushList(); out.push(`<${want}>`); list = want; }
      out.push(`<li>${inline((li || oli)[1])}</li>`);
      continue;
    }
    if (t.startsWith('>')) {
      flushPara(); flushList();
      out.push(`<blockquote style="border-left:3px solid #e5e5e5;padding-left:12px">${inline(t.replace(/^>\s?/, ''))}</blockquote>`);
      continue;
    }
    if (t.startsWith('|') || t.startsWith('![')) { flushPara(); flushList(); continue; } // skip tables/images
    para.push(t);
  }
  flushPara(); flushList();
  return out.join('\n');
}

async function getBlogContent(slug) {
  const rows = await supabaseGet(
    `blog_posts?slug=eq.${encodeURIComponent(slug)}&is_published=eq.true` +
    `&select=slug,title,description,content,author,category,read_time,published_at,updated_at,image&limit=1`
  );
  if (rows === null) return { status: 'error' };
  if (!rows.length) return { status: 'notfound' };

  const p = rows[0];
  const title = `${p.title} - ShinyPull`;
  const description = p.description || 'Creator economy insights from ShinyPull.';

  let html = `<div style="max-width:680px;margin:0 auto;padding:48px 24px;font-family:ui-sans-serif,system-ui,sans-serif;color:#171717;line-height:1.7">`;
  html += `<article><h1 style="font-size:1.5rem;font-weight:600">${esc(p.title)}</h1>`;
  if (p.published_at) html += `<p>${formatDate(p.published_at)}${p.author ? ` · ${esc(p.author)}` : ''}</p>`;
  html += markdownToHtml(p.content || '');
  html += `</article>`;
  html += `<p style="margin-top:1.5rem"><a href="/blog" style="color:#171717">More from the ShinyPull blog</a></p>`;
  html += `</div>`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: p.title,
    ...(p.description ? { description: p.description } : {}),
    ...(p.published_at ? { datePublished: toISODateTime(p.published_at) } : {}),
    ...(p.updated_at ? { dateModified: toISODateTime(p.updated_at) } : {}),
    author: { '@type': 'Organization', name: p.author || 'ShinyPull' },
    publisher: { '@type': 'Organization', name: 'ShinyPull', url: SITE_URL },
    mainEntityOfPage: `${SITE_URL}/blog/${p.slug}`,
    ...(p.image ? { image: p.image } : {}),
  };

  // Same reasoning as getProfileContent's initialData: without this,
  // BlogPost.jsx mounts into a blank loading state and React's
  // createRoot().render() wipes the server-rendered article above, so both
  // crawlers and real visitors briefly see an empty "Loading..." shell before
  // the client-side fetch re-delivers the same content a moment later. Raw DB
  // column names (not camelCase) since BlogPost.jsx's `post` state is just
  // the unmodified row from blogService.getPostBySlug()'s `select('*')`.
  const initialData = {
    slug: p.slug,
    title: p.title,
    description: p.description,
    content: p.content,
    author: p.author,
    category: p.category,
    read_time: p.read_time,
    published_at: p.published_at,
    updated_at: p.updated_at,
    image: p.image,
    is_published: true,
  };

  return { status: 'ok', title, description, html, jsonLd, canonicalPath: `/blog/${p.slug}`, initialData, dataId: '__BLOG_DATA__', image: p.image || null };
}

// ---------------------------------------------------------------------------
// Embeddable SVG stats badge — /badge/:platform/:username
//
// Creators paste `<a href="{profile}"><img src="{badge}"></a>` on their own
// sites; the anchor is a real backlink to us and the image shows a live count.
// SVG-in-<img> can't load external fonts, so the badge uses system font stacks.
// ---------------------------------------------------------------------------

const BADGE_TINTS = {
  youtube: '#ef4444', tiktok: '#ec4899', twitch: '#a855f7', kick: '#16a34a',
  bluesky: '#0ea5e9', music: '#f59e0b', mastodon: '#7c3aed', rumble: '#65a30d',
  substack: '#ea580c',
};

function badgeSvg({ name, count, metric, platform }) {
  const tint = BADGE_TINTS[platform] || '#171717';
  const displayName = name.length > 22 ? name.slice(0, 21) + '…' : name;
  const countText = count !== null ? `${formatNumber(count)} ${metric}` : 'creator stats';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="64" viewBox="0 0 240 64" role="img" aria-label="${esc(name)}: ${esc(countText)}">
  <title>${esc(name)}: ${esc(countText)} - ShinyPull</title>
  <rect x="0.5" y="0.5" width="239" height="63" rx="9.5" fill="#ffffff" stroke="#e5e5e5"/>
  <circle cx="18" cy="22" r="4" fill="${tint}"/>
  <text x="30" y="26" font-family="ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif" font-size="13" font-weight="600" fill="#171717">${esc(displayName)}</text>
  <text x="30" y="47" font-family="ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif" font-size="15" font-weight="700" fill="#171717">${esc(countText)}</text>
  <text x="228" y="57" text-anchor="end" font-family="ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif" font-size="8" font-weight="500" letter-spacing="1" fill="#a3a3a3">SHINYPULL.COM</text>
</svg>`;
}

async function handleBadge(platform, username) {
  const select = 'username,display_name,creator_stats(subscribers,recorded_at)';
  const rows = await supabaseGet(
    `creators?platform=eq.${platform}&username=ilike.${encodeURIComponent(username)}` +
    `&select=${encodeURIComponent(select)}` +
    `&creator_stats.order=recorded_at.desc&creator_stats.limit=1` +
    `&order=updated_at.desc&limit=1`
  );

  if (!rows || !rows.length) {
    // Unknown creator (or DB hiccup): neutral brand badge, short cache, 404
    // so crawlers/embedders know it's not a real resource.
    return new Response(
      badgeSvg({ name: 'ShinyPull', count: null, metric: '', platform: '' }),
      { status: 404, headers: { 'content-type': 'image/svg+xml', 'cache-control': 'public, s-maxage=300' } }
    );
  }

  const c = rows[0];
  const latest = (c.creator_stats || [])[0];
  const svg = badgeSvg({
    name: c.display_name || c.username,
    count: latest ? latest.subscribers : null,
    metric: METRIC_LABELS[platform] || 'followers',
    platform,
  });

  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml',
      // Counts move at most daily; badges can be a few hours stale.
      'cache-control': 'public, s-maxage=21600, stale-while-revalidate=86400',
      'access-control-allow-origin': '*',
    },
  });
}

// ---------------------------------------------------------------------------
// Static-page meta (unchanged behavior)
// ---------------------------------------------------------------------------

// Per-page Open Graph share cards, pre-rendered by scripts/generateOgImages.mjs
// and served as static files. Replaces the single generic card that api/og.js
// used to generate for every route, which had also drifted to advertising six
// platforms when we support nine.
//
// Order matters: the first matching entry wins, so put specific prefixes above
// general ones. Anything unmatched keeps the home card already in index.html,
// which is the correct fallback for the remaining static pages (about, faq,
// privacy and so on) rather than a bespoke image nobody will ever share.
const OG_CARDS = [
  [/^\/rankings(\/|$)/,            'rankings'],
  [/^\/best(\/|$)/,                'rankings'],
  [/^\/compare(\/|$)/,             'compare'],
  [/^\/trending(\/|$)/,            'trending'],
  [/^\/milestones(\/|$)/,          'milestones'],
  [/^\/promote(\/|$)/,             'promote'],
  [/^\/blog(\/|$)/,                'blog'],
  [/^\/youtube\/money-calculator/, 'calculator'],
];

function ogCardFor(pathname) {
  for (const [re, name] of OG_CARDS) {
    if (re.test(pathname)) return `${SITE_URL}/og/${name}.jpg`;
  }
  // Creator profiles are /:platform/:username. Matched last and by an explicit
  // platform list so it cannot swallow unrelated two-segment routes.
  if (/^\/(youtube|tiktok|twitch|kick|bluesky|music|mastodon|rumble|substack)\/[^/]+$/.test(pathname)) {
    return `${SITE_URL}/og/profile.jpg`;
  }
  return null;
}

function getMeta(pathname, searchParams) {
  // /best — hub index
  if (pathname === '/best') {
    return {
      title: 'Best Creators by Category - ShinyPull',
      description: 'Browse the best creators by category. Ranked lists of the top YouTubers and artists in every category, updated daily.',
    };
  }

  // /best/:slug — hub page. An unknown slug is a soft 404: the SPA renders its
  // NotFound, so mark it noindex rather than letting Google index an empty shell.
  const hubMatch = pathname.match(/^\/best\/([^/]+)$/);
  if (hubMatch) {
    const hub = getHub(hubMatch[1]);
    if (!hub) {
      return {
        title: 'Page Not Found - ShinyPull',
        description: 'This page does not exist.',
        noindex: true,
      };
    }
    const nounTitle = hub.noun.charAt(0).toUpperCase() + hub.noun.slice(1);
    return {
      title: `Best ${hub.title} ${nounTitle} - ShinyPull`,
      description: `The best ${hub.title} ${hub.noun} ranked by ${METRIC_LABELS[hub.platform] || 'followers'}. Updated daily.`,
    };
  }

  // /rankings or /rankings/:platform
  const rankingsMatch = pathname.match(/^\/rankings(?:\/(\w+))?$/);
  if (rankingsMatch) {
    const platform = PLATFORM_NAMES[rankingsMatch[1]];
    if (platform) {
      return {
        title: `Top ${platform} Creators - ShinyPull`,
        description: `Top ${platform} creators ranked by followers, subscribers, and growth. Updated daily.`,
      };
    }
    return {
      title: 'Top Creator Rankings - ShinyPull',
      description: `Top creators ranked by followers, subscribers, and growth across ${ALL_PLATFORM_LIST}.`,
    };
  }

  // /trending (or /trending/:platform if added later)
  if (pathname === '/trending' || pathname.startsWith('/trending/')) {
    return {
      title: 'Trending Creators - ShinyPull',
      description: 'The fastest growing creators across every platform. See who is gaining the most followers, subscribers, and listeners this month.',
    };
  }

  // /milestones — fallback meta if the content fetch fails; getMilestonesContent
  // normally overrides this with real, live numbers.
  if (pathname === '/milestones') {
    return {
      title: 'Creator Milestones - ShinyPull',
      description: `Real subscriber, follower, and listener thresholds crossed across ${ALL_PLATFORM_LIST}, updated daily as they happen.`,
    };
  }

  // /compare (with or without ?creators=...)
  if (pathname === '/compare') {
    const creatorsParam = searchParams.get('creators');
    if (creatorsParam) {
      const names = creatorsParam
        .split(',')
        .slice(0, 2)
        .map(c => c.split(':')[1])
        .filter(Boolean);
      if (names.length >= 2) {
        return {
          title: `${names[0]} vs ${names[1]} - ShinyPull`,
          description: `Compare ${names[0]} and ${names[1]} side-by-side on ShinyPull. Subscribers, followers, views, growth, and earnings.`,
        };
      }
    }
    return {
      title: 'Compare Creators - ShinyPull',
      description: `Compare social media creators side-by-side across ${ALL_PLATFORM_LIST}.`,
    };
  }

  // /search
  if (pathname === '/search') {
    return {
      title: 'Search Creators - ShinyPull',
      description: `Search for any creator across ${ALL_PLATFORM_LIST}. Live profile lookup and instant stats.`,
    };
  }

  // /youtube/money-calculator (specific tool)
  if (pathname === '/youtube/money-calculator') {
    return {
      title: 'YouTube Money Calculator - ShinyPull',
      description: 'Estimate YouTube earnings based on views, CPM, and channel data. Free YouTube revenue calculator.',
    };
  }

  // /live/:platform/:username — noindex (transient real-time pages, not useful for search)
  const liveMatch = pathname.match(/^\/live\/(\w+)\/([^/]+)$/);
  if (liveMatch && PLATFORM_NAMES[liveMatch[1]]) {
    const platform = PLATFORM_NAMES[liveMatch[1]];
    const username = decodeURIComponent(liveMatch[2]);
    return {
      title: `${username} Live Count - ShinyPull`,
      description: `Real-time live ${platform} subscriber and follower count for ${username}.`,
      noindex: true,
    };
  }

  // /:platform/:username  (creator profile) — enriched by getProfileContent when the DB is reachable
  const profileMatch = pathname.match(/^\/(\w+)\/([^/]+)$/);
  if (profileMatch && PLATFORM_NAMES[profileMatch[1]]) {
    const platform = PLATFORM_NAMES[profileMatch[1]];
    const username = decodeURIComponent(profileMatch[2]);
    return {
      title: `${username} ${platform} Stats - ShinyPull`,
      description: `${username}'s ${platform} subscriber count, follower growth, and rankings on ShinyPull.`,
    };
  }

  // /blog/:slug — enriched by getBlogContent when the DB is reachable
  const blogMatch = pathname.match(/^\/blog\/([^/]+)$/);
  if (blogMatch && blogMatch[1] !== 'admin') {
    return {
      title: 'ShinyPull Blog',
      description: 'Creator economy insights, platform trends, and analytics tips from ShinyPull.',
    };
  }

  // Static pages — keep this map exhaustive so every public route gets accurate social previews
  const staticPages = {
    '/blog':         { title: 'Blog - ShinyPull',                description: 'Creator economy insights, platform trends, and analytics tips from ShinyPull.' },
    '/dashboard':    { title: 'Dashboard - ShinyPull',           description: 'Track your followed creators and see their latest stats in one place.', noindex: true },
    '/account':      { title: 'Account - ShinyPull',             description: 'Manage your ShinyPull account and Featured Listings.', noindex: true },
    '/reports':      { title: 'Reports - ShinyPull',             description: 'Build custom reports and export creator stats across platforms.', noindex: true },
    '/about':        { title: 'About - ShinyPull',               description: `ShinyPull tracks creator stats across ${ALL_PLATFORM_LIST}. Real data, updated daily.` },
    '/contact':      { title: 'Contact - ShinyPull',             description: 'Get in touch with the ShinyPull team. We respond within 24-48 hours.' },
    '/faq':          { title: 'FAQ - ShinyPull',                 description: 'Frequently asked questions about ShinyPull, creator stats, and how we track the creator economy.' },
    '/methodology':  { title: 'Methodology - ShinyPull',         description: `How ShinyPull tracks creator statistics across ${ALL_PLATFORM_LIST}.` },
    '/support':      { title: 'Support ShinyPull',               description: 'Support the data behind ShinyPull. Donations help cover operating costs.' },
    '/promote':      { title: 'Featured Listings - ShinyPull',   description: 'Get your creator featured in our daily rankings. From $49/mo. Cancel anytime.' },
    '/refunds':      { title: 'Refund Policy - ShinyPull',       description: "ShinyPull's refund policy for Featured Listings." },
    '/privacy':      { title: 'Privacy Policy - ShinyPull',      description: "ShinyPull's privacy policy." },
    '/terms':        { title: 'Terms of Service - ShinyPull',    description: "ShinyPull's terms of service." },
    '/reset-password': { title: 'Reset Password - ShinyPull',    description: 'Reset your ShinyPull account password.', noindex: true },
    '/auth/sign-in':   { title: 'Sign In - ShinyPull',           description: 'Sign in to ShinyPull to follow creators and build a personal dashboard.', noindex: true },
    '/auth/sign-up':   { title: 'Sign Up - ShinyPull',           description: 'Create a free ShinyPull account to follow creators across nine platforms.', noindex: true },
  };
  if (staticPages[pathname]) return staticPages[pathname];

  return null; // Use index.html defaults for / and other pages
}

// ---------------------------------------------------------------------------
// Middleware entry
// ---------------------------------------------------------------------------

export default async function middleware(request) {
  const url = new URL(request.url);

  // SVG badge endpoint — returns an image, never HTML.
  const badgeMatch = url.pathname.match(/^\/badge\/(\w+)\/([^/]+)$/);
  if (badgeMatch && PLATFORM_NAMES[badgeMatch[1]]) {
    return handleBadge(badgeMatch[1], decodeURIComponent(badgeMatch[2]));
  }

  const meta = getMeta(url.pathname, url.searchParams);

  if (!meta) return; // No modification needed — fall through to normal serving

  // CONTENT layer — figure out whether this route gets server-rendered content.
  let content = null;
  const profileMatch = url.pathname.match(/^\/(\w+)\/([^/]+)$/);
  const rankingsMatch = url.pathname.match(/^\/rankings\/(\w+)$/);
  const blogMatch = url.pathname.match(/^\/blog\/([^/]+)$/);
  const hubMatch = url.pathname.match(/^\/best\/([^/]+)$/);

  try {
    if (hubMatch) {
      const hub = getHub(hubMatch[1]);
      // Unknown slug: getMeta already returned noindex; no content to build.
      if (hub) content = await getHubContent(hub);
    } else if (rankingsMatch && PLATFORM_NAMES[rankingsMatch[1]]) {
      content = await getRankingsContent(rankingsMatch[1]);
    } else if (url.pathname === '/milestones') {
      content = await getMilestonesContent();
    } else if (blogMatch && blogMatch[1] !== 'admin') {
      content = await getBlogContent(decodeURIComponent(blogMatch[1]));
    } else if (
      profileMatch && PLATFORM_NAMES[profileMatch[1]] &&
      url.pathname !== '/youtube/money-calculator'
    ) {
      content = await getProfileContent(profileMatch[1], decodeURIComponent(profileMatch[2]));
    }
  } catch {
    content = null; // any unexpected error → meta-only fallback
  }

  // Fetch the static index.html (the .html extension excludes it from the matcher,
  // so this fetch will NOT re-enter middleware — no infinite loop)
  let html;
  try {
    const res = await fetch(new URL('/index.html', url.origin));
    if (!res.ok) return; // Graceful fallback: serve unmodified if fetch fails
    html = await res.text();
  } catch {
    return;
  }

  // Content-enriched meta wins over the generic route meta.
  const title = content?.status === 'ok' ? content.title : meta.title;
  const description = content?.status === 'ok' ? content.description : meta.description;
  const canonicalUrl = `${SITE_URL}${content?.status === 'ok' && content.canonicalPath ? content.canonicalPath : url.pathname}`;
  // Share card precedence: a blog post's own cover, else the card for this
  // route, else whatever index.html already carries (the home card).
  const image = (content?.status === 'ok' ? content.image : null) || ogCardFor(url.pathname);

  // Inject page-specific values via string replacement
  html = html
    .replace(/(<title>)[^<]*(<\/title>)/, `$1${esc(title)}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/,        `$1${esc(title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/,  `$1${esc(description)}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/,          `$1${canonicalUrl}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/,       `$1${esc(title)}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${esc(description)}$2`)
    .replace(/(<meta name="description" content=")[^"]*(")/,         `$1${esc(description)}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/,               `$1${canonicalUrl}$2`);

  // Real post/profile image wins over the generic /api/og fallback when one exists.
  if (image) {
    html = html
      .replace(/(<meta property="og:image" content=")[^"]*(")/, `$1${esc(image)}$2`)
      .replace(/(<meta name="twitter:image" content=")[^"]*(")/, `$1${esc(image)}$2`);
  }

  // Server-rendered content block into the SPA mount point. React 18's
  // createRoot().render() replaces these children on hydration.
  if (content?.status === 'ok' && content.html) {
    html = html.replace('<div id="root"></div>', `<div id="root">${content.html}</div>`);
    if (content.jsonLd) {
      html = html.replace(
        '</head>',
        `  <script type="application/ld+json">${JSON.stringify(content.jsonLd).replace(/</g, '\\u003c')}</script>\n  </head>`
      );
    }
    // Initial data payload (creator profiles + blog posts) — see the comment
    // on `initialData` in getProfileContent/getBlogContent for why this
    // exists. `dataId` picks the script tag id each page's component reads
    // (CreatorProfile.jsx reads __CREATOR_DATA__, BlogPost.jsx reads
    // __BLOG_DATA__) so the two payload shapes never collide. Escaped the
    // same way as the JSON-LD block above to prevent a </script> breakout.
    if (content.initialData && content.dataId) {
      html = html.replace(
        '</head>',
        `  <script type="application/json" id="${content.dataId}">${JSON.stringify(content.initialData).replace(/</g, '\\u003c')}</script>\n  </head>`
      );
    }
  }

  // noindex: private/transient pages, profile/blog URLs that definitively
  // don't exist in the DB (otherwise Google indexes empty soft-404 shells),
  // and thin creator profiles (no bio, under 1,000 subscribers/followers —
  // see getProfileContent's `thin` computation and the AdSense content audit).
  if (meta.noindex || content?.status === 'notfound' || content?.thin) {
    html = html.replace('</head>', '  <meta name="robots" content="noindex, follow" />\n  </head>');
  }

  // Blog posts get a much shorter stale-while-revalidate window than other
  // DB-backed pages. Unlike profile/rankings pages (always regenerated from
  // live DB data, no "wrong first draft" possible), a freshly published blog
  // post is routinely still being tweaked (image swaps, copy fixes) in the
  // minutes right after it goes live. The generic 86400s (24h) swr window
  // meant an external cache-respecting client (e.g. a social platform's link
  // unfurl bot) that fetched the page once, before an edit landed, could keep
  // serving that stale snapshot for up to a full day before checking again,
  // with no way for us to force a refresh (X retired its public Card
  // Validator). Confirmed 2026-07-31: a blog post's og:image was edited 3x
  // shortly after publish, and X's link-preview card stayed stuck on
  // (apparently) the first, unfinished attempt for the rest of the session
  // despite every edit being immediately correct at direct fetch. 3600s (1h)
  // still meaningfully cuts Supabase read load while bounding the worst case.
  const isBlogPost = content?.status === 'ok' && content.canonicalPath?.startsWith('/blog/');

  return new Response(html, {
    headers: {
      'content-type': 'text/html;charset=UTF-8',
      // DB-backed pages cache longer at the edge (Vercel purges on deploy);
      // meta-only pages keep the short TTL.
      'cache-control': content?.status === 'ok'
        ? `public, s-maxage=300, stale-while-revalidate=${isBlogPost ? 3600 : 86400}`
        : 'public, s-maxage=60, stale-while-revalidate=3600',
    },
  });
}
