import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const content = readFileSync('temp_world_cup_2026_blog.md', 'utf-8');

const post = {
  slug: 'world-cup-2026-creators-attention-race',
  title: 'World Cup Week Is Here, and the Creator Attention Race Is On',
  description:
    'The 2026 World Cup starts this week with 48 teams and 104 matches. Here is what that means for creator growth, platform momentum, and how to track it across ShinyPull.',
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

console.log('Draft saved: /blog/world-cup-2026-creators-attention-race');
