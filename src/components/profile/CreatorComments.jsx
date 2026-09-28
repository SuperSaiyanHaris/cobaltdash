import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, ThumbsDown, ThumbsUp } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { formatRelativeTimeShort } from '../../lib/utils';
import {
  listComments, listReplies, getComment, myVotes, vote, reportComment, myHandle, postComment, setHandle, removeComment,
} from '../../services/commentsService';
import { progressFor } from '../../services/progressService';
import { LevelChip, BadgePill } from '../pass/BadgeChip';
import { RINGS, NAME_EFFECTS } from '../../lib/shinyPass';

// Comments on a creator's profile, with one level of replies. Loads only when
// scrolled near, so the profile's first paint is untouched. Posting goes
// through api/comments.js (word filter first); every new comment also lands
// in the owner's review list in /admin.

const CARD = 'bg-white border border-neutral-200/80 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04)]';
const MAX = 500;
const SHOWN_REPLIES = 2;
const OFFICIAL = 'shinypull';
const TINTS = [
  'bg-violet-100 text-violet-800', 'bg-amber-100 text-amber-800', 'bg-sky-100 text-sky-800',
  'bg-emerald-100 text-emerald-800', 'bg-rose-100 text-rose-800', 'bg-indigo-100 text-indigo-800',
];
const REPORT_REASONS = [['harmful', 'Harmful or dangerous'], ['harassment', 'Harassment or hate'], ['spam', 'Spam']];

function Avatar({ handle, url, small }) {
  const [broken, setBroken] = useState(false);
  const size = small ? 'w-7 h-7 text-[11px]' : 'w-9 h-9 text-[13px]';
  if (handle === OFFICIAL) {
    return <img src="/logo-mark.svg" alt="" className={`${size} rounded-full bg-[#0a0a0f] p-1 flex-shrink-0`} />;
  }
  if (url && !broken) {
    return <img src={url} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} className={`${size} rounded-full object-cover flex-shrink-0`} />;
  }
  const h = handle || '?';
  const tint = TINTS[[...h].reduce((a, c) => a + c.charCodeAt(0), 0) % TINTS.length];
  return <div className={`${size} rounded-full flex items-center justify-center font-semibold flex-shrink-0 ${tint}`}>{h.slice(0, 2).toUpperCase()}</div>;
}

const openAuth = () => window.dispatchEvent(new CustomEvent('openAuthPanel', { detail: { message: 'Sign in to comment and vote.' } }));

