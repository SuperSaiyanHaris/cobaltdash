// Reusable blog updater: node scripts/updatePostContent.js <slug> <tempfile> [--title "..."] [--desc "..."]
// Only updates content (and optionally title/description). Never touches
// is_published or published_at, so live posts stay live and drafts stay drafts.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const [slug, tempfile] = process.argv.slice(2);
if (!slug || !tempfile) {
  console.error('Usage: node scripts/updatePostContent.js <slug> <tempfile> [--title "..."] [--desc "..."]');
  process.exit(1);
}

const args = process.argv.slice(4);
const getFlag = (name) => {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : undefined;
};

const update = { content: readFileSync(tempfile, 'utf-8'), updated_at: new Date().toISOString() };
const title = getFlag('--title');
const desc = getFlag('--desc');
if (title) update.title = title;
if (desc) update.description = desc;

const { data, error } = await supabase
  .from('blog_posts')
  .update(update)
  .eq('slug', slug)
  .select('slug, is_published')
  .single();

if (error) { console.error('Error:', error.message); process.exit(1); }
console.log(`Updated ${data.slug} (${data.is_published ? 'LIVE' : 'draft'}). Preview: /blog/${data.slug}${data.is_published ? '' : '?preview=1'}`);
