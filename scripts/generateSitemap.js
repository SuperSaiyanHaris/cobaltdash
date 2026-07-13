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
  { url: '/rankings/rumble',  lastmod: TODAY, changefreq: 'daily', priority: 0.85 },
  { url: '/rankings/substack',lastmod: TODAY, changefreq: 'daily', priority: 0.85 },
  { url: '/compare', lastmod: TODAY, changefreq: 'weekly', priority: 0.8 },
  { url: '/trending', lastmod: TODAY, changefreq: 'daily', priority: 0.85 },
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
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  urls.forEach(({ url, lastmod, changefreq, priority }) => {
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
    .select('slug, updated_at, published_at')
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
      });
    });
  }

  // ---- Top: creators currently in rankings_cache (the head) ----------------
  console.log('🏆 Fetching ranked creators (priority tier)...');
  const topKeys = new Set();
  const topUrls = [];
  {
    let page = 0;
    const pageSize = 1000;
    let more = true;
    while (more) {
      const { data: rows, error } = await supabase
        .from('rankings_cache')
        .select('platform, username')
        .eq('rank_type', 'subscribers')
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
  console.log('👤 Fetching all creator profiles...');
  let allCreators = [];
  let creatorPage = 0;
  const creatorPageSize = 1000;
  let hasMoreCreators = true;

  while (hasMoreCreators) {
    const { data: creators, error: creatorsError } = await supabase
      .from('creators')
      .select('platform, username, updated_at')
      .not('username', 'is', null)
      .order('updated_at', { ascending: false })
      .range(creatorPage * creatorPageSize, (creatorPage + 1) * creatorPageSize - 1);

    if (creatorsError) {
      console.error('❌ Error fetching creators:', creatorsError);
      break;
    }

    if (creators && creators.length > 0) {
      allCreators = allCreators.concat(creators);
      creatorPage++;
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
  console.log(`   ${allCreators.length} creators total, ${tailUrls.length} in long tail`);

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
