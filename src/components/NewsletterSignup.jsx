import { useState } from 'react';
import { Mail, CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const NEWSLETTER_BLURB = "Now and then, the stories behind the numbers: who's growing, who's slipping, and why. No spam, unsubscribe anytime.";

/**
 * Newsletter signup form. Three variants:
 *  - "card": full precision-card treatment for Blog.jsx / BlogPost.jsx
 *  - "bar": the dark panel at the top of the site footer
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

  // Footer panel: a dark card echoing the home hero (dot grid, glow, glass
  // input). The copy stays general on purpose: the newsletter is sent by
  // hand, now and then, so it promises nothing automated or on a schedule.
  if (variant === 'bar') {
    return (
      <div className={`relative isolate overflow-hidden rounded-3xl bg-[#0a0a0f] text-white px-6 py-8 sm:px-10 sm:py-10 ${className}`}>
        <div aria-hidden="true" className="absolute inset-0 hero-dot-grid pointer-events-none" />

        <div className="relative flex flex-col lg:flex-row lg:items-center gap-6 lg:gap-12">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-300">Newsletter</p>
            <h2 className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight">The ShinyPull newsletter</h2>
            <p className="mt-2 text-sm sm:text-base text-white/60 max-w-xl text-pretty">
              {NEWSLETTER_BLURB}
            </p>
          </div>
          {status === 'success' ? (
            <p className="flex items-center gap-2 text-sm text-white/80 flex-shrink-0">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              You're on the list.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="w-full lg:w-[26rem] flex-shrink-0">
              <div className="relative flex items-center bg-white/[0.08] backdrop-blur-xl rounded-2xl border border-white/15 focus-within:border-white/30 focus-within:bg-white/[0.12] transition-colors">
                <Mail className="absolute left-4 w-4 h-4 text-white/50 pointer-events-none" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  aria-label="Email address"
                  disabled={status === 'loading'}
                  className="w-full pl-11 pr-32 py-3.5 bg-transparent text-white placeholder-white/50 focus:outline-none text-sm disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="absolute right-1.5 inline-flex items-center justify-center min-w-[104px] px-4 py-2.5 bg-white text-neutral-900 hover:bg-white/90 text-sm font-semibold rounded-xl transition-colors disabled:opacity-60"
                >
                  {status === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Subscribe'}
                </button>
              </div>
              {status === 'error' && <p className="mt-2 text-xs text-red-300">{errorMessage}</p>}
            </form>
          )}
        </div>
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
            <p className="text-sm text-neutral-600 leading-relaxed">The occasional email, no spam.</p>
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
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-600 mb-3">Newsletter</p>
      {status === 'success' ? (
        <>
          <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-3" />
          <h2 className="text-xl sm:text-2xl font-semibold text-neutral-900 mb-2 tracking-tight">You're on the list</h2>
          <p className="text-sm text-neutral-500 max-w-md mx-auto">
            We'll be in touch when there's something worth reading.
          </p>
        </>
      ) : (
        <>
          <h2 className="text-xl sm:text-2xl font-semibold text-neutral-900 mb-3 tracking-tight">
            The ShinyPull newsletter
          </h2>
          <p className="text-sm text-neutral-500 mb-6 max-w-md mx-auto">
            {NEWSLETTER_BLURB}
          </p>
          <form onSubmit={handleSubmit} className="max-w-sm mx-auto space-y-3">
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                aria-label="Email address"
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
