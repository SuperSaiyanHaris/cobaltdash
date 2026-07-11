import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Edit3,
  Trash2,
  Eye,
  EyeOff,
  Save,
  ArrowLeft,
  Calendar,
  Clock,
  AlertCircle,
  CheckCircle,
  Loader2,
  ExternalLink,
  ShieldAlert,
  FileText,
} from 'lucide-react';
import SEO from '../components/SEO';
import BlogContent from '../components/BlogContent';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { BLOG_CATEGORIES, TIMEOUTS } from '../lib/constants';
import {
  getAllPostsAdmin,
  createPost,
  updatePost,
  deletePost,
  togglePublish,
  generateSlug,
} from '../services/blogAdminService';

const emptyPost = {
  title: '',
  slug: '',
  description: '',
  content: '',
  category: BLOG_CATEGORIES[0],
  author: 'ShinyPull Team',
  image: '',
  read_time: '5 min read',
  is_published: false,
};

export default function BlogAdmin() {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Post Editor state
  const [isEditingPost, setIsEditingPost] = useState(false);
  const [currentPost, setCurrentPost] = useState(null);
  const [postFormData, setPostFormData] = useState(emptyPost);

  // Preview
  const [showPreview, setShowPreview] = useState(false);

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState({ id: null });

  // Form validation errors
  const [postErrors, setPostErrors] = useState({});

  // Check admin status
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      window.dispatchEvent(new CustomEvent('openAuthPanel', {
        detail: { message: 'Sign in to access the admin panel' }
      }));
      return;
    }

    async function checkAdmin() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          setIsAdmin(false);
          setAdminChecked(true);
          return;
        }

        const res = await fetch('/api/blog-admin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ action: 'check' }),
        });

        if (res.status === 401) {
          await supabase.auth.signOut();
          setIsAdmin(false);
        } else {
          const data = await res.json();
          setIsAdmin(data.isAdmin);
        }
      } catch {
        setIsAdmin(false);
      } finally {
        setAdminChecked(true);
      }
    }
    checkAdmin();
  }, [user, authLoading]);

  useEffect(() => {
    if (isAdmin) fetchData();
  }, [isAdmin]);

  useEffect(() => {
    if (isEditingPost) {
      window.scrollTo(0, 0);
    }
  }, [isEditingPost]);

  async function fetchData() {
    try {
      setLoading(true);
      const postsData = await getAllPostsAdmin();
      setPosts(postsData || []);
    } catch (err) {
      setError('Failed to load posts. Make sure you have admin access.');
    } finally {
      setLoading(false);
    }
  }

  function showSuccess(message) {
    setSuccess(message);
    setTimeout(() => setSuccess(null), TIMEOUTS.SUCCESS_MESSAGE);
  }

  function showError(message) {
    setError(message);
    setTimeout(() => setError(null), TIMEOUTS.ERROR_MESSAGE);
  }

  function handleNewPost() {
    setCurrentPost(null);
    setPostFormData(emptyPost);
    setIsEditingPost(true);
  }

  function handleEditPost(post) {
    setCurrentPost(post);
    setPostFormData({
      title: post.title || '',
      slug: post.slug || '',
      description: post.description || '',
      content: post.content || '',
      category: post.category || BLOG_CATEGORIES[0],
      author: post.author || 'ShinyPull Team',
      image: post.image || '',
      read_time: post.read_time || '5 min read',
      is_published: post.is_published || false,
    });
    setIsEditingPost(true);
  }

  function handleCancelPostEdit() {
    setIsEditingPost(false);
    setCurrentPost(null);
    setPostFormData(emptyPost);
    setPostErrors({});
  }

  function validatePost(data) {
    const errors = {};
    if (!data.title?.trim()) errors.title = 'Title is required';
    if (!data.slug?.trim()) errors.slug = 'Slug is required';
    else if (!/^[a-z0-9-]+$/.test(data.slug)) errors.slug = 'Slug must be lowercase with hyphens only';
    if (!data.content?.trim()) errors.content = 'Content is required';
    if (!data.description?.trim()) errors.description = 'Description is required for SEO';
    if (data.image && !data.image.startsWith('http')) errors.image = 'Image must be a valid URL';
    return errors;
  }

  function handlePostInputChange(e) {
    const { name, value, type, checked } = e.target;
    setPostFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    if (name === 'title' && !currentPost) {
      setPostFormData(prev => ({ ...prev, slug: generateSlug(value) }));
    }
  }

  async function handleSavePost() {
    const errors = validatePost(postFormData);
    setPostErrors(errors);
    if (Object.keys(errors).length > 0) {
      showError('Please fix the validation errors');
      return;
    }
    try {
      setSaving(true);
      if (currentPost) {
        await updatePost(currentPost.id, postFormData);
        showSuccess('Post updated!');
      } else {
        await createPost({ ...postFormData, published_at: new Date().toISOString().split('T')[0] });
        showSuccess('Post created!');
      }
      await fetchData();
      handleCancelPostEdit();
    } catch (err) {
      showError(err.message || 'Failed to save post');
    } finally {
      setSaving(false);
    }
  }

  async function handleTogglePostPublish(post) {
    try {
      await togglePublish(post.id, !post.is_published);
      await fetchData();
      showSuccess(post.is_published ? 'Post unpublished' : 'Post published!');
    } catch (err) {
      showError('Failed to update publish status');
    }
  }

  async function handleDeletePost(id) {
    try {
      await deletePost(id);
      await fetchData();
      setDeleteConfirm({ id: null });
      showSuccess('Post deleted');
    } catch (err) {
      showError('Failed to delete post');
    }
  }

  if (authLoading || (!user && !adminChecked)) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-neutral-300 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center px-4">
        <div className="text-center">
          <ShieldAlert className="w-16 h-16 text-neutral-700 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">Sign In Required</h1>
          <p className="text-neutral-700 mb-6">Please sign in to access this page.</p>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('openAuthPanel', {
              detail: { message: 'Sign in to access the admin panel' }
            }))}
            className="px-6 py-3 bg-neutral-900 text-white font-medium rounded-lg hover:bg-neutral-800 transition-colors"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  if (!adminChecked) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-neutral-300 animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center px-4">
        <div className="text-center">
          <ShieldAlert className="w-16 h-16 text-red-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">Access Denied</h1>
          <p className="text-neutral-700 mb-6">You don't have permission to access this page.</p>
          <Link to="/" className="px-6 py-3 bg-neutral-900 text-white font-medium rounded-lg hover:bg-neutral-800 transition-colors">
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-neutral-300 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <SEO title="Blog Admin" description="Manage blog posts" />

      <div className="min-h-screen bg-neutral-100">
        {/* Header */}
        <div className="bg-white border-b border-neutral-300 sticky top-16 z-40">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Link to="/blog" className="p-2 hover:bg-neutral-100 rounded-lg transition-colors">
                  <ArrowLeft className="w-5 h-5 text-neutral-700" />
                </Link>
                <div>
                  <h1 className="text-xl font-bold text-neutral-900">Blog Admin</h1>
                  <p className="text-sm text-neutral-700">{posts.length} posts</p>
                </div>
              </div>
              {!isEditingPost && (
                <button
                  onClick={handleNewPost}
                  className="flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  New Post
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Notifications */}
        {(error || success) && (
          <div className="max-w-7xl mx-auto px-4 pt-4">
            {error && (
              <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                {error}
              </div>
            )}
            {success && (
              <div className="flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
                <CheckCircle className="w-5 h-5 flex-shrink-0" />
                {success}
              </div>
            )}
          </div>
        )}

        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* POST EDITOR */}
          {isEditingPost && (
            <div className="bg-white rounded-xl border border-neutral-300 shadow-sm">
              <div className="p-6 border-b border-neutral-300">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-neutral-900">
                    {currentPost ? 'Edit Post' : 'Create New Post'}
                  </h2>
                  <div className="flex items-center gap-2">
                    <button onClick={handleCancelPostEdit} className="px-4 py-2 text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors">
                      Cancel
                    </button>
                    <button
                      onClick={() => setShowPreview(true)}
                      disabled={!postFormData.content}
                      className="flex items-center gap-2 px-4 py-2 bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 transition-colors disabled:opacity-40"
                    >
                      <Eye className="w-4 h-4" />
                      Preview
                    </button>
                    <button onClick={handleSavePost} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 transition-colors disabled:opacity-50">
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Save
                    </button>
                  </div>
                </div>
              </div>
              <div className="p-6 space-y-6">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Title *</label>
                    <input type="text" name="title" value={postFormData.title} onChange={handlePostInputChange} placeholder="Best Streaming Setup for 2026" className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 focus:border-transparent text-neutral-900 bg-white ${postErrors.title ? 'border-red-500' : 'border-neutral-300'}`} />
                    {postErrors.title && <p className="mt-1 text-sm text-red-600">{postErrors.title}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Slug *</label>
                    <input type="text" name="slug" value={postFormData.slug} onChange={handlePostInputChange} placeholder="best-streaming-setup-2026" className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 focus:border-transparent font-mono text-sm text-neutral-900 bg-white ${postErrors.slug ? 'border-red-500' : 'border-neutral-300'}`} />
                    {postErrors.slug && <p className="mt-1 text-sm text-red-600">{postErrors.slug}</p>}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Description *</label>
                  <input type="text" name="description" value={postFormData.description} onChange={handlePostInputChange} placeholder="A brief description for SEO" className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 focus:border-transparent text-neutral-900 bg-white ${postErrors.description ? 'border-red-500' : 'border-neutral-300'}`} />
                  {postErrors.description && <p className="mt-1 text-sm text-red-600">{postErrors.description}</p>}
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Category</label>
                    <select name="category" value={postFormData.category} onChange={handlePostInputChange} className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 focus:border-transparent text-neutral-900 bg-white">
                      {BLOG_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Author</label>
                    <input type="text" name="author" value={postFormData.author} onChange={handlePostInputChange} className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 focus:border-transparent text-neutral-900 bg-white" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Read Time</label>
                    <input type="text" name="read_time" value={postFormData.read_time} onChange={handlePostInputChange} placeholder="5 min read" className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 focus:border-transparent text-neutral-900 bg-white" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Cover Image URL</label>
                  <input type="text" name="image" value={postFormData.image} onChange={handlePostInputChange} placeholder="https://images.unsplash.com/..." className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 focus:border-transparent text-neutral-900 bg-white ${postErrors.image ? 'border-red-500' : 'border-neutral-300'}`} />
                  {postErrors.image && <p className="mt-1 text-sm text-red-600">{postErrors.image}</p>}
                  {postFormData.image && <img src={postFormData.image} alt="Preview" className="mt-2 w-full max-w-md h-32 object-cover rounded-lg border border-neutral-300" onError={(e) => e.target.style.display = 'none'} />}
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Content (Markdown) *</label>
                  <p className="text-xs text-neutral-700 mb-2">
                    Embeds available: {'{{tldr}}...{{/tldr}}'}, {'{{stats}}value | label{{/stats}}'}, {'{{callout:stat|insight|tip|update|warning}}...{{/callout}}'}, {'{{creators:platform/username:Name, ...}}'}
                  </p>
                  <textarea name="content" value={postFormData.content} onChange={handlePostInputChange} rows={16} placeholder="# Your Article Title..." className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 focus:border-transparent font-mono text-sm text-neutral-900 bg-white ${postErrors.content ? 'border-red-500' : 'border-neutral-300'}`} />
                  {postErrors.content && <p className="mt-1 text-sm text-red-600">{postErrors.content}</p>}
                </div>
                <div className="flex items-center gap-3 p-4 bg-neutral-50 rounded-lg">
                  <input type="checkbox" id="is_published" name="is_published" checked={postFormData.is_published} onChange={handlePostInputChange} className="w-5 h-5 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-1" />
                  <label htmlFor="is_published" className="flex-1">
                    <span className="font-medium text-neutral-900">Publish immediately</span>
                    <p className="text-sm text-neutral-700">When checked, the post will be visible on the public blog</p>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* POSTS LIST */}
          {!isEditingPost && (
            <div className="space-y-4">
              {posts.length === 0 ? (
                <div className="bg-white rounded-xl border border-neutral-300 p-12 text-center">
                  <FileText className="w-12 h-12 text-neutral-700 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-neutral-900 mb-2">No posts yet</h3>
                  <p className="text-neutral-700 mb-4">Create your first blog post to get started</p>
                  <button onClick={handleNewPost} className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 transition-colors">
                    <Plus className="w-4 h-4" /> Create Post
                  </button>
                </div>
              ) : (
                posts.map(post => (
                  <div key={post.id} className="bg-white rounded-xl border border-neutral-300 p-4 hover:shadow-md transition-shadow overflow-hidden">
                    <div className="flex gap-4">
                      {post.image && (
                        <div className="hidden sm:block w-32 h-24 rounded-lg overflow-hidden bg-neutral-100 flex-shrink-0">
                          <img src={post.image} alt="" className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              {post.is_published ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 text-xs font-medium rounded-full"><Eye className="w-3 h-3" />Published</span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-neutral-100 text-neutral-700 text-xs font-medium rounded-full"><EyeOff className="w-3 h-3" />Draft</span>
                              )}
                              <span className="text-xs text-neutral-700">{post.category}</span>
                            </div>
                            <h3 className="font-semibold text-neutral-900 truncate">{post.title}</h3>
                            <p className="text-sm text-neutral-700 truncate">{post.description}</p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {post.is_published && (
                              <a href={`/blog/${post.slug}`} target="_blank" rel="noopener noreferrer" className="p-2 hover:bg-neutral-100 rounded-lg transition-colors" title="View post">
                                <ExternalLink className="w-4 h-4 text-neutral-700" />
                              </a>
                            )}
                            <button onClick={() => handleTogglePostPublish(post)} className="p-2 hover:bg-neutral-100 rounded-lg transition-colors" title={post.is_published ? 'Unpublish' : 'Publish'}>
                              {post.is_published ? <EyeOff className="w-4 h-4 text-neutral-700" /> : <Eye className="w-4 h-4 text-neutral-700" />}
                            </button>
                            <button onClick={() => handleEditPost(post)} className="p-2 hover:bg-neutral-100 rounded-lg transition-colors" title="Edit">
                              <Edit3 className="w-4 h-4 text-neutral-700" />
                            </button>
                            <button onClick={() => setDeleteConfirm({ id: post.id })} className="p-2 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-neutral-700">
                          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{post.published_at ? new Date(post.published_at).toLocaleDateString() : 'No date'}</span>
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{post.read_time}</span>
                        </div>
                      </div>
                    </div>
                    {deleteConfirm.id === post.id && (
                      <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-sm text-red-600 mb-3">Are you sure you want to delete "{post.title}"?</p>
                        <div className="flex gap-2">
                          <button onClick={() => handleDeletePost(post.id)} className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors">Delete</button>
                          <button onClick={() => setDeleteConfirm({ id: null })} className="px-3 py-1.5 bg-white text-neutral-700 text-sm rounded-lg border border-neutral-300 hover:bg-neutral-50 transition-colors">Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* PREVIEW OVERLAY */}
      {showPreview && (
        <div className="fixed inset-0 z-50 bg-neutral-100/80 overflow-y-auto">
          <div className="sticky top-0 z-10 bg-white border-b border-neutral-300 px-4 py-3 flex items-center justify-between shadow-sm">
            <h3 className="font-semibold text-neutral-900">Preview: {postFormData.title || 'Untitled'}</h3>
            <button
              onClick={() => setShowPreview(false)}
              className="px-4 py-2 bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 transition-colors"
            >
              Close
            </button>
          </div>
          <div className="max-w-3xl mx-auto px-4 py-8">
            <div className="bg-white rounded-xl border border-neutral-300 p-6 sm:p-10">
              <h1 className="text-3xl sm:text-4xl font-extrabold text-neutral-900 mb-6">{postFormData.title || 'Untitled'}</h1>
              <BlogContent content={postFormData.content || ''} category={postFormData.category} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