export default function CreatorComments({ creatorId, name }) {
  const { user, isAuthenticated } = useAuth();
  const [params] = useSearchParams();
  const focusId = params.get('comment');
  const rootRef = useRef(null);
  const [visible, setVisible] = useState(!!focusId);
  const [sort, setSort] = useState('top');
  const [comments, setComments] = useState([]);
  const [replies, setReplies] = useState({}); // parentId -> [reply]
  const [passInfo, setPassInfo] = useState({}); // userId -> { xp, equipped, badges }
  const [expanded, setExpanded] = useState(() => new Set(focusId ? [focusId] : []));
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [votes, setVotes] = useState({});
  const [profile, setProfile] = useState(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [posting, setPosting] = useState(false);
  const [handleInput, setHandleInput] = useState('');
  const [replyTo, setReplyTo] = useState(null); // top-level comment id
  const [replyText, setReplyText] = useState('');
  const [replyError, setReplyError] = useState('');
  const [reportFor, setReportFor] = useState(null);
  const [reported, setReported] = useState(() => new Set());

  // Load only once the section is near the viewport (or a link points here).
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
      let { comments: rows, total: count } = await listComments(creatorId, { sort, page: nextPage });
      if (replace && focusId && !rows.some((r) => r.id === focusId)) {
        const focused = await getComment(focusId);
        if (focused && focused.creator_id === creatorId) rows = [focused, ...rows];
      }
      const kids = await listReplies(rows.map((r) => r.id));
      const byParent = {};
      for (const r of kids) (byParent[r.parent_id] ||= []).push(r);
      setComments((prev) => (replace ? rows : [...prev, ...rows.filter((r) => !prev.some((p) => p.id === r.id))]));
      setReplies((prev) => ({ ...(replace ? {} : prev), ...byParent }));
      progressFor([...rows, ...kids].map((r) => r.user_id)).then((m) => setPassInfo((prev) => ({ ...prev, ...m }))).catch(() => {});
      setTotal(count);
      setPage(nextPage);
      if (user) {
        const mine = await myVotes([...rows, ...kids].map((r) => r.id), user.id);
        setVotes((prev) => ({ ...(replace ? {} : prev), ...mine }));
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [creatorId, sort, user, focusId]);

  useEffect(() => { if (visible && creatorId) load(0, true); }, [visible, creatorId, load]);
  useEffect(() => {
    if (!visible || !user) { setProfile(null); setProfileLoaded(false); return; }
    myHandle(user.id).then((p) => { setProfile(p); setProfileLoaded(true); }).catch(() => setProfileLoaded(true));
  }, [visible, user]);

  // Arriving from the Replies page: scroll to the thread once it's rendered.
  useEffect(() => {
    if (!focusId || !comments.length) return;
    const el = document.getElementById(`c-${focusId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focusId, comments.length]);

  useEffect(() => {
    if (!reportFor) return;
    const onDown = (e) => { if (!e.target.closest('[data-report-menu]')) setReportFor(null); };
    const onKey = (e) => { if (e.key === 'Escape') setReportFor(null); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [reportFor]);

  const patch = (id, fn) => {
    setComments((list) => list.map((row) => (row.id === id ? fn(row) : row)));
    setReplies((map) => Object.fromEntries(Object.entries(map).map(([k, list]) => [k, list.map((row) => (row.id === id ? fn(row) : row))])));
  };

  const castVote = async (c, value) => {
    if (!isAuthenticated) return openAuth();
    const prev = votes[c.id] || 0;
    const next = prev === value ? 0 : value;
    setVotes((v) => ({ ...v, [c.id]: next }));
    patch(c.id, (row) => ({
      ...row,
      up_count: row.up_count - (prev === 1) + (next === 1),
      down_count: row.down_count - (prev === -1) + (next === -1),
    }));
    try {
      await vote(c.id, user.id, next);
    } catch {
      setVotes((v) => ({ ...v, [c.id]: prev }));
      patch(c.id, (row) => ({ ...row, up_count: c.up_count, down_count: c.down_count }));
    }
  };

  const submit = async (e) => {
    e.preventDefault();
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
      if (err.needsHandle) setProfile(null);
      setError(err.message);
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
    } catch (err) {
      setError(err.message);
    } finally {
      setPosting(false);
    }
  };

  const startReply = (top, mention) => {
    if (!isAuthenticated) return openAuth();
    setReplyTo(top.id);
    setReplyError('');
    setReplyText(mention && mention !== profile?.handle ? `@${mention} ` : '');
    setExpanded((s) => new Set(s).add(top.id));
  };

  const sendReply = async (e, top) => {
    e.preventDefault();
    const body = replyText.trim();
    if (body.length < 2) return setReplyError('Write a little more first.');
    setPosting(true);
    setReplyError('');
    try {
      const { comment } = await postComment(creatorId, body, top.id);
      setReplies((map) => ({ ...map, [top.id]: [...(map[top.id] || []), comment] }));
      setReplyTo(null);
      setReplyText('');
    } catch (err) {
      setReplyError(err.message);
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
      if (c.parent_id) {
        setReplies((map) => ({ ...map, [c.parent_id]: (map[c.parent_id] || []).filter((r) => r.id !== c.id) }));
      } else {
        setComments((list) => list.filter((row) => row.id !== c.id));
        setTotal((t) => Math.max(0, t - 1));
      }
    } catch { /* leave it in place */ }
  };

  const hasMore = comments.length < total;
  // If comments can't load (outage), leave the profile as it was rather than
  // showing a broken section.
  if (loadError && comments.length === 0) return <div ref={rootRef} />;

  const needsName = isAuthenticated && profileLoaded && !profile;

  const renderComment = (c, top) => {
    const isReply = !!c.parent_id;
    const mine = user && c.user_id === user.id;
    const v = votes[c.id] || 0;
    const handle = c.commenter_profiles?.handle || 'someone';
    const info = passInfo[c.user_id];
    const ring = info?.equipped?.ring && RINGS[info.equipped.ring];
    const nameFx = info?.equipped?.name && NAME_EFFECTS[info.equipped.name];
    const pill = (on, onCls) => `inline-flex items-center gap-1.5 ${isReply ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-[13px]'} rounded-full border tabular-nums transition-colors ${on ? onCls : 'border-neutral-200 text-neutral-700 hover:border-neutral-300'}`;
    return (
      <div id={`c-${c.id}`} className={`flex gap-3 ${c.status === 'held' ? 'opacity-80' : ''}`}>
        {ring ? (
          <span className="self-start rounded-full p-[2px] flex-shrink-0" style={{ background: `conic-gradient(from 20deg, ${ring.a}, ${ring.b}, ${ring.a})` }}>
            <Avatar handle={handle} url={c.commenter_profiles?.avatar_url} small={isReply} />
          </span>
        ) : <Avatar handle={handle} url={c.commenter_profiles?.avatar_url} small={isReply} />}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {c.commenter_profiles?.handle
              ? (nameFx
                ? (
                  // Name effect: foil text on a small dark nameplate so it
                  // stays readable on the light comment background.
                  <Link to={`/u/${handle}`} className="inline-flex rounded-md bg-[#0a0a0f] px-1.5 py-[1px] hover:opacity-90">
                    <span className="sp-name-fx text-sm font-bold" style={{ backgroundImage: `linear-gradient(100deg, ${nameFx.stops[0]}, ${nameFx.stops[1]} 50%, ${nameFx.stops[2]})` }}>{mine ? 'You' : handle}</span>
                  </Link>
                )
                : <Link to={`/u/${handle}`} className="text-sm font-semibold text-neutral-900 hover:underline">{mine ? 'You' : handle}</Link>)
              : <span className="text-sm font-semibold text-neutral-900">{mine ? 'You' : handle}</span>}
            {info && handle !== OFFICIAL && <LevelChip xp={info.xp} />}
            {info?.equipped?.badge && info.badges.includes(info.equipped.badge) && <BadgePill badge={info.equipped.badge} />}
            {handle === OFFICIAL && <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-neutral-900 text-white">Official</span>}
            {c.follows_creator && handle !== OFFICIAL && <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-violet-50 text-violet-700">Follows {name}</span>}
            <span className="text-xs text-neutral-600">{formatRelativeTimeShort(c.created_at)}</span>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-neutral-800 whitespace-pre-line break-words">
            {c.body.split(/(^@[a-z0-9_.]+)/).map((part, i) => (part.startsWith('@') && i === 1 ? <span key={i} className="font-semibold text-violet-700">{part}</span> : part))}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <button type="button" onClick={() => castVote(c, 1)} aria-pressed={v === 1} aria-label={`Thumbs up, ${c.up_count}`} className={pill(v === 1, 'border-emerald-600 bg-emerald-50 text-emerald-700')}>
              <ThumbsUp className="w-3.5 h-3.5" aria-hidden="true" />{c.up_count}
            </button>
            <button type="button" onClick={() => castVote(c, -1)} aria-pressed={v === -1} aria-label={`Thumbs down, ${c.down_count}`} className={pill(v === -1, 'border-red-600 bg-red-50 text-red-700')}>
              <ThumbsDown className="w-3.5 h-3.5" aria-hidden="true" />{c.down_count}
            </button>
            <button type="button" onClick={() => startReply(top, isReply ? handle : null)} className="text-xs font-semibold text-neutral-700 hover:text-neutral-900 px-1.5">Reply</button>
            <span className="flex-1" />
            {mine ? (
              <button type="button" onClick={() => remove(c)} className="text-xs text-neutral-600 hover:text-neutral-900">Delete</button>
            ) : reported.has(c.id) ? (
              <span className="text-xs text-neutral-600">Reported. Thanks.</span>
            ) : isAuthenticated ? (
              <div className="relative" data-report-menu>
                <button type="button" aria-expanded={reportFor === c.id} onClick={() => setReportFor(reportFor === c.id ? null : c.id)} className="text-xs text-neutral-600 hover:text-neutral-900">Report</button>
                {reportFor === c.id && (
                  <div className="absolute right-0 top-6 z-30 w-52 bg-white border border-neutral-200 rounded-lg shadow-lg py-1">
                    {REPORT_REASONS.map(([k, l]) => (
                      <button key={k} type="button" onClick={() => report(c, k)} className="block w-full text-left px-3 py-2 text-sm text-neutral-800 hover:bg-neutral-50">{l}</button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div id="comments" ref={rootRef} className="mt-12 pt-10 border-t border-neutral-200 scroll-mt-24">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Comments{total > 0 ? ` · ${total.toLocaleString('en-US')}` : ''}</p>
          <h2 className="mt-1.5 text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-900">What people think of {name}</h2>
        </div>
        {total > 1 && (
          <div className="flex gap-1.5">
            {[['top', 'Top'], ['new', 'Newest']].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setSort(k)} className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${sort === k ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-300'}`}>
                {l}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Composer: sign-in strip, the one-time name step, or the comment box */}
      {!isAuthenticated ? (
        <div className={`${CARD} mt-5 p-4 flex flex-wrap items-center gap-3`}>
          <MessageCircle className="w-5 h-5 text-neutral-600" aria-hidden="true" />
          <p className="flex-1 min-w-[180px] text-sm text-neutral-700">Sign in to comment and vote. It's free and takes a few seconds.</p>
          <button type="button" onClick={openAuth} className="rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white px-4 py-2 text-sm font-semibold">Sign in</button>
        </div>
      ) : needsName ? (
        <form onSubmit={saveHandle} className={`${CARD} mt-5 p-4`}>
          <p className="text-sm font-semibold text-neutral-900">Pick a public name to start commenting</p>
          <p className="text-sm text-neutral-700 mt-0.5">It shows next to your comments and replies. You only do this once.</p>
          <div className="flex flex-col sm:flex-row gap-2.5 mt-3">
            <div className="flex-1 flex items-center rounded-lg border border-neutral-300 bg-white focus-within:border-neutral-900 px-3">
              <span className="text-sm text-neutral-600">@</span>
              <input
                value={handleInput}
                onChange={(e) => { setHandleInput(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20)); setError(''); }}
                placeholder="yourname"
                aria-label="Public name"
                className="flex-1 py-2.5 pl-1 text-sm outline-none bg-transparent"
              />
            </div>
            <button type="submit" disabled={posting} className="rounded-lg bg-brand hover:bg-brand-hover text-white px-5 py-2.5 text-sm font-semibold disabled:opacity-60">
              {posting ? 'Saving…' : 'Save name'}
            </button>
          </div>
          {error && <p role="alert" className="text-sm text-red-600 mt-2.5">{error}</p>}
        </form>
      ) : (
        <form onSubmit={submit} className={`${CARD} mt-5 p-4`}>
          <div className="flex gap-3">
            <div className="hidden sm:block"><Avatar handle={profile?.handle} url={profile?.avatar_url} /></div>
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
          {error && <p role="alert" className="text-sm text-red-600 mt-2.5">{error}</p>}
        </form>
      )}

      {/* Comments and their replies */}
      {comments.length > 0 ? (
        <div className={`${CARD} mt-3 divide-y divide-neutral-100`}>
          {comments.map((c) => {
            const kids = replies[c.id] || [];
            const open = expanded.has(c.id);
            const shown = open ? kids : kids.slice(0, SHOWN_REPLIES);
            return (
              <div key={c.id} className={`p-4 first:rounded-t-xl last:rounded-b-xl ${focusId === c.id ? 'bg-violet-50/40' : ''}`}>
                {renderComment(c, c)}
                {(shown.length > 0 || replyTo === c.id) && (
                  <div className="mt-3 ml-3 sm:ml-12 pl-3 sm:pl-4 border-l-2 border-neutral-100 space-y-4">
                    {shown.map((r) => <div key={r.id}>{renderComment(r, c)}</div>)}
                    {kids.length > SHOWN_REPLIES && (
                      open ? (
                        <button type="button" onClick={() => { setExpanded((s) => { const n = new Set(s); n.delete(c.id); return n; }); document.getElementById(`c-${c.id}`)?.scrollIntoView({ block: 'nearest' }); }} className="text-xs font-semibold text-violet-700 hover:text-violet-900">
                          Hide replies
                        </button>
                      ) : (
                        <button type="button" onClick={() => setExpanded((s) => new Set(s).add(c.id))} className="text-xs font-semibold text-violet-700 hover:text-violet-900">
                          View {kids.length - SHOWN_REPLIES} more {kids.length - SHOWN_REPLIES === 1 ? 'reply' : 'replies'}
                        </button>
                      )
                    )}
                    {replyTo === c.id && (
                      needsName ? (
                        <p className="text-sm text-neutral-700">Pick a public name above first.</p>
                      ) : (
                        <form onSubmit={(e) => sendReply(e, c)}>
                          <textarea
                            autoFocus
                            value={replyText}
                            onChange={(e) => { setReplyText(e.target.value.slice(0, MAX)); setReplyError(''); }}
                            rows={2}
                            placeholder={`Reply to ${c.commenter_profiles?.handle || 'this comment'}`}
                            aria-label="Your reply"
                            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm resize-y min-h-[60px] focus:outline-none focus:border-neutral-900"
                          />
                          <div className="flex items-center justify-end gap-2 mt-2">
                            {replyError && <p role="alert" className="flex-1 text-sm text-red-600">{replyError}</p>}
                            <button type="button" onClick={() => { setReplyTo(null); setReplyError(''); }} className="px-3 py-1.5 text-sm font-semibold text-neutral-700 hover:text-neutral-900">Cancel</button>
                            <button type="submit" disabled={posting} className="rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white px-4 py-1.5 text-sm font-semibold disabled:opacity-60">
                              {posting ? 'Replying…' : 'Reply'}
                            </button>
                          </div>
                        </form>
                      )
                    )}
                  </div>
                )}
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
        <p className="mt-4 text-sm text-neutral-700">Be the first to say something about {name}.</p>
      ) : null}
    </div>
  );
}
