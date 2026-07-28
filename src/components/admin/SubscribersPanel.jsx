import { useState, useEffect, useMemo } from 'react';
import { Search, Loader2, AlertCircle, CheckCircle, UserMinus, UserPlus, Mail } from 'lucide-react';
import {
  getSubscribers,
  unsubscribeSubscriber,
  resubscribeSubscriber,
} from '../../services/newsletterAdminService';
import { TIMEOUTS } from '../../lib/constants';

const CARD = 'bg-white border border-neutral-200/80 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04)]';

export default function SubscribersPanel() {
  const [subscribers, setSubscribers] = useState([]);
  const [total, setTotal] = useState(0);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionId, setActionId] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      setLoading(true);
      const data = await getSubscribers();
      setSubscribers(data.subscribers || []);
      setTotal(data.total ?? 0);
      setActive(data.active ?? 0);
    } catch {
      setError('Failed to load subscribers.');
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

  async function handleToggle(sub) {
    try {
      setActionId(sub.id);
      const updated = sub.unsubscribed_at
        ? await resubscribeSubscriber(sub.id)
        : await unsubscribeSubscriber(sub.id);
      setSubscribers(prev => prev.map(s => (s.id === updated.id ? updated : s)));
      setActive(prev => (sub.unsubscribed_at ? prev + 1 : prev - 1));
      showSuccess(sub.unsubscribed_at ? 'Resubscribed' : 'Unsubscribed');
    } catch (err) {
      showError(err.message || 'Failed to update subscriber');
    } finally {
      setActionId(null);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return subscribers;
    return subscribers.filter(s => s.email.toLowerCase().includes(q));
  }, [subscribers, search]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 text-neutral-300 animate-spin" />
      </div>
    );
  }

  return (
    <>
      {(error || success) && (
        <div className="mb-4">
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

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-4">
        <p className="text-sm text-neutral-500">{active} active &middot; {total} total</p>
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email..."
            className="w-full pl-9 pr-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-neutral-400 transition-colors"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className={`${CARD} p-12 text-center`}>
          <Mail className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-neutral-900 mb-2">
            {subscribers.length === 0 ? 'No subscribers yet' : 'No matches'}
          </h3>
          <p className="text-neutral-500">
            {subscribers.length === 0
              ? 'Subscribers will show up here as people sign up on the blog.'
              : 'Try a different search.'}
          </p>
        </div>
      ) : (
        <div className={`${CARD} divide-y divide-neutral-100 overflow-hidden`}>
          {filtered.map(sub => {
            const isUnsubscribed = !!sub.unsubscribed_at;
            return (
              <div key={sub.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-neutral-900 truncate">{sub.email}</p>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Subscribed {new Date(sub.subscribed_at).toLocaleDateString()}
                    {isUnsubscribed && ` · Unsubscribed ${new Date(sub.unsubscribed_at).toLocaleDateString()}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                  isUnsubscribed ? 'bg-neutral-100 text-neutral-500' : 'bg-emerald-50 text-emerald-700'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isUnsubscribed ? 'bg-neutral-400' : 'bg-emerald-500'}`} />
                  {isUnsubscribed ? 'Unsubscribed' : 'Active'}
                </span>
                <button
                  onClick={() => handleToggle(sub)}
                  disabled={actionId === sub.id}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-neutral-200 text-neutral-700 hover:bg-neutral-50 transition-colors disabled:opacity-50"
                >
                  {actionId === sub.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : isUnsubscribed ? (
                    <UserPlus className="w-3.5 h-3.5" />
                  ) : (
                    <UserMinus className="w-3.5 h-3.5" />
                  )}
                  {isUnsubscribed ? 'Resubscribe' : 'Unsubscribe'}
                </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
