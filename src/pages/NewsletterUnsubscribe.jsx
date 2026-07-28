import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import SEO from '../components/SEO';
import { supabase } from '../lib/supabase';

export default function NewsletterUnsubscribe() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState('loading'); // loading | done | error

  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }
    supabase.functions
      .invoke('newsletter-unsubscribe', { body: { token } })
      .then(({ error }) => setStatus(error ? 'error' : 'done'))
      .catch(() => setStatus('error'));
  }, [token]);

  return (
    <div className="min-h-screen bg-[#fafaf9] flex items-center justify-center px-4 py-16">
      <SEO title="Unsubscribed" noindex />
      <div className="w-full max-w-md bg-white rounded-xl border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-8 sm:p-10 text-center">
        {status === 'loading' && (
          <Loader2 className="w-8 h-8 text-neutral-300 mx-auto mb-4 animate-spin" />
        )}
        {status === 'done' && (
          <>
            <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-4" />
            <h1 className="text-xl sm:text-2xl font-semibold text-neutral-900 mb-2 tracking-tight">
              You're unsubscribed
            </h1>
            <p className="text-sm text-neutral-500 mb-6">
              You won't get any more emails from ShinyPull.
            </p>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle className="w-10 h-10 text-neutral-400 mx-auto mb-4" />
            <h1 className="text-xl sm:text-2xl font-semibold text-neutral-900 mb-2 tracking-tight">
              Link not valid
            </h1>
            <p className="text-sm text-neutral-500 mb-6">
              This unsubscribe link is missing or has already been used.
            </p>
          </>
        )}
        {status !== 'loading' && (
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-neutral-900 text-white text-sm font-medium rounded-lg hover:bg-neutral-800 transition-colors"
          >
            Back to ShinyPull
          </Link>
        )}
      </div>
    </div>
  );
}
