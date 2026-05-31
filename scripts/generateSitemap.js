/**
 * Generate sitemap.xml for SEO
 * Run: node scripts/generateSitemap.js
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

async function generateSitemap() {
  console.log('🗺️ Generating sitemap.xml...\n');

  const urls = [...staticPages];

  // Fetch blog posts
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
      urls.push({
        url: `/blog/${post.slug}`,
        lastmod: post.updated_at || post.published_at,
        changefreq: 'weekly',
        priority: 0.8,
      });
    });
  }

  // Fetch creator profiles (paginate to get all)
  console.log('👤 Fetching creator profiles...');
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

  if (allCreators.length > 0) {
    console.log(`   Found ${allCreators.length} creator profiles`);
    const seen = new Set();
    allCreators.forEach(creator => {
      const key = `${creator.platform}/${creator.username.toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);
      urls.push({
        url: `/${creator.platform}/${creator.username}`,
        lastmod: creator.updated_at,
        // Profile pages change at most daily but for 24K URLs Google interprets
        // "daily" as a crawl request we can't satisfy. "weekly" + priority 0.5
        // signals these are long-tail and not high-priority for re-crawl.
        changefreq: 'weekly',
        priority: 0.5,
      });
    });
  }

  // Generate XML
  const xml = generateSitemapXML(urls);

  // Write to public folder
  writeFileSync('public/sitemap.xml', xml);

  console.log('\n✅ Sitemap generated successfully!');
  console.log(`   Total URLs: ${urls.length}`);
  console.log(`   Location: public/sitemap.xml`);
  console.log(`   Submit to Google Search Console: ${SITE_URL}/sitemap.xml`);
}

generateSitemap().catch(console.error);
