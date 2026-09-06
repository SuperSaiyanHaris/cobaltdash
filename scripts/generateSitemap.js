/**
 * Generate segmented sitemaps for SEO.
 * Run: node scripts/generateSitemap.js  (also runs automatically in `npm run build`)
 *
 * Why segmented: a single 40K-URL sitemap from a low-authority domain gives Google
 * no crawl-priority signal. Instead we emit a sitemap INDEX (sitemap.xml) pointing at:
 *   - sitemap-core.xml      static pages + rankings + blog posts (~100 URLs, crawl first)
 *   - sitemap-top.xml       creators currently in rankings_cache (the head — a few
 *                           thousand pages with real search demand)
 *   - sitemap-creators-N.xml  everything else, chunked 10K per file (the long tail)
 * Segmentation also makes GSC's per-sitemap "discovered / indexed" counts diagnostic:
 * you can see whether the head is indexed while the tail lags, instead of one opaque 40K blob.
 *
 * robots.txt keeps pointing at /sitemap.xml — a sitemap index is valid there.
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';
import { config } from 'dotenv';
import { HUBS } from '../src/lib/hubs.js';

config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

const SITE_URL = 'https://shinypull.com';
const TODAY = new Date().toISOString().split('T')[0];
const CHUNK_SIZE = 10000;

// Static pages with their priority and change frequency
const staticPages = [
  { url: '/', lastmod: TODAY, changefreq: 'daily', priority: 1.0 },
  { url: '/blog', lastmod: TODAY, changefreq: 'daily', priority: 0.9 },
  { url: '/rankings', lastmod: TODAY, changefreq: 'daily', priority: 0.9 },
  { url: '/rankings/youtube', lastmod: TODAY, changefreq: 'daily', priority: 0.85 },
  { url: '/rankings/twitch', lastmod: TODAY, changefreq: 'daily', priority: 0.85 },
  { url: '/rankings/kick', lastmod: TODAY, changefreq: 'daily', priority: 0.85 },
  { url: '/rankings/tiktok', lastmod: TODAY, changefreq: 'daily', priority: 0.85 },
  { url: '/rankings/bluesky', lastmod: TODAY, changefreq: 'daily', priority: 0.85 },
  { url: '/rankings/music',   lastmod: TODAY, changefreq: 'daily', priority: 0.85 },
  { url: '/rankings/mastodon',lastmod: TODAY, changefreq: 'daily', priority: 0.85 },
  { url: '/rankings/substack',lastmod: TODAY, changefreq: 'daily', priority: 0.85 },
  { url: '/best', lastmod: TODAY, changefreq: 'weekly', priority: 0.85 },
  // One entry per hub, generated from the shared taxonomy so a new hub can
  // never be added to the app and forgotten here.
  ...HUBS.map((h) => ({
    url: `/best/${h.slug}`,
    lastmod: TODAY,
    changefreq: 'daily',
    priority: 0.8,
  })),
  { url: '/compare', lastmod: TODAY, changefreq: 'weekly', priority: 0.8 },
  { url: '/trending', lastmod: TODAY, changefreq: 'daily', priority: 0.85 },
  { url: '/milestones', lastmod: TODAY, changefreq: 'daily', priority: 0.85 },
  { url: '/youtube/money-calculator', lastmod: TODAY, changefreq: 'monthly', priority: 0.8 },
  { url: '/search', lastmod: TODAY, changefreq: 'weekly', priority: 0.7 },
  { url: '/about', lastmod: TODAY, changefreq: 'monthly', priority: 0.6 },
  { url: '/contact', lastmod: TODAY, changefreq: 'monthly', priority: 0.5 },
  { url: '/support', lastmod: TODAY, changefreq: 'monthly', priority: 0.5 },
  { url: '/faq', lastmod: TODAY, changefreq: 'monthly', priority: 0.6 },
  { url: '/methodology', lastmod: TODAY, changefreq: 'monthly', priority: 0.5 },
  { url: '/privacy', lastmod: TODAY, changefreq: 'monthly', priority: 0.3 },
  { url: '/terms', lastmod: TODAY, changefreq: 'monthly', priority: 0.3 },
];

function formatDate(date) {
  return new Date(date).toISOString().split('T')[0];
}

function escapeXml(unsafe) {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function generateSitemapXML(urls) {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n';

  urls.forEach(({ url, lastmod, changefreq, priority, image }) => {
    xml += '  <url>\n';
    xml += `    <loc>${SITE_URL}${escapeXml(url)}</loc>\n`;
    if (lastmod) {
      xml += `    <lastmod>${formatDate(lastmod)}</lastmod>\n`;
    }
    if (changefreq) {
      xml += `    <changefreq>${changefreq}</changefreq>\n`;
    }
    if (priority) {
      xml += `    <priority>${priority}</priority>\n`;
    }
    if (image) {
      xml += '    <image:image>\n';
      xml += `      <image:loc>${escapeXml(image)}</image:loc>\n`;
      xml += '    </image:image>\n';
    }
    xml += '  </url>\n';
  });

  xml += '</urlset>';
  return xml;
}

function generateIndexXML(files) {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  files.forEach((file) => {
    xml += '  <sitemap>\n';
    xml += `    <loc>${SITE_URL}/${file}</loc>\n`;
    xml += `    <lastmod>${TODAY}</lastmod>\n`;
    xml += '  </sitemap>\n';
  });
  xml += '</sitemapindex>';
  return xml;
}

async function generateSitemap() {
  console.log('🗺️ Generating segmented sitemaps...\n');

  // ---- Core: static pages + blog posts -------------------------------------
  const coreUrls = [...staticPages];

  console.log('📝 Fetching blog posts...');
  const { data: posts, error: postsError } = await supabase
    .from('blog_posts')
    .select('slug, updated_at, published_at, image')
    .eq('is_published', true)
    .order('published_at', { ascending: false });

  if (postsError) {
    console.error('❌ Error fetching blog posts:', postsError);
  } else {
    console.log(`   Found ${posts.length} blog posts`);
    posts.forEach(post => {
      coreUrls.push({
        url: `/blog/${post.slug}`,
        lastmod: post.updated_at || post.published_at,
        changefreq: 'weekly',
        priority: 0.8,
        ...(post.image ? { image: post.image } : {}),
      });
    });
  }

  // ---- Top: creators currently in rankings_cache (the head) ----------------
  // Capped at TOP_TIER_RANK_LIMIT per platform (added 2026-09-06). This tier
  // used to be implicitly capped by rankings_cache's own 500-per-platform
  // limit on the 'subscribers' rank_type. That limit was intentionally
  // removed 2026-08-28 so every tracked creator gets a real rank badge on
  // their own profile page (see CLAUDE.md's "CREATOR PROFILE REQUEST
  // WATERFALL" section) — rankings_cache now holds ~46K rows for this
  // rank_type instead of ~4,500. Nothing here changed to match, so this
  // fetch silently pulled in nearly the entire creator base overnight,
  // ballooning sitemap-top.xml from ~4,500 to 48,997 URLs. That defeated
  // the whole point of a segmented "head" sitemap (a "priority 0.7, daily"
  // signal on the site's full long tail is not a priority signal at all)
  // and was the direct cause of Search Console's "Discovered - currently
  // not indexed" count jumping from ~7.5K to ~19K starting the same week.
  // The fix belongs here, not in rankings_cache, since the per-profile rank
  // badge is a real, wanted feature — this tier just needs its own notion
  // of "the head" again, independent of how many rows the table now holds.
  console.log('🏆 Fetching ranked creators (priority tier)...');
  const TOP_TIER_RANK_LIMIT = 500;
  const topKeys = new Set();
  const topUrls = [];
  {
    let page = 0;
    const pageSize = 1000;
    let more = true;
    while (more) {
      const { data: rows, error } = await supabase
        .from('rankings_cache')
        .select('platform, username, rank_position')
        .eq('rank_type', 'subscribers')
        .lte('rank_position', TOP_TIER_RANK_LIMIT)
        .order('platform', { ascending: true })
        .order('rank_position', { ascending: true })
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (error) {
        console.error('❌ Error fetching rankings_cache:', error);
        break;
      }
      (rows || []).forEach(r => {
        if (!r.username) return;
        const key = `${r.platform}/${r.username.toLowerCase()}`;
        if (topKeys.has(key)) return;
        topKeys.add(key);
        topUrls.push({
          url: `/${r.platform}/${r.username}`,
          lastmod: TODAY,          // ranked creators get fresh stats daily
          changefreq: 'daily',
          priority: 0.7,
        });
      });
      more = rows && rows.length === pageSize;
      page++;
    }
    console.log(`   Found ${topUrls.length} ranked creators`);
  }

  // ---- Tail: every other creator, chunked ----------------------------------
  // Thin-content gate (added 2026-08-19, see the AdSense content audit): a
  // creator with no bio and under 1,000 subscribers/followers renders as a
  // near-empty page (e.g. a name and a table of the digit "1"). We don't stop
  // tracking or hide these creators anywhere else on the site, we just stop
  // actively submitting them to Google until they clear the bar. Sourced from
  // get_sitemap_eligible_creators (SQL, same LATERAL-latest-stats pattern as
  // get_hub_creators) instead of a plain .select() so the filter runs
  // server-side against real subscriber data, not just what's on this table.
  // middleware.js applies the identical rule as a noindex tag on the page
  // itself, so a stale/cached copy of this sitemap fails safe.
  console.log('👤 Fetching indexable creator profiles...');
  let allCreators = [];
  let afterId = null;
  const creatorPageSize = 1000;
  let hasMoreCreators = true;

  // Keyset pagination (id > afterId), not OFFSET: OFFSET forces Postgres to
  // evaluate the LATERAL join in get_sitemap_eligible_creators for every
  // skipped row just to count past it, which hit the REST 60s statement
  // timeout around row 20000 in testing. Seeking off the last-seen id via
  // the primary key index keeps every page equally fast regardless of depth.
  while (hasMoreCreators) {
    const { data: creators, error: creatorsError } = await supabase
      .rpc('get_sitemap_eligible_creators', {
        p_limit: creatorPageSize,
        p_after_id: afterId,
      });

    if (creatorsError) {
      console.error('❌ Error fetching creators:', creatorsError);
      break;
    }

    if (creators && creators.length > 0) {
      allCreators = allCreators.concat(creators);
      afterId = creators[creators.length - 1].id;
      hasMoreCreators = creators.length === creatorPageSize;
    } else {
      hasMoreCreators = false;
    }
  }

  const tailUrls = [];
  {
    const seen = new Set();
    allCreators.forEach(creator => {
      const key = `${creator.platform}/${creator.username.toLowerCase()}`;
      if (seen.has(key) || topKeys.has(key)) return;
      seen.add(key);
      tailUrls.push({
        url: `/${creator.platform}/${creator.username}`,
        lastmod: creator.updated_at,
        changefreq: 'weekly',
        priority: 0.4,
      });
    });
  }
  console.log(`   ${allCreators.length} creators cleared the thin-content gate, ${tailUrls.length} in long tail`);

  // ---- Write files ----------------------------------------------------------
  const files = [];

  writeFileSync('public/sitemap-core.xml', generateSitemapXML(coreUrls));
  files.push('sitemap-core.xml');

  writeFileSync('public/sitemap-top.xml', generateSitemapXML(topUrls));
  files.push('sitemap-top.xml');

  for (let i = 0; i < tailUrls.length; i += CHUNK_SIZE) {
    const n = Math.floor(i / CHUNK_SIZE) + 1;
    writeFileSync(`public/sitemap-creators-${n}.xml`, generateSitemapXML(tailUrls.slice(i, i + CHUNK_SIZE)));
    files.push(`sitemap-creators-${n}.xml`);
  }

  writeFileSync('public/sitemap.xml', generateIndexXML(files));

  console.log('\n✅ Sitemaps generated successfully!');
  console.log(`   Index: public/sitemap.xml -> ${files.length} sitemaps`);
  console.log(`   Core: ${coreUrls.length} URLs · Top: ${topUrls.length} URLs · Tail: ${tailUrls.length} URLs`);
  console.log(`   Submit to Google Search Console: ${SITE_URL}/sitemap.xml`);
}

generateSitemap().catch(console.error);
