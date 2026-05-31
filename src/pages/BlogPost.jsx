import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Calendar, Clock, ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import SEO from '../components/SEO';
import StructuredData, { createBlogPostingSchema, createBreadcrumbSchema } from '../components/StructuredData';
import Breadcrumbs from '../components/Breadcrumbs';
import ShareButtons from '../components/ShareButtons';
import BlogContent from '../components/BlogContent';
import { getPostBySlug, getRelatedPosts } from '../services/blogService';
import { getCategoryTheme } from '../lib/blogTheme';

export default function BlogPost() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [relatedPosts, setRelatedPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const postData = await getPostBySlug(slug);
      setPost(postData);

      if (postData?.category) {
        const related = await getRelatedPosts(postData.category, slug);
        setRelatedPosts(related);
      }

      setLoading(false);
    }
    fetchData();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-neutral-900 mb-4">Post Not Found</h1>
          <Link to="/blog" className="text-indigo-600 hover:text-indigo-300">
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

      <div className="min-h-screen bg-neutral-50">
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
              {/* Decorative blobs for atmosphere when no image, or to enrich one */}
              <div className={`pointer-events-none absolute -top-24 -left-24 w-80 h-80 ${theme.glow} rounded-full blur-3xl`} />
              <div className={`pointer-events-none absolute -bottom-32 -right-16 w-96 h-96 ${theme.glow} rounded-full blur-3xl opacity-70`} />
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

              {/* Title */}
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-neutral-900 mb-4">
                {post.title}
              </h1>

              {/* Meta */}
              <div className="flex flex-wrap items-center gap-4 text-sm text-neutral-700 mb-8 pb-8 border-b border-neutral-200">
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {new Date(post.published_at).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {post.read_time}
                </span>
                <span>By {post.author}</span>

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
            </div>
          </article>

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
                    <article className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden hover:shadow-lg hover:-translate-y-0.5 hover:border-neutral-300 transition-all duration-200">
                      <img
                        src={related.image}
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

          {/* CTA — dark card pattern, accent for visual contrast on the white page */}
          <div className="mb-12 relative overflow-hidden rounded-2xl bg-neutral-900 border border-neutral-800 p-8 sm:p-10 text-center">
            <div className="pointer-events-none absolute -top-20 -right-20 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-20 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl" />
            <div className="relative">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-3 tracking-tight">
                Track any creator's growth.
              </h2>
              <p className="text-neutral-300 mb-6 max-w-md mx-auto">
                Daily subscriber and follower counts across YouTube, TikTok, Twitch, Kick, Bluesky, Mastodon, Rumble, Substack, and Music.
              </p>
              <Link
                to="/search"
                className="inline-flex items-center gap-2 px-6 py-3 bg-white text-neutral-900 font-bold rounded-xl hover:bg-neutral-100 hover:-translate-y-0.5 hover:shadow-lg transition-all"
              >
                Search creators
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
