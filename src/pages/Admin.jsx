import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2, ShieldAlert, FileText, Mail, Users, FileSpreadsheet } from 'lucide-react';
import SEO from '../components/SEO';
import { useAdminAuth } from '../hooks/useAdminAuth';
import BlogPostsPanel from '../components/admin/BlogPostsPanel';
import SubscribersPanel from '../components/admin/SubscribersPanel';
import UsersPanel from '../components/admin/UsersPanel';
import ReportsPanel from '../components/admin/ReportsPanel';

const TABS = [
  { id: 'blog', label: 'Blog Posts', icon: FileText },
  { id: 'subscribers', label: 'Subscribers', icon: Mail },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'reports', label: 'Reports', icon: FileSpreadsheet },
];

export default function Admin() {
  const { user, authLoading, isAdmin, adminChecked } = useAdminAuth();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => {
    const tab = searchParams.get('tab');
    return TABS.some(t => t.id === tab) ? tab : 'blog';
  });

  if (authLoading || (!user && !adminChecked)) {
    return (
      <div className="min-h-screen bg-[#fafaf9] flex items-center justify-center">
        <SEO title="Admin" noindex />
        <Loader2 className="w-6 h-6 text-neutral-300 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#fafaf9] flex items-center justify-center px-4">
        <SEO title="Admin" noindex />
        <div className="text-center">
          <ShieldAlert className="w-16 h-16 text-neutral-700 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">Sign In Required</h1>
          <p className="text-neutral-500 mb-6">Please sign in to access this page.</p>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('openAuthPanel', {
              detail: { message: 'Sign in to access the admin dashboard' }
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
      <div className="min-h-screen bg-[#fafaf9] flex items-center justify-center">
        <SEO title="Admin" noindex />
        <Loader2 className="w-6 h-6 text-neutral-300 animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#fafaf9] flex items-center justify-center px-4">
        <SEO title="Admin" noindex />
        <div className="text-center">
          <ShieldAlert className="w-16 h-16 text-red-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">Access Denied</h1>
          <p className="text-neutral-500 mb-6">You don't have permission to access this page.</p>
          <Link to="/" className="px-6 py-3 bg-neutral-900 text-white font-medium rounded-lg hover:bg-neutral-800 transition-colors">
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <SEO title="Admin" description="ShinyPull admin dashboard" noindex />

      <div className="min-h-screen bg-[#fafaf9]">
        <div className="bg-white border-b border-neutral-200/80">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <Link to="/" className="inline-flex items-center gap-1.5 px-3 py-1 -ml-3 mb-3 rounded-full text-xs font-medium text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50 transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </Link>
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-600 mb-2">Admin</p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-neutral-900">Dashboard</h1>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-1.5 mb-6 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TABS.map(tab => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors border ${
                    isActive
                      ? 'bg-neutral-900 border-neutral-900 text-white'
                      : 'bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {activeTab === 'blog' && <BlogPostsPanel />}
          {activeTab === 'subscribers' && <SubscribersPanel />}
          {activeTab === 'users' && <UsersPanel />}
          {activeTab === 'reports' && <ReportsPanel />}
        </div>
      </div>
    </>
  );
}
