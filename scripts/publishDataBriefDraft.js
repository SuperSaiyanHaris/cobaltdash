import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const content = readFileSync('temp_world_cup_data_brief.md', 'utf-8');

const post = {
  slug: 'world-cup-creator-economy-data-brief',
  title: 'The World Cup Is Eating the Creator Economy. We Have the Numbers.',
  description:
    'FIFA added 2.67 billion YouTube views in 30 days. Neymar gained 5.8M TikTok followers. Real data from 41,413 tracked creators on what the World Cup is doing to every platform.',
  content,
  category: 'Analytics',
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

console.log('Draft saved. Preview: /blog/world-cup-creator-economy-data-brief?preview=1');
