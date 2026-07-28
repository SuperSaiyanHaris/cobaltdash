import { useState } from 'react';
import { Mail, CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Newsletter signup form. Two variants:
 *  - "card": full precision-card treatment for Blog.jsx / BlogPost.jsx
 *  - "compact": tight footer-column version, same behavior
 */
export default function NewsletterSignup({ variant = 'card', className = '' }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!emailRegex.test(email.trim())) {
      setStatus('error');
      setErrorMessage('Enter a valid email address.');
      return;
    }
    setStatus('loading');
    setErrorMessage('');
    try {
      const { error } = await supabase.functions.invoke('newsletter-subscribe', {
        body: { email: email.trim().toLowerCase() },
      });
      if (error) throw error;
      setStatus('success');
    } catch {
      setStatus('error');
      setErrorMessage('Something went wrong. Try again.');
    }
  }

  if (variant === 'bar') {
    return (
      <div className={`flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 ${className}`}>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-neutral-900">Get new posts by email</h3>
          <p className="text-sm text-neutral-500 mt-0.5">Creator milestones and platform data, no spam.</p>
        </div>
        {status === 'success' ? (
          <p className="flex items-center gap-1.5 text-sm text-neutral-600 flex-shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            You're subscribed.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex-shrink-0 w-full sm:w-auto">
            <div className="flex items-center gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                disabled={status === 'loading'}
                className="w-full sm:w-64 px-4 py-2.5 bg-white border border-neutral-200 rounded-lg text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-neutral-300 transition-colors disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={status === 'loading'}
                className="flex-shrink-0 px-5 py-2.5 bg-neutral-900 text-white text-sm font-medium rounded-lg hover:bg-neutral-800 transition-colors disabled:opacity-60"
              >
                {status === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Subscribe'}
              </button>
            </div>
            {status === 'error' && <p className="mt-1.5 text-xs text-red-600">{errorMessage}</p>}
          </form>
        )}
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div className={className}>
        <h3 className="text-xs font-semibold mb-3 text-neutral-900 uppercase tracking-wider">Newsletter</h3>
        {status === 'success' ? (
          <p className="flex items-center gap-1.5 text-sm text-neutral-600">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            You're subscribed.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-2">
            <p className="text-sm text-neutral-600 leading-relaxed">New posts, by email.</p>
            <div className="flex items-center gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                disabled={status === 'loading'}
                className="w-full min-w-0 px-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-neutral-300 transition-colors disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={status === 'loading'}
                className="flex-shrink-0 px-3 py-2 bg-neutral-900 text-white text-sm font-medium rounded-lg hover:bg-neutral-800 transition-colors disabled:opacity-60"
              >
                {status === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Join'}
              </button>
            </div>
            {status === 'error' && <p className="text-xs text-red-600">{errorMessage}</p>}
          </form>
        )}
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-8 sm:p-10 text-center ${className}`}>
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-400 mb-3">Newsletter</p>
      {status === 'success' ? (
        <>
          <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-3" />
          <h2 className="text-xl sm:text-2xl font-semibold text-neutral-900 mb-2 tracking-tight">You're subscribed</h2>
          <p className="text-sm text-neutral-500 max-w-md mx-auto">
            We'll email you whenever there's something new to read.
          </p>
        </>
      ) : (
        <>
          <h2 className="text-xl sm:text-2xl font-semibold text-neutral-900 mb-3 tracking-tight">
            Get new posts by email
          </h2>
          <p className="text-sm text-neutral-500 mb-6 max-w-md mx-auto">
            Creator milestones, platform data, and growth breakdowns. No spam, unsubscribe anytime.
          </p>
          <form onSubmit={handleSubmit} className="max-w-sm mx-auto space-y-3">
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                disabled={status === 'loading'}
                className="w-full pl-11 pr-4 py-3 bg-white border border-neutral-200 rounded-xl text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-neutral-300 transition-colors disabled:opacity-60"
              />
            </div>
            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full sm:w-auto sm:min-w-[200px] inline-flex items-center justify-center gap-2 px-6 py-3 bg-neutral-900 text-white text-sm font-medium rounded-lg hover:bg-neutral-800 transition-colors disabled:opacity-60"
            >
              {status === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Subscribe'}
            </button>
            {status === 'error' && <p className="text-xs text-red-600">{errorMessage}</p>}
          </form>
        </>
      )}
    </div>
  );
}
