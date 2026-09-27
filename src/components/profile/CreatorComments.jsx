import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, ThumbsDown, ThumbsUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { formatRelativeTimeShort } from '../../lib/utils';
import {
  listComments, myVotes, vote, reportComment, myHandle, postComment, setHandle, removeComment,
} from '../../services/commentsService';

// Comments on a creator's profile. Loads only when scrolled near, so the
// profile's first paint is untouched. Everything posted is moderated by
// api/comments.js first; see supabase/migrations/20260927_creator_comments.sql.

const CARD = 'bg-white border border-neutral-200/80 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04)]';
const MAX = 500;
const TINTS = [
  'bg-violet-100 text-violet-800', 'bg-amber-100 text-amber-800', 'bg-sky-100 text-sky-800',
  'bg-emerald-100 text-emerald-800', 'bg-rose-100 text-rose-800', 'bg-indigo-100 text-indigo-800',
];
const REPORT_REASONS = [['harmful', 'Harmful or dangerous'], ['harassment', 'Harassment or hate'], ['spam', 'Spam']];

function Avatar({ handle, url }) {
  const [broken, setBroken] = useState(false);
  if (url && !broken) {
    return <img src={url} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />;
  }
  const h = handle || '?';
  const tint = TINTS[[...h].reduce((a, c) => a + c.charCodeAt(0), 0) % TINTS.length];
  return <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-semibold flex-shrink-0 ${tint}`}>{h.slice(0, 2).toUpperCase()}</div>;
}

const openAuth = () => window.dispatchEvent(new CustomEvent('openAuthPanel', { detail: { message: 'Sign in to comment and vote.' } }));

export default function CreatorComments({ creatorId, name }) {
  const { user, isAuthenticated } = useAuth();
  const rootRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [sort, setSort] = useState('top');
  const [comments, setComments] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [votes, setVotes] = useState({});
  const [profile, setProfile] = useState(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [posting, setPosting] = useState(false);
  const [pickingHandle, setPickingHandle] = useState(false);
  const [handleInput, setHandleInput] = useState('');
  const [reportFor, setReportFor] = useState(null);
  const [reported, setReported] = useState(() => new Set());

  // Load only once the section is near the viewport.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); io.disconnect(); } }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  const load = useCallback(async (nextPage, replace) => {
    setLoading(true);
    setLoadError(false);
    try {
      const { comments: rows, total: count } = await listComments(creatorId, { sort, page: nextPage });
      setComments((prev) => (replace ? rows : [...prev, ...rows.filter((r) => !prev.some((p) => p.id === r.id))]));
      setTotal(count);
      setPage(nextPage);
      if (user) {
        const mine = await myVotes(rows.map((r) => r.id), user.id);
        setVotes((prev) => ({ ...(replace ? {} : prev), ...mine }));
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [creatorId, sort, user]);

  useEffect(() => { if (visible && creatorId) load(0, true); }, [visible, creatorId, load]);
  useEffect(() => {
    if (!visible || !user) { setProfile(null); return; }
    myHandle(user.id).then(setProfile).catch(() => {});
  }, [visible, user]);

  const castVote = async (c, value) => {
    if (!isAuthenticated) return openAuth();
    const prev = votes[c.id] || 0;
    const next = prev === value ? 0 : value;
    const bump = (row) => ({
      ...row,
      up_count: row.up_count - (prev === 1) + (next === 1),
      down_count: row.down_count - (prev === -1) + (next === -1),
    });
    setVotes((v) => ({ ...v, [c.id]: next }));
    setComments((list) => list.map((row) => (row.id === c.id ? bump(row) : row)));
    try {
      await vote(c.id, user.id, next);
    } catch {
      setVotes((v) => ({ ...v, [c.id]: prev }));
      setComments((list) => list.map((row) => (row.id === c.id ? { ...row, up_count: c.up_count, down_count: c.down_count } : row)));
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!isAuthenticated) return openAuth();
    const body = text.trim();
    if (body.length < 2) return setError('Write a little more first.');
    setPosting(true);
    setError('');
    try {
      const { comment } = await postComment(creatorId, body);
      setComments((list) => [comment, ...list]);
      setTotal((t) => t + 1);
      setText('');
    } catch (err) {
      if (err.needsHandle) setPickingHandle(true);
      else setError(err.message);
    } finally {
      setPosting(false);
    }
  };

  const saveHandle = async (e) => {
    e.preventDefault();
    setPosting(true);
    setError('');
    try {
      const { handle } = await setHandle(handleInput);
      setProfile({ handle, avatar_url: profile?.avatar_url || null });
      setPickingHandle(false);
      if (text.trim()) {
        const { comment } = await postComment(creatorId, text.trim());
        setComments((list) => [comment, ...list]);
        setTotal((t) => t + 1);
        setText('');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setPosting(false);
    }
  };

  const report = async (c, reason) => {
    setReportFor(null);
    setReported((s) => new Set(s).add(c.id));
    try { await reportComment(c.id, user.id, reason); } catch { /* shown as reported either way */ }
  };

  const remove = async (c) => {
    try {
      await removeComment(c.id);
      setComments((list) => list.filter((row) => row.id !== c.id));
      setTotal((t) => Math.max(0, t - 1));
    } catch { /* leave it in place */ }
  };

  const hasMore = comments.length < total;
  // If comments can't load (outage, or before the tables exist), leave the
  // profile as it was rather than showing a broken section.
  if (loadError && comments.length === 0) return <div ref={rootRef} />;

  return (
    <div ref={rootRef} className="mt-12 pt-10 border-t border-neutral-200">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Comments{total > 0 ? ` · ${total.toLocaleString('en-US')}` : ''}</p>
          <h2 className="mt-1.5 text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-900">What people think of {name}</h2>
        </div>
        {total > 1 && (
          <div className="flex gap-1.5">
            {[['top', 'Top'], ['new', 'Newest']].map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setSort(k)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${sort === k ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-300'}`}
              >
                {l}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Composer, or the sign-in strip */}
      {isAuthenticated ? (
        <form onSubmit={pickingHandle ? saveHandle : submit} className={`${CARD} mt-5 p-4`}>
          {pickingHandle ? (
            <div>
              <p className="text-sm font-semibold text-neutral-900">Pick a public name</p>
              <p className="text-sm text-neutral-700 mt-0.5">This is what people see next to your comments. You only do this once.</p>
              <div className="flex flex-col sm:flex-row gap-2.5 mt-3">
                <div className="flex-1 flex items-center rounded-lg border border-neutral-300 bg-white focus-within:border-neutral-900 px-3">
                  <span className="text-sm text-neutral-600">@</span>
                  <input
                    autoFocus
                    value={handleInput}
                    onChange={(e) => { setHandleInput(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20)); setError(''); }}
                    placeholder="yourname"
                    aria-label="Public name"
                    className="flex-1 py-2.5 pl-1 text-sm outline-none bg-transparent"
                  />
                </div>
                <button type="submit" disabled={posting} className="rounded-lg bg-brand hover:bg-brand-hover text-white px-5 py-2.5 text-sm font-semibold disabled:opacity-60">
                  {posting ? 'Saving…' : text.trim() ? 'Save and post' : 'Save name'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              <div className="hidden sm:block"><Avatar handle={profile?.handle || user?.email?.[0]} url={profile?.avatar_url} /></div>
              <div className="flex-1 min-w-0">
                <textarea
                  value={text}
                  onChange={(e) => { setText(e.target.value.slice(0, MAX)); setError(''); }}
                  rows={2}
                  placeholder={`Say something about ${name}`}
                  aria-label="Your comment"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm resize-y min-h-[68px] focus:outline-none focus:border-neutral-900"
                />
                <div className="flex items-center gap-3 mt-2">
                  <p className="flex-1 text-xs text-neutral-700">
                    Keep it about the creator and their content. <Link to="/terms#community-rules" className="underline underline-offset-2">Community rules</Link>
                  </p>
                  <span className="text-xs text-neutral-600 tabular-nums">{text.length}/{MAX}</span>
                  <button type="submit" disabled={posting} className="rounded-lg bg-brand hover:bg-brand-hover text-white px-4 py-2 text-sm font-semibold disabled:opacity-60">
                    {posting ? 'Posting…' : 'Post'}
                  </button>
                </div>
              </div>
            </div>
          )}
          {error && <p role="alert" className="text-sm text-red-600 mt-2.5">{error}</p>}
        </form>
      ) : (
        <div className={`${CARD} mt-5 p-4 flex flex-wrap items-center gap-3`}>
          <MessageCircle className="w-5 h-5 text-neutral-600" aria-hidden="true" />
          <p className="flex-1 min-w-[180px] text-sm text-neutral-700">Sign in to comment and vote. It's free and takes a few seconds.</p>
          <button type="button" onClick={openAuth} className="rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white px-4 py-2 text-sm font-semibold">Sign in</button>
        </div>
      )}

      {/* Comments */}
      {comments.length > 0 ? (
        <div className={`${CARD} mt-3 divide-y divide-neutral-100 overflow-hidden`}>
          {comments.map((c) => {
            const mine = user && c.user_id === user.id;
            const v = votes[c.id] || 0;
            const handle = c.commenter_profiles?.handle || 'someone';
            return (
              <div key={c.id} className={`flex gap-3 p-4 ${c.status === 'held' ? 'bg-neutral-50' : ''}`}>
                <Avatar handle={handle} url={c.commenter_profiles?.avatar_url} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-semibold text-neutral-900">{mine ? 'You' : handle}</span>
                    {c.follows_creator && <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-violet-50 text-violet-700">Follows {name}</span>}
                    {c.status === 'held' && <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-neutral-100 text-neutral-700">Held for review</span>}
                    <span className="text-xs text-neutral-600">{formatRelativeTimeShort(c.created_at)}</span>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-neutral-800 whitespace-pre-line break-words">{c.body}</p>
                  {c.status === 'held' ? (
                    <p className="mt-1.5 text-xs text-neutral-600">Only you can see this until it's checked.</p>
                  ) : (
                    <div className="flex items-center gap-2 mt-2.5">
                      <button
                        type="button"
                        onClick={() => castVote(c, 1)}
                        aria-pressed={v === 1}
                        aria-label={`Thumbs up, ${c.up_count}`}
                        className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-[13px] tabular-nums transition-colors ${v === 1 ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-neutral-200 text-neutral-700 hover:border-neutral-300'}`}
                      >
                        <ThumbsUp className="w-3.5 h-3.5" aria-hidden="true" />{c.up_count}
                      </button>
                      <button
                        type="button"
                        onClick={() => castVote(c, -1)}
                        aria-pressed={v === -1}
                        aria-label={`Thumbs down, ${c.down_count}`}
                        className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-[13px] tabular-nums transition-colors ${v === -1 ? 'border-red-600 bg-red-50 text-red-700' : 'border-neutral-200 text-neutral-700 hover:border-neutral-300'}`}
                      >
                        <ThumbsDown className="w-3.5 h-3.5" aria-hidden="true" />{c.down_count}
                      </button>
                      <span className="flex-1" />
                      {mine ? (
                        <button type="button" onClick={() => remove(c)} className="text-xs text-neutral-600 hover:text-neutral-900">Delete</button>
                      ) : reported.has(c.id) ? (
                        <span className="text-xs text-neutral-600">Reported. Thanks.</span>
                      ) : isAuthenticated ? (
                        <div className="relative">
                          <button type="button" onClick={() => setReportFor(reportFor === c.id ? null : c.id)} className="text-xs text-neutral-600 hover:text-neutral-900">Report</button>
                          {reportFor === c.id && (
                            <div className="absolute right-0 top-6 z-10 w-52 bg-white border border-neutral-200 rounded-lg shadow-lg py-1">
                              {REPORT_REASONS.map(([k, l]) => (
                                <button key={k} type="button" onClick={() => report(c, k)} className="block w-full text-left px-3 py-2 text-sm text-neutral-800 hover:bg-neutral-50">{l}</button>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {hasMore && (
            <div className="p-3 text-center">
              <button type="button" disabled={loading} onClick={() => load(page + 1, false)} className="rounded-lg border border-neutral-200 hover:border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-900 disabled:opacity-60">
                {loading ? 'Loading…' : 'Show more comments'}
              </button>
            </div>
          )}
        </div>
      ) : visible && !loading ? (
        <p className="mt-4 text-sm text-neutral-700">
          Be the first to say something about {name}.
        </p>
      ) : null}
    </div>
  );
}
