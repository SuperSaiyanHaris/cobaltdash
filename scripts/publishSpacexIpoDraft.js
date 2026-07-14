import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const content = readFileSync('temp_spacex_ipo_attention_blog.md', 'utf-8');

const post = {
  slug: 'spacex-ipo-attention-map-creator-playbook',
  title: 'SpaceX IPO Frenzy Is Reshuffling Creator Attention in Real Time',
  description:
    'SpaceX IPO demand is going viral, but the bigger story is how finance, tech, and commentary creators are splitting the audience across platforms.',
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

console.log('Draft saved: /blog/spacex-ipo-attention-map-creator-playbook');
