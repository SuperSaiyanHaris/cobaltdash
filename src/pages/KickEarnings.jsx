import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Info } from 'lucide-react';
import SEO from '../components/SEO';
import KickIcon from '../components/KickIcon';
import CreatorAvatar from '../components/CreatorAvatar';
import { supabase } from '../lib/supabase';
import { formatNumber } from '../lib/utils';

// Kick's public creator terms: a standard sub is $4.99 (US) and the creator
// keeps 95%. Same constants as the Kick profile revenue card and middleware.js
// (the server-rendered copy of this page) — change all three together.
export const KICK_SUB_PRICE = 4.99;
export const KICK_CREATOR_SHARE = 0.95;
const PER_SUB = KICK_SUB_PRICE * KICK_CREATOR_SHARE;
const LEADERBOARD_SIZE = 100;

const CARD = 'bg-white border border-neutral-200/80 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04)]';
const MICRO = 'text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500';

function money(n) {
  if (!n || n < 0) return '$0';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e4) return '$' + Math.round(n / 1e3) + 'K';
  return '$' + Math.round(n).toLocaleString('en-US');
}

const FAQ = [
  ['How much does Kick pay per subscriber?', `A standard Kick subscription costs $${KICK_SUB_PRICE} in the US and Kick passes 95% of it to the streamer, so each active sub is worth about $${PER_SUB.toFixed(2)} a month before payment fees and taxes.`],
  ['Is this what streamers actually earn?', 'It is a ceiling for subscription income only. Regional pricing, payment processing and taxes lower it, and it leaves out tips (Kicks), sponsorships, and Kick\'s creator incentive payouts, none of which are public.'],
  ['Do gifted subs count?', 'Yes. Kick\'s public count is active paid subscriptions, gifted ones included, and a gifted sub pays the streamer the same as one bought directly.'],
  ['How often is this updated?', 'Paid subscriber counts are collected from Kick\'s API every day, and the leaderboard is rebuilt from the latest readings several times a day.'],
];

