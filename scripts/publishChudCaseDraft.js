import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const content = readFileSync('temp_chud_case_blog.md', 'utf-8');

const post = {
  slug: 'chud-the-builder-case-creator-economy-risk',
  title: 'The Chud the Builder Case and the New Risk Math of Creator Controversy',
  description:
    'A Tennessee courthouse shooting case involving streamer Chud the Builder shows how fast outrage-driven creator content can collide with legal and business reality.',
  content,
  category: 'Industry Insights',
  author: 'ShinyPull Team',
  read_time: '5 min read',
  is_published: false,
  published_at: null,
};

const { error } = await supabase.from('blog_posts').upsert(post, { onConflict: 'slug' });

if (error) {
  console.error('Error creating draft:', error);
  process.exit(1);
}

console.log('Draft saved: /blog/chud-the-builder-case-creator-economy-risk');
