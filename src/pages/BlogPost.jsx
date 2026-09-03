import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Calendar, Clock, ArrowLeft, ArrowRight, Loader2, PenLine } from 'lucide-react';
import SEO from '../components/SEO';
import NewsletterSignup from '../components/NewsletterSignup';
import StructuredData, { createBlogPostingSchema, createBreadcrumbSchema } from '../components/StructuredData';
import Breadcrumbs from '../components/Breadcrumbs';
import ShareButtons from '../components/ShareButtons';
import BlogContent from '../components/BlogContent';
import { getPostBySlug, getRelatedPosts } from '../services/blogService';
import { getCategoryTheme } from '../lib/blogTheme';
import { resizedBlogImageUrl, BLOG_CARD_TARGET } from '../lib/blogImageUrl';

// middleware.js embeds a <script id="__BLOG_DATA__"> alongside the visible
// server-rendered article so this component's very first render already has
// real content instead of an empty loading spinner — same pattern and same
// reason as readEmbeddedCreatorData in CreatorProfile.jsx (see the comment on
// `initialData` in middleware.js's getBlogContent). Only trusted when it
// matches the slug actually being rendered, so a client-side nav to a
// different post (e.g. a Related Articles link) doesn't reuse stale data.
function readEmbeddedBlogData(slug) {
  if (typeof document === 'undefined') return null;
  const el = document.getElementById('__BLOG_DATA__');
  if (!el) return null;
  try {
    const data = JSON.parse(el.textContent);
    if (data.slug !== slug) return null;
    return data;
  } catch {
    return null;
  }
}

