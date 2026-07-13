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

export const config = {
  matcher: [
    // All paths except API routes and static assets (files with extensions).
    '/((?!api|.*\\..*).*)',
    // Usernames containing dots (Bluesky handles, Mastodon instances, TikTok/YouTube
    // handles with periods) are excluded by the pattern above, so match profile and
    // live-count routes explicitly. :username matches any non-slash chars incl. dots.
    '/:platform(youtube|tiktok|twitch|kick|bluesky|music|mastodon|rumble|substack)/:username',
    '/live/:platform(youtube|tiktok|twitch|kick|bluesky|music|mastodon|rumble|substack)/:username',
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
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

// ---------------------------------------------------------------------------
// Creator profile content
// ---------------------------------------------------------------------------

async function getProfileContent(platform, username) {
  const select = 'username,display_name,description,category,country,created_at,profile_image,' +
    'creator_stats(subscribers,total_views,total_posts,recorded_at)';
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
    ...(latest ? { dateModified: latest.recorded_at } : {}),
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

  return { status: 'ok', title, description, html, jsonLd, canonicalPath };
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
  html += `<ol>`;
  for (const r of rows) {
    const nm = r.display_name || r.username;
    html += `<li><a href="/${platform}/${encodeURIComponent(r.username)}" style="color:#171717">${esc(nm)}</a>` +
      (r.subscribers !== null && r.subscribers !== undefined ? ` — ${formatNumber(r.subscribers)} ${metric}` : '') + `</li>`;
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
// Blog post content
// ---------------------------------------------------------------------------

/** Minimal markdown -> HTML. Escapes everything first; supports the subset our posts use. */
function markdownToHtml(md) {
  // Drop product/creator embed directives — they only render client-side.
  let text = md
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
    `&select=slug,title,description,content,author,published_at,updated_at&limit=1`
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
    ...(p.published_at ? { datePublished: p.published_at } : {}),
    ...(p.updated_at ? { dateModified: p.updated_at } : {}),
    author: { '@type': 'Organization', name: p.author || 'ShinyPull' },
    publisher: { '@type': 'Organization', name: 'ShinyPull', url: SITE_URL },
    mainEntityOfPage: `${SITE_URL}/blog/${p.slug}`,
  };

  return { status: 'ok', title, description, html, jsonLd, canonicalPath: `/blog/${p.slug}` };
}

// ---------------------------------------------------------------------------
// Static-page meta (unchanged behavior)
// ---------------------------------------------------------------------------

function getMeta(pathname, searchParams) {
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
  };
  if (staticPages[pathname]) return staticPages[pathname];

  return null; // Use index.html defaults for / and other pages
}

// ---------------------------------------------------------------------------
// Middleware entry
// ---------------------------------------------------------------------------

export default async function middleware(request) {
  const url = new URL(request.url);
  const meta = getMeta(url.pathname, url.searchParams);

  if (!meta) return; // No modification needed — fall through to normal serving

  // CONTENT layer — figure out whether this route gets server-rendered content.
  let content = null;
  const profileMatch = url.pathname.match(/^\/(\w+)\/([^/]+)$/);
  const rankingsMatch = url.pathname.match(/^\/rankings\/(\w+)$/);
  const blogMatch = url.pathname.match(/^\/blog\/([^/]+)$/);

  try {
    if (rankingsMatch && PLATFORM_NAMES[rankingsMatch[1]]) {
      content = await getRankingsContent(rankingsMatch[1]);
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
  }

  // noindex: private/transient pages, and profile/blog URLs that definitively
  // don't exist in the DB (otherwise Google indexes empty soft-404 shells).
  if (meta.noindex || content?.status === 'notfound') {
    html = html.replace('</head>', '  <meta name="robots" content="noindex, follow" />\n  </head>');
  }

  return new Response(html, {
    headers: {
      'content-type': 'text/html;charset=UTF-8',
      // DB-backed pages cache longer at the edge (Vercel purges on deploy);
      // meta-only pages keep the short TTL.
      'cache-control': content?.status === 'ok'
        ? 'public, s-maxage=300, stale-while-revalidate=86400'
        : 'public, s-maxage=60, stale-while-revalidate=3600',
    },
  });
}
