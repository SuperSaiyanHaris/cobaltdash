import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { adminQueue, moderateComment } from '../../services/commentsService';
import { formatRelativeTimeShort } from '../../lib/utils';

// Admin moderation for profile comments: held (the classifier couldn't
// check them, or 3 reports hid them), reported but still visible, and recent.
const LISTS = [
  ['held', 'Held or hidden', 'Not public. Approve to show it, or leave hidden.'],
  ['reported', 'Reported', 'Public, with at least one report.'],
  ['recent', 'Recent', 'The latest public comments.'],
];

export default function CommentsPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [list, setList] = useState('held');
  const [busy, setBusy] = useState(null);

  const load = () => adminQueue().then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const act = async (id, status) => {
    setBusy(id);
    try { await moderateComment(id, status); await load(); } catch (e) { setError(e.message); } finally { setBusy(null); }
  };

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-neutral-600" /></div>;

  const rows = data[list] || [];
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {LISTS.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setList(k)} className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${list === k ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-700 border-neutral-200'}`}>
            {l} <span className="opacity-70">{data[k]?.length || 0}</span>
          </button>
        ))}
      </div>
      <p className="text-sm text-neutral-700 mt-3">{LISTS.find(([k]) => k === list)[2]}</p>
      <div className="mt-4 bg-white border border-neutral-200/80 rounded-xl divide-y divide-neutral-100">
        {rows.length === 0 && <p className="p-5 text-sm text-neutral-700">Nothing here.</p>}
        {rows.map((c) => (
          <div key={c.id} className="p-4 flex gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-700">
                <span className="font-semibold text-neutral-900">@{c.commenter_profiles?.handle}</span>
                <span>on</span>
                {c.creators && <Link to={`/${c.creators.platform}/${c.creators.username}`} className="underline">{c.creators.display_name}</Link>}
                <span>{formatRelativeTimeShort(c.created_at)}</span>
                <span className="px-1.5 py-0.5 rounded bg-neutral-100">{c.status}</span>
                {c.report_count > 0 && <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700">{c.report_count} reports</span>}
                {c.moderation?.error && <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800">not checked: {c.moderation.error}</span>}
                <span>👍 {c.up_count} · 👎 {c.down_count}</span>
              </div>
              <p className="mt-1.5 text-sm text-neutral-900 whitespace-pre-line break-words">{c.body}</p>
            </div>
            <div className="flex flex-col gap-2 flex-shrink-0">
              {c.status !== 'visible' && (
                <button type="button" disabled={busy === c.id} onClick={() => act(c.id, 'visible')} className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-neutral-900 text-white disabled:opacity-60">Approve</button>
              )}
              {c.status !== 'hidden' && (
                <button type="button" disabled={busy === c.id} onClick={() => act(c.id, 'hidden')} className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-neutral-300 text-neutral-900 disabled:opacity-60">Hide</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
