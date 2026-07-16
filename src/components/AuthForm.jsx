import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Mail, Lock, Star, Scale, Clock, BarChart3, Info, CheckCircle, AlertCircle } from 'lucide-react';

/**
 * Shared auth form used by BOTH the slide-out AuthPanel (contextual "sign in to
 * follow" prompts) and the dedicated AuthPage (/auth/sign-in, /auth/sign-up).
 * Keeping the form in one place means the two surfaces can never drift.
 *
 * Props:
 *  - mode / setMode: controlled 'signin' | 'signup' | 'reset'
 *  - onSuccess(): called after a successful password sign-in (panel closes; page redirects)
 *  - contextMessage: optional prompt shown at the top
 *  - showBenefits: render the "what you get" block under the signup form
 */
export default function AuthForm({ mode, setMode, onSuccess, contextMessage, showBenefits = true }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/` },
      });
      if (error) throw error;
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // Supabase returns a user with no identities when the email already exists
        if (data?.user && data.user.identities?.length === 0) {
          setMode('signin');
          setError('');
          setMessage('An account with this email already exists. Sign in below.');
          setPassword('');
        } else {
          setMessage('Check your email for the confirmation link.');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onSuccess?.();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset`,
      });
      if (error) throw error;
      setMessage('Check your email for the password reset link.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setMode(mode === 'signin' ? 'signup' : 'signin');
    setError('');
    setMessage('');
  };

  return (
    <div>
      {/* Context message (e.g. "Sign in to follow creators") */}
      {contextMessage && (
        <div className="mb-6 bg-indigo-50 border border-indigo-200 rounded-xl p-3.5 flex items-start gap-3">
          <Info className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-indigo-900 font-medium">{contextMessage}</p>
        </div>
      )}

      <p className="text-sm text-neutral-600 mb-6">
        {mode === 'signup'
          ? 'Free forever. No card required.'
          : mode === 'reset'
          ? 'Enter your email to receive a password reset link.'
          : 'Sign in to manage your ShinyPull account.'}
      </p>

      {/* Google, hidden in reset mode */}
      {mode !== 'reset' && (
        <>
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full bg-white text-neutral-900 py-2.5 rounded-xl font-semibold border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 transition-colors flex items-center justify-center gap-2.5 mb-5 disabled:opacity-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            <span className="text-sm">Continue with Google</span>
          </button>

          <div className="relative mb-5">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-neutral-200" /></div>
            <div className="relative flex justify-center"><span className="px-3 bg-white text-xs text-neutral-400 uppercase tracking-widest font-semibold">or with email</span></div>
          </div>
        </>
      )}

      {/* Email + password */}
      <form onSubmit={mode === 'reset' ? handleResetPassword : handleEmailAuth} className="space-y-3.5">
        <div>
          <label className="block text-xs font-semibold text-neutral-700 mb-1.5 uppercase tracking-wider">Email</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white border border-neutral-200 rounded-xl py-2.5 pl-10 pr-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 transition-all"
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>
        </div>

        {mode !== 'reset' && (
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1.5 uppercase tracking-wider">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white border border-neutral-200 rounded-xl py-2.5 pl-10 pr-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 transition-all"
                placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your password'}
                required
                minLength={6}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 rounded-xl text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span className="flex-1">{error}</span>
          </div>
        )}

        {message && (
          <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-2.5 rounded-xl text-sm">
            <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span className="flex-1">{message}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-neutral-900 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-1"
        >
          {loading ? 'Loading…' : mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'}
        </button>
      </form>

      {/* Forgot password — only in signin */}
      {mode === 'signin' && (
        <div className="mt-3 text-center">
          <button
            onClick={() => { setMode('reset'); setError(''); setMessage(''); }}
            className="text-sm text-neutral-500 hover:text-neutral-900 transition-colors"
          >
            Forgot your password?
          </button>
        </div>
      )}

      {/* Toggle mode */}
      <div className="mt-5 pt-5 border-t border-neutral-200 text-center">
        <button
          onClick={mode === 'reset' ? () => { setMode('signin'); setError(''); setMessage(''); } : toggleMode}
          className="text-sm text-neutral-700 hover:text-neutral-900 font-medium transition-colors"
        >
          {mode === 'reset' ? (
            'Back to sign in'
          ) : mode === 'signin' ? (
            <>Don't have an account? <span className="text-indigo-600">Sign up</span></>
          ) : (
            <>Already have an account? <span className="text-indigo-600">Sign in</span></>
          )}
        </button>
      </div>

      {/* Benefits — only on signup, below the CTA */}
      {showBenefits && mode === 'signup' && (
        <div className="mt-7 pt-6 border-t border-neutral-200">
          <p className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-4">What you get</p>
          <div className="space-y-3.5">
            {[
              { Icon: Star,       title: 'Follow creators',    body: 'Build a personal feed of the creators you care about.' },
              { Icon: BarChart3,  title: 'Personal dashboard', body: 'Track followed creators, live status, growth at a glance.' },
              { Icon: Scale,      title: 'Save comparisons',   body: 'Pin head-to-head matchups and revisit them anytime.' },
              { Icon: Clock,      title: 'Recently viewed',    body: 'Jump back to the profiles you were just looking at.' },
            ].map((b) => (
              <div key={b.title} className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center flex-shrink-0">
                  <b.Icon className="w-3.5 h-3.5 text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-neutral-900">{b.title}</p>
                  <p className="text-xs text-neutral-500 leading-relaxed mt-0.5">{b.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
