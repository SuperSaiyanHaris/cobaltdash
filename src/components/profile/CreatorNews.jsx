// "News" tab on a creator profile: the ShinyPull stories that name this
// creator. The newest story leads as a wide card; the rest sit in a grid.
// Cards match the blog page (same colors, dates and quiet hover), so a story
// looks the same here as it does on /blog.
import { Link } from 'react-router-dom';
import { Calendar, Clock, ArrowRight } from 'lucide-react';
import { resizedBlogImageUrl, BLOG_CARD_TARGET } from '../../lib/blogImageUrl';
import { getCatColors, isNewPost, formatPostDate } from '../../lib/blogUi';

function Pill({ category }) {
  if (!category) return null;
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${getCatColors(category).pill}`}>
      {category}
    </span>
  );
}

function Meta({ post }) {
  return (
    <div className="flex items-center gap-4 text-xs text-neutral-600">
      <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />{formatPostDate(post.published_at)}</span>
      {post.read_time && <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />{post.read_time}</span>}
    </div>
  );
}

function NewBadge() {
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
      New
    </span>
  );
}

export default function CreatorNews({ posts, name }) {
  if (!posts?.length) return null;
  const [lead, ...rest] = posts;

  return (
    <div className="mt-4">
      <p className="text-sm text-neutral-700 mb-4">
        {posts.length === 1 ? 'One story' : `${posts.length} stories`} on the ShinyPull blog {posts.length === 1 ? 'features' : 'feature'} {name}.
      </p>

      <Link to={`/blog/${lead.slug}`} className="group block">
        <article className="bg-white rounded-xl border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden hover:border-neutral-300 transition-colors duration-200">
          <div className="md:flex">
            {lead.image && (
              <div className="md:w-[46%] aspect-[16/9] md:aspect-auto md:min-h-[240px] overflow-hidden bg-neutral-100 flex-shrink-0">
                <img
                  src={resizedBlogImageUrl(lead.image, 1200, 675)}
                  alt={lead.title}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="p-5 sm:p-7 flex flex-col justify-center min-w-0">
              <div className="flex items-center gap-2 mb-3">
                <Pill category={lead.category} />
                {isNewPost(lead.published_at) && <NewBadge />}
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-neutral-900 leading-snug text-balance mb-2">{lead.title}</h3>
              <p className="text-sm text-neutral-700 leading-relaxed line-clamp-3 mb-4">{lead.description}</p>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <Meta post={lead} />
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-neutral-900">
                  Read the story <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </div>
          </div>
        </article>
      </Link>

      {rest.length > 0 && (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 mt-4">
          {rest.map((post) => (
            <Link key={post.slug} to={`/blog/${post.slug}`} className="group">
              <article className="bg-white rounded-xl border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden hover:border-neutral-300 transition-colors duration-200 h-full flex flex-col">
                {post.image && (
                  <div className="relative aspect-[16/9] bg-neutral-100 overflow-hidden">
                    <img
                      src={resizedBlogImageUrl(post.image, BLOG_CARD_TARGET.width, BLOG_CARD_TARGET.height)}
                      alt={post.title}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                    {isNewPost(post.published_at) && (
                      <span className="absolute top-3 left-3 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500 text-white shadow">New</span>
                    )}
                  </div>
                )}
                <div className="p-4 flex flex-col flex-1">
                  <div className="mb-2"><Pill category={post.category} /></div>
                  <h3 className="text-[15px] font-bold text-neutral-900 leading-snug line-clamp-3 flex-1 mb-3">{post.title}</h3>
                  <div className="pt-3 border-t border-neutral-200"><Meta post={post} /></div>
                </div>
              </article>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
