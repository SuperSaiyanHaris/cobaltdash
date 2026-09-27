import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, MessageCircle } from 'lucide-react';
import SEO from '../components/SEO';
import { useAuth } from '../contexts/AuthContext';
import { repliesInbox, markRepliesSeen } from '../services/commentsService';
import { formatRelativeTimeShort } from '../lib/utils';

// Replies to the signed-in person's comments, and replies that @mention them.
// Opened from the account menu; visiting marks them read.
export default function Replies() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    repliesInbox().then((d) => {
      setData({ replies: [], ...(d || {}) });
      if (d?.unread) markRepliesSeen().then(() => window.dispatchEvent(new Event('repliesSeen'))).catch(() => {});
    });
  }, [isAuthenticated]);

  return (
    <>
      <SEO title="Replies" description="Replies to your comments on ShinyPull." noindex />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Your comments</p>
        <h1 className="mt-1.5 text-3xl font-extrabold tracking-tight text-neutral-900">Replies</h1>

        {!authLoading && !isAuthenticated ? (
          <p className="mt-6 text-sm text-neutral-700">Sign in to see replies to your comments.</p>
        ) : !data ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-neutral-600" /></div>
        ) : data.replies.length === 0 ? (
          <div className="mt-6 bg-white border border-neutral-200/80 rounded-xl p-6 flex items-start gap-3">
            <MessageCircle className="w-5 h-5 text-neutral-600 mt-0.5" aria-hidden="true" />
            <p className="text-sm text-neutral-700">No replies yet. When someone replies to your comment or mentions you, it shows up here.</p>
          </div>
        ) : (
          <div className="mt-6 bg-white border border-neutral-200/80 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04)] divide-y divide-neutral-100 overflow-hidden">
            {data.replies.map((r) => {
              const unread = data.seenAt && new Date(r.created_at) > new Date(data.seenAt);
              const c = r.creators;
              return (
                <Link key={r.id} to={c ? `/${c.platform}/${c.username}?comment=${r.parent_id}#comments` : '#'} className="block p-4 hover:bg-neutral-50 transition-colors">
                  <div className="flex items-center gap-2 text-xs text-neutral-700">
                    {unread && <span className="w-2 h-2 rounded-full bg-brand" aria-label="New" />}
                    <span className="font-semibold text-neutral-900">@{r.commenter_profiles?.handle}</span>
                    <span>replied on {c?.display_name || 'a profile'}</span>
                    <span className="text-neutral-600">{formatRelativeTimeShort(r.created_at)}</span>
                  </div>
                  <p className="mt-1.5 text-sm text-neutral-800 line-clamp-3 break-words">{r.body}</p>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