export default function BlogPost() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // ?preview=1 lets drafts render for review before publishing. Draft slugs
  // are unguessable and posts are public content anyway, so no gating needed.
  const isPreview = searchParams.get('preview') === '1';
  // Lazy initializer so readEmbeddedBlogData only runs once, on the very
  // first render. Preview/draft posts never have embedded data (middleware
  // only injects published posts), so this is always null in preview mode.
  const [embeddedData] = useState(() => readEmbeddedBlogData(slug));
  const [post, setPost] = useState(() => embeddedData || null);
  const [relatedPosts, setRelatedPosts] = useState([]);
  const [loading, setLoading] = useState(() => !embeddedData);
  // True only for the very first fetchData() call of the very first slug
  // this component instance renders, and only when that call already has
  // embedded data seeded. Lets fetchData skip the loading-flash reset on
  // that one call while behaving normally on every subsequent call (a
  // client-side nav to a different post, a retry, etc).
  const isFirstLoadRef = useRef(true);

  useEffect(() => {
    async function fetchData(skipLoadingFlash) {
      if (!skipLoadingFlash) setLoading(true);
      const postData = await getPostBySlug(slug, { includeDrafts: isPreview });
      setPost(postData);

      if (postData?.category) {
        const related = await getRelatedPosts(postData.category, slug);
        setRelatedPosts(related);
      }

      setLoading(false);
    }
    fetchData(isFirstLoadRef.current && !!embeddedData);
    isFirstLoadRef.current = false;
  }, [slug, isPreview]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fafaf9] flex items-center justify-center">
        <SEO title="Loading..." />
        <Loader2 className="w-6 h-6 text-neutral-300 animate-spin" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-[#fafaf9] flex items-center justify-center">
        <SEO title="Post Not Found" noindex />
        <div className="text-center">
          <h1 className="text-2xl font-bold text-neutral-900 mb-4">Post Not Found</h1>
          <Link to="/blog" className="text-indigo-600 hover:text-indigo-700">
            Back to Blog
          </Link>
        </div>
      </div>
    );
  }

  // Share URLs
  const shareUrl = encodeURIComponent(window.location.href);
  const shareTitle = encodeURIComponent(post.title);
  const postUrl = `https://shinypull.com/blog/${post.slug}`;

  // Create structured data schemas
  const blogPostSchema = createBlogPostingSchema({
    title: post.title,
    description: post.description,
    image: post.image,
    datePublished: post.published_at,
    dateModified: post.updated_at,
    author: post.author,
    category: post.category,
    url: postUrl
  });

  const breadcrumbSchema = createBreadcrumbSchema([
    { name: 'Home', url: 'https://shinypull.com' },
    { name: 'Blog', url: 'https://shinypull.com/blog' },
    { name: post.title, url: postUrl }
  ]);

  return (
    <>
      <SEO
        title={post.title}
        description={post.description}
        image={post.image}
        type="article"
        article={{
          publishedTime: post.published_at,
          modifiedTime: post.updated_at,
          author: post.author || 'ShinyPull',
          section: post.category
        }}
      />
      
      <StructuredData schema={blogPostSchema} />
      <StructuredData schema={breadcrumbSchema} />

      <div className="min-h-screen bg-[#fafaf9]">
        {(() => {
          const theme = getCategoryTheme(post.category);
          return (
            <div className={`relative h-64 md:h-96 bg-gradient-to-br ${theme.heroFrom} ${theme.heroVia} ${theme.heroTo} overflow-hidden`}>
              {post.image && (
                <img
                  src={post.image}
                  alt={post.title}
                  className="absolute inset-0 w-full h-full object-cover opacity-50 mix-blend-luminosity"
                />
              )}
              {/* Dark gradient scrim keeps the back button + any overlaid text legible on the cover image */}
              <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/40 to-transparent" />

              <button
                onClick={() => navigate('/blog')}
                className="absolute top-4 left-4 flex items-center gap-2 px-4 py-2 bg-white/60 backdrop-blur-sm border border-white/10 rounded-lg text-white hover:bg-white/80 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Blog
              </button>
            </div>
          );
        })()}

        <div className="max-w-4xl mx-auto px-4 -mt-32 relative z-10">
          {/* Article Header */}
          <article className="bg-white rounded-2xl border border-neutral-200 shadow-lg overflow-hidden">
            <div className="p-5 sm:p-8 md:p-12">
              {/* Breadcrumbs */}
              <Breadcrumbs 
                items={[
                  { label: 'Home', path: '/' },
                  { label: 'Blog', path: '/blog' },
                  { label: post.title, path: `/blog/${post.slug}` }
                ]}
              />

              {/* Category */}
              <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium mb-4 ${getCategoryTheme(post.category).pill}`}>
                {post.category}
              </span>
              {isPreview && !post.is_published && (
                <span className="inline-block ml-2 px-3 py-1 rounded-full text-sm font-semibold mb-4 bg-neutral-900 text-white">
                  DRAFT
                </span>
              )}

              {/* Title */}
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-neutral-900 mb-4">
                {post.title}
              </h1>

              {/* Meta */}
              <div className="flex flex-wrap items-center gap-4 text-sm text-neutral-700 mb-8 pb-8 border-b border-neutral-200">
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {post.published_at
                    ? new Date(post.published_at.includes('T') ? post.published_at : `${post.published_at}T12:00:00`).toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric'
                      })
                    : 'Not yet published'}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {post.read_time}
                </span>
                <Link to="/about#editorial-team" className="hover:text-neutral-900 underline-offset-2 hover:underline">
                  By {post.author}
                </Link>

                {/* Share Buttons */}
                <div className="ml-auto">
                  <ShareButtons 
                    url={postUrl} 
                    title={post.title} 
                    description={post.description} 
                  />
                </div>
              </div>

              {/* Content */}
              <BlogContent content={post.content} category={post.category} />

              {/* Author box — a real editorial-team trust signal, not a data
                  disclaimer. Links to the About page's Who Writes This section. */}
              <div className="mt-10 pt-6 border-t border-neutral-200 flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg border bg-indigo-50 text-indigo-600 border-indigo-100 flex items-center justify-center flex-shrink-0">
                  <PenLine className="w-4 h-4" />
                </div>
                <p className="text-sm text-neutral-600 leading-relaxed">
                  <span className="font-semibold text-neutral-900">Written by {post.author}.</span>{' '}
                  Every number above is pulled fresh from our own database before publishing.{' '}
                  <Link to="/about#editorial-team" className="text-indigo-600 hover:text-indigo-700 font-medium underline-offset-2 hover:underline">
                    More about how we work.
                  </Link>
                </p>
              </div>
            </div>
          </article>

          {/* Newsletter */}
          <NewsletterSignup className="mt-8" />

          {/* Related Posts */}
          {relatedPosts.length > 0 && (
            <div className="mt-12 mb-12">
              <h2 className="text-2xl font-bold text-neutral-900 mb-6">Related Articles</h2>
              <div className="grid md:grid-cols-2 gap-6">
                {relatedPosts.map(related => (
                  <Link
                    key={related.slug}
                    to={`/blog/${related.slug}`}
                    className="group"
                  >
                    <article className="bg-white rounded-xl border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden hover:border-neutral-300 transition-colors duration-200">
                      <img
                        src={resizedBlogImageUrl(related.image, BLOG_CARD_TARGET.width, BLOG_CARD_TARGET.height)}
                        alt={related.title}
                        loading="lazy"
                        className="w-full h-40 object-cover"
                      />
                      <div className="p-6">
                        <h3 className="font-bold text-neutral-900 group-hover:text-indigo-600 transition-colors mb-2">
                          {related.title}
                        </h3>
                        <p className="text-sm text-neutral-500">{related.read_time}</p>
                      </div>
                    </article>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* CTA — light precision card */}
          <div className="mb-12 bg-white rounded-xl border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-8 sm:p-10 text-center">
            <h2 className="text-xl sm:text-2xl font-semibold text-neutral-900 mb-3 tracking-tight">
              Track any creator's growth.
            </h2>
            <p className="text-sm text-neutral-500 mb-6 max-w-md mx-auto">
              Daily subscriber and follower counts across YouTube, TikTok, Twitch, Kick, Bluesky, Mastodon, Rumble, Substack, and Music.
            </p>
            <Link
              to="/search"
              className="inline-flex items-center gap-2 px-6 py-3 bg-neutral-900 text-white text-sm font-medium rounded-lg hover:bg-neutral-800 transition-colors"
            >
              Search creators
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