export default function KickEarnings() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [subs, setSubs] = useState(1000);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('rankings_cache')
      .select('creator_id, username, display_name, profile_image, subscribers, growth_30d, hours_watched_month, rank_position, computed_at')
      .eq('platform', 'kick')
      .eq('rank_type', 'subscribers')
      .order('rank_position', { ascending: true })
      .limit(LEADERBOARD_SIZE)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) setError('Could not load the leaderboard.');
        else setRows(data || []);
      });
    return () => { cancelled = true; };
  }, []);

  const monthly = Math.max(0, subs || 0) * PER_SUB;
  const updated = rows?.[0]?.computed_at ? new Date(rows[0].computed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

  return (
    <>
      <SEO
        title="How Much Do Kick Streamers Make? Estimated Sub Earnings (2026)"
        description="Estimated monthly Kick subscription earnings for the top 100 Kick streamers, from real paid subscriber counts at $4.99 with Kick's 95% creator share. Updated daily."
      />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="flex items-center gap-2 text-green-700">
          <KickIcon className="w-5 h-5" />
          <span className={MICRO}>Kick earnings</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-neutral-900 mt-3 tracking-tight text-balance">How much do Kick streamers make?</h1>
        <p className="text-[15px] leading-relaxed text-neutral-700 mt-4 max-w-2xl text-pretty">
          Kick is the one big streaming platform that publishes the number that pays: active paid subscribers. A sub costs ${KICK_SUB_PRICE} and Kick
          passes 95% to the streamer, so sub income is simple arithmetic. These are ceilings for subscription income only, from real daily counts.
        </p>

        {/* Calculator */}
        <div className={`${CARD} p-5 sm:p-6 mt-8`}>
          <p className={MICRO}>Sub earnings calculator</p>
          <div className="flex flex-col sm:flex-row sm:items-end gap-5 mt-4">
            <label className="flex-1">
              <span className="text-sm text-neutral-600">Active paid subscribers</span>
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={subs}
                onChange={(e) => setSubs(parseInt(e.target.value, 10) || 0)}
                className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-lg tabular-nums focus:outline-none focus:ring-2 focus:ring-green-600"
              />
            </label>
            <div className="sm:text-right">
              <p className="text-3xl font-bold tabular-nums text-neutral-900 leading-none">up to {money(monthly)}<span className="text-base font-medium text-neutral-500">/mo</span></p>
              <p className="text-sm text-neutral-500 mt-1.5">{money(monthly * 12)} per year &middot; ${PER_SUB.toFixed(2)} per sub</p>
            </div>
          </div>
        </div>

        {/* Leaderboard */}
        <div className="flex items-baseline justify-between gap-3 mt-10">
          <h2 className="text-xl font-semibold text-neutral-900">Top {LEADERBOARD_SIZE} Kick streamers by estimated sub earnings</h2>
          {updated && <span className="text-xs text-neutral-500 flex-shrink-0">Updated {updated}</span>}
        </div>
        <div className={`${CARD} mt-4 overflow-hidden`}>
          <div className={`hidden sm:grid grid-cols-12 gap-3 px-5 py-3 border-b border-neutral-200/80 ${MICRO}`}>
            <div className="col-span-1">#</div>
            <div className="col-span-5">Streamer</div>
            <div className="col-span-2 text-right">Paid subs</div>
            <div className="col-span-2 text-right">Est. / month</div>
            <div className="col-span-2 text-right">Est. / year</div>
          </div>
          {error && <p className="p-5 text-sm text-red-600">{error}</p>}
          {!rows && !error && Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-14 border-t border-neutral-100 animate-pulse bg-neutral-50/60" />
          ))}
          {rows?.map((r) => {
            const m = (r.subscribers || 0) * PER_SUB;
            return (
              <Link
                key={r.creator_id}
                to={`/kick/${r.username}`}
                className="grid grid-cols-12 gap-3 items-center px-5 py-3 border-t border-neutral-100 first:border-t-0 hover:bg-neutral-50 transition-colors"
              >
                <div className="col-span-1 text-sm tabular-nums text-neutral-500">{r.rank_position}</div>
                <div className="col-span-7 sm:col-span-5 flex items-center gap-3 min-w-0">
                  <CreatorAvatar src={r.profile_image} name={r.display_name || r.username} size="sm" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-900 truncate">{r.display_name || r.username}</p>
                    <p className="text-xs text-neutral-500 sm:hidden tabular-nums">{formatNumber(r.subscribers)} subs &middot; {money(m * 12)}/yr</p>
                  </div>
                </div>
                <div className="hidden sm:block col-span-2 text-right text-sm tabular-nums text-neutral-700">{(r.subscribers || 0).toLocaleString('en-US')}</div>
                <div className="col-span-4 sm:col-span-2 text-right text-sm font-semibold tabular-nums text-neutral-900">{money(m)}</div>
                <div className="hidden sm:block col-span-2 text-right text-sm tabular-nums text-neutral-600">{money(m * 12)}</div>
              </Link>
            );
          })}
        </div>
        <p className="flex items-start gap-2 text-xs text-neutral-500 mt-3 leading-relaxed">
          <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          Subscriptions only, at the US price, before payment fees and taxes. Tips, sponsorships and incentive payouts are not public and not included.
          See the <Link to="/methodology" className="underline hover:text-neutral-800">methodology</Link>.
        </p>

        {/* FAQ */}
        <h2 className="text-xl font-semibold text-neutral-900 mt-12">Kick earnings FAQ</h2>
        <div className="mt-4 space-y-5 max-w-2xl">
          {FAQ.map(([q, a]) => (
            <div key={q}>
              <h3 className="text-[15px] font-semibold text-neutral-900">{q}</h3>
              <p className="text-[15px] leading-relaxed text-neutral-700 mt-1">{a}</p>
            </div>
          ))}
        </div>

        <p className="text-sm text-neutral-600 mt-10">
          More: <Link to="/rankings/kick" className="underline hover:text-neutral-900">Kick rankings</Link> &middot;{' '}
          <Link to="/youtube/money-calculator" className="underline hover:text-neutral-900">YouTube money calculator</Link>
        </p>
      </div>
    </>
  );
}
