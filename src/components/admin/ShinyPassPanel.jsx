import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { adminPassOverview } from '../../services/progressService';
import { PLATFORM_DISPLAY_NAMES } from '../../lib/constants';

// Admin view of ShinyPass: totals, and every Featured Listing voucher won in
// a pack (who won it, which pack, whether it's been used and on whom).
// Reward listings have no Stripe subscription and end on their own.
export default function ShinyPassPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [now] = useState(() => Date.now());
  useEffect(() => { adminPassOverview().then(setData).catch((e) => setError(e.message)); }, []);

  if (error) return <p className="text-sm font-semibold text-red-600">{error}</p>;
  if (!data) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-neutral-500 animate-spin" /></div>;

  const t = data.totals;
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[['Players', t.users], ['Packs opened', t.packsOpened], ['Top level', t.topLevel], ['Average level', t.avgLevel], ['Best streak', t.bestStreak]].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-neutral-200 bg-white p-4">
            <p className="text-2xl font-extrabold text-neutral-900 tabular-nums">{value}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-neutral-600">{label}</p>
          </div>
        ))}
      </div>

      <div>
        <h3 className="text-lg font-extrabold text-neutral-900">Featured Listing vouchers</h3>
        <p className="mt-1 text-sm text-neutral-700">Won in packs. Each one is a 30-day Basic listing that ends on its own.</p>
        {data.vouchers.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-700">None won yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-neutral-700">
                <tr><th className="px-4 py-2.5 font-bold">Won by</th><th className="px-4 py-2.5 font-bold">Pack</th><th className="px-4 py-2.5 font-bold">Status</th><th className="px-4 py-2.5 font-bold">Featuring</th><th className="px-4 py-2.5 font-bold">Won</th></tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {data.vouchers.map((v) => {
                  const expired = v.status === 'unused' && new Date(v.expires_at).getTime() < now;
                  return (
                    <tr key={v.id}>
                      <td className="px-4 py-2.5 font-semibold text-neutral-900">{v.handle ? <Link className="underline" to={`/u/${v.handle}`}>@{v.handle}</Link> : <span className="text-neutral-600">{v.user_id.slice(0, 8)}</span>}</td>
                      <td className="px-4 py-2.5 tabular-nums">Level {v.source_level}</td>
                      <td className="px-4 py-2.5">{expired ? 'Expired' : v.status === 'unused' ? 'Not used yet' : v.status === 'redeemed' ? 'Used' : 'Expired'}</td>
                      <td className="px-4 py-2.5">{v.creators ? <Link className="underline" to={`/${v.creators.platform}/${v.creators.username}`}>{v.creators.display_name} ({PLATFORM_DISPLAY_NAMES[v.creators.platform]})</Link> : '-'}</td>
                      <td className="px-4 py-2.5 tabular-nums text-neutral-700">{new Date(v.created_at).toLocaleDateString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
