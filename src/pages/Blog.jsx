import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Clock, Loader2, BookOpen, Filter, X, Search } from 'lucide-react';
import SEO from '../components/SEO';
import NewsletterSignup from '../components/NewsletterSignup';
import { getAllPosts, getAllCategories } from '../services/blogService';
import { resizedBlogImageUrl, BLOG_CARD_TARGET } from '../lib/blogImageUrl';

const PAGE_SIZE = 9;

// Category identity is a small dot tint plus a quiet pill — precision system.
// Sidebar active state is uniform (neutral) so the dot alone carries the color.
const CATEGORY_COLORS = {
  'YouTube News':      { pill: 'bg-red-50 text-red-700 border border-red-200/80',           dot: 'bg-red-500' },
  'Platform Updates':  { pill: 'bg-indigo-50 text-indigo-700 border border-indigo-200/80',   dot: 'bg-indigo-500' },
  'Industry News':     { pill: 'bg-sky-50 text-sky-700 border border-sky-200/80',           dot: 'bg-sky-500' },
  'Industry Insights': { pill: 'bg-sky-50 text-sky-700 border border-sky-200/80',           dot: 'bg-sky-400' },
  'Analytics':          { pill: 'bg-violet-50 text-violet-700 border border-violet-200/80',  dot: 'bg-violet-500' },
  'Creator Economy':   { pill: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80', dot: 'bg-emerald-500' },
  'Creator Spotlight': { pill: 'bg-pink-50 text-pink-700 border border-pink-200/80',        dot: 'bg-pink-500' },
  'Twitch Trends':     { pill: 'bg-purple-50 text-purple-700 border border-purple-200/80',  dot: 'bg-purple-500' },
  'Rankings':          { pill: 'bg-amber-50 text-amber-700 border border-amber-200/80',     dot: 'bg-amber-500' },
};
const DEFAULT_COLORS = { pill: 'bg-neutral-50 text-neutral-600 border border-neutral-200/80', dot: 'bg-indigo-500' };

function getCatColors(category) {
  return CATEGORY_COLORS[category] || DEFAULT_COLORS;
}

function isNewPost(publishedAt) {
  if (!publishedAt) return false;
  return Date.now() - new Date(publishedAt).getTime() < 7 * 24 * 60 * 60 * 1000;
}

function formatDate(dateStr) {
  // published_at is a bare DATE ("2026-07-25"), which JS parses as UTC
  // midnight. Displaying that via toLocaleDateString in a timezone behind
  // UTC (e.g. America/New_York) rolls it back to the previous day. Forcing
  // local noon avoids crossing any day boundary. Same fix as middleware.js's
  // toISODateTime and CreatorProfile.jsx's recorded_at+'T12:00:00' pattern.
  const d = dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`;
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function Blog() {
  const [posts, setPosts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState(['all']);
  const [loading, setLoading] = useState(true);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    async function fetchData() {
      const [postsData, categoriesData] = await Promise.all([
        getAllPosts(),
        getAllCategories(),
      ]);
      setPosts(postsData);
      setCategories(categoriesData);
      setLoading(false);
    }
    fetchData();
  }, []);

  // Reset pagination when filters or search change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [selectedCategories, searchQuery]);

  const toggleCategory = (category) => {
    if (category === 'all') {
      setSelectedCategories(['all']);
    } else {
      setSelectedCategories(prev => {
        const withoutAll = prev.filter(c => c !== 'all');
        if (prev.includes(category)) {
          const updated = withoutAll.filter(c => c !== category);
          return updated.length === 0 ? ['all'] : updated;
        }
        return [...withoutAll, category];
      });
    }
  };

  const categoryCounts = {};
  posts.forEach(p => {
    if (p.category) categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
  });

  const filteredPosts = posts
    .filter(p => selectedCategories.includes('all') || selectedCategories.includes(p.category))
    .filter(p => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return p.title?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q);
    });

  const featuredPost = filteredPosts[0];
  const gridPosts = filteredPosts.slice(1, 1 + visibleCount);
  const remaining = filteredPosts.length - 1 - visibleCount;
  const hasMore = remaining > 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fafaf9] flex items-center justify-center">
        <SEO
          title="Blog - Creator Analytics, Platform News & Industry Insights"
          description="Analysis of creator economy trends, platform updates, and rankings across YouTube, TikTok, Twitch, and more. Data-driven insights for creators and fans."
        />
        <Loader2 className="w-6 h-6 text-neutral-300 animate-spin" />
      </div>
    );
  }

  const renderSidebar = (onSelect) => (
    <nav className="space-y-0.5">
      {/* All Posts — clear-filter action */}
      <button
        onClick={() => onSelect('all')}
        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
          selectedCategories.includes('all')
            ? 'bg-neutral-100 text-neutral-900'
            : 'text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50'
        }`}
      >
        <span>All Posts</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500 font-semibold tabular-nums">
          {posts.length}
        </span>
      </button>

      {categories.map(category => {
        const count = categoryCounts[category] || 0;
        const isActive = selectedCategories.includes(category);
        const colors = getCatColors(category);
        return (
          <button
            key={category}
            onClick={() => onSelect(category)}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-500 hover:text-neutral-900'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${colors.dot} ${isActive ? 'opacity-100' : 'opacity-35'}`} />
              <span>{category}</span>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-50 text-neutral-600 font-semibold tabular-nums">
              {count}
            </span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <>
      <SEO
        title="Blog - Creator Analytics, Platform News & Industry Insights"
        description="Analysis of creator economy trends, platform updates, and rankings across YouTube, TikTok, Twitch, and more. Data-driven insights for creators and fans."
      />

      <div className="min-h-screen bg-[#fafaf9]">

        {/* Header — white block, hairline rule, typographic */}
        <div className="bg-white border-b border-neutral-200/80">
          <div className="w-full px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
            <div className="max-w-6xl mx-auto text-center">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-600 mb-3">Blog</p>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-neutral-900">Creator Resources</h1>
              <p className="mt-2 text-sm sm:text-base text-neutral-500 max-w-2xl mx-auto">
                Platform news, rankings breakdowns, and creator economy analysis, backed by the data we track every day
              </p>
            </div>
          </div>
        </div>

        {/* Sidebar + Content */}
        <section className="w-full px-4 sm:px-6 lg:px-8 py-12">
          <div className="max-w-7xl mx-auto">
            <div className="flex gap-8">

              {/* Desktop Sidebar */}
              <aside className="hidden lg:block w-52 flex-shrink-0">
                <div className="sticky top-24">
                  <h3 className="text-[10px] font-semibold text-neutral-600 uppercase tracking-widest mb-3 px-3">
                    Categories
                  </h3>
                  {renderSidebar(toggleCategory)}
                </div>
              </aside>

              {/* Mobile FAB */}
              <div className="lg:hidden fixed bottom-6 left-6 z-40">
                <button
                  onClick={() => setMobileFiltersOpen(true)}
                  className="flex items-center gap-2 px-5 py-3 bg-neutral-900 hover:bg-neutral-800 text-white font-medium rounded-full shadow-lg transition-colors"
                >
                  <Filter className="w-5 h-5" />
                  Filters
                  {!selectedCategories.includes('all') && (
                    <span className="ml-0.5 w-5 h-5 bg-white/20 rounded-full text-xs font-bold flex items-center justify-center">
                      {selectedCategories.length}
                    </span>
                  )}
                </button>
              </div>

              {/* Mobile Slide Panel */}
              {mobileFiltersOpen && (
                <>
                  <div className="lg:hidden fixed inset-0 bg-black/50 z-50" onClick={() => setMobileFiltersOpen(false)} />
                  <div className="lg:hidden fixed inset-y-0 left-0 w-80 max-w-[85vw] bg-white z-50 shadow-2xl overflow-y-auto">
                    <div className="p-6">
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-bold text-neutral-900">Filter by Category</h3>
                        <button onClick={() => setMobileFiltersOpen(false)} className="p-2 hover:bg-neutral-100 rounded-lg transition-colors">
                          <X className="w-5 h-5 text-neutral-700" />
                        </button>
                      </div>
                      {renderSidebar(cat => { toggleCategory(cat); })}
                    </div>
                  </div>
                </>
              )}

              {/* Main Content */}
              <div className="flex-1 min-w-0 pb-24 lg:pb-0">

                {/* Search bar */}
                <div className="relative mb-8">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search posts..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-11 pr-10 py-3 bg-white border border-neutral-200 rounded-xl text-neutral-800 placeholder-gray-600 text-sm focus:outline-none focus:border-neutral-300 transition-colors"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-700 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Empty state */}
                {filteredPosts.length === 0 && (
                  <div className="text-center py-16">
                    <BookOpen className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
                    <p className="text-neutral-600 text-lg">No posts found.</p>
                    {searchQuery && (
                      <button onClick={() => setSearchQuery('')} className="mt-3 text-sm text-neutral-500 hover:text-neutral-800 underline transition-colors">
                        Clear search
                      </button>
                    )}
                  </div>
                )}

                {/* Featured Post */}
                {featuredPost && (
                  <Link to={`/blog/${featuredPost.slug}`} className="block mb-8 group">
                    <article className="bg-white rounded-xl border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden hover:border-neutral-300 transition-colors duration-200">
                      <div className="md:flex md:items-center">
                        <div className="md:w-1/2 aspect-[16/9] overflow-hidden bg-neutral-100 flex-shrink-0">
                          <img
                            src={resizedBlogImageUrl(featuredPost.image, 1200, 675)}
                            alt={featuredPost.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="md:w-1/2 p-8 flex flex-col justify-center">
                          <div className="flex items-center gap-2 mb-3">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${getCatColors(featuredPost.category).pill}`}>
                              {featuredPost.category}
                            </span>
                            {isNewPost(featuredPost.published_at) && (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                                New
                              </span>
                            )}
                          </div>
                          <h2 className="text-2xl md:text-3xl font-bold text-neutral-900 mb-3 group-hover:text-neutral-700 transition-colors">
                            {featuredPost.title}
                          </h2>
                          <p className="text-neutral-500 text-sm leading-relaxed mb-5 line-clamp-2">
                            {featuredPost.description}
                          </p>
                          <div className="flex items-center gap-4 text-xs text-neutral-600">
                            <span className="flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5" />
                              {formatDate(featuredPost.published_at)}
                            </span>
                            <span className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5" />
                              {featuredPost.read_time}
                            </span>
                          </div>
                        </div>
                      </div>
                    </article>
                  </Link>
                )}

                {/* Grid */}
                <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {gridPosts.map(post => {
                    const colors = getCatColors(post.category);
                    return (
                      <Link key={post.slug} to={`/blog/${post.slug}`} className="group">
                        <article className="bg-white rounded-xl border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden hover:border-neutral-300 transition-colors duration-200 h-full flex flex-col">
                          <div className="relative">
                            <img
                              src={resizedBlogImageUrl(post.image, BLOG_CARD_TARGET.width, BLOG_CARD_TARGET.height)}
                              alt={post.title}
                              loading="lazy"
                              className="w-full h-48 object-cover"
                            />
                            {isNewPost(post.published_at) && (
                              <span className="absolute top-3 left-3 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500 text-white shadow">
                                New
                              </span>
                            )}
                          </div>
                          <div className="p-5 flex flex-col flex-1">
                            <span className={`inline-flex self-start items-center px-2.5 py-1 rounded-full text-xs font-semibold mb-3 ${colors.pill}`}>
                              {post.category}
                            </span>
                            <h3 className="text-base font-bold text-neutral-900 mb-2 group-hover:text-neutral-700 transition-colors line-clamp-2 flex-1">
                              {post.title}
                            </h3>
                            <p className="text-neutral-600 text-xs leading-relaxed line-clamp-2 mb-3">
                              {post.description}
                            </p>
                            <div className="flex items-center justify-between text-xs text-neutral-600 pt-3 border-t border-neutral-200">
                              <span className="flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5" />
                                {formatDate(post.published_at)}
                              </span>
                              <span className="flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5" />
                                {post.read_time}
                              </span>
                            </div>
                          </div>
                        </article>
                      </Link>
                    );
                  })}
                </div>

                {/* Load More */}
                {hasMore && (
                  <div className="mt-10 text-center">
                    <button
                      onClick={() => setVisibleCount(v => v + PAGE_SIZE)}
                      className="px-8 py-3 bg-white border border-neutral-200 hover:border-neutral-300 text-neutral-700 hover:text-neutral-900 font-medium rounded-xl transition-all duration-200"
                    >
                      Load more ({remaining} remaining)
                    </button>
                  </div>
                )}

                {/* Newsletter */}
                <NewsletterSignup className="mt-16" />

                {/* CTA */}
                <div className="mt-8 bg-white border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] rounded-xl p-8 md:p-12 text-center">
                  <h2 className="text-xl md:text-2xl font-semibold tracking-tight text-neutral-900 mb-3">
                    Track Your Channel's Growth
                  </h2>
                  <p className="text-sm text-neutral-500 mb-6 max-w-2xl mx-auto">
                    Use ShinyPull's free analytics to monitor your subscribers, views, and compare your growth with top creators.
                  </p>
                  <Link
                    to="/search"
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Search Creators
                  </Link>
                </div>

              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
