import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import Header from './components/Header';
import Footer from './components/Footer';
import ScrollToTop from './components/ScrollToTop';
import BackToTop from './components/BackToTop';
import ErrorBoundary from './components/ErrorBoundary';
import AuthPanel from './components/AuthPanel';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { isMac } from './lib/platform';

// Eagerly load the homepage (critical path)
import Home from './pages/Home';

// Auto-reload on chunk load failure (happens after new deployments).
// Returns a never-resolving promise after reload() so JS execution stops
// and doesn't nuke the sessionStorage flag before the page unloads.
function lazyWithRetry(importFn) {
  return lazy(() =>
    importFn().catch(() => {
      if (!sessionStorage.getItem('chunk_reload')) {
        sessionStorage.setItem('chunk_reload', '1');
        window.location.reload();
        return new Promise(() => {}); // halt — page is reloading
      }
      // Already reloaded once and still failing — let ErrorBoundary handle it
      sessionStorage.removeItem('chunk_reload');
      return importFn();
    })
  );
}

// Clear the reload flag on successful page loads
if (sessionStorage.getItem('chunk_reload')) {
  sessionStorage.removeItem('chunk_reload');
}

// Lazy load everything else — only downloaded when the route is visited
const CreatorProfile = lazyWithRetry(() => import('./pages/CreatorProfile'));
const Search = lazyWithRetry(() => import('./pages/Search'));
const Rankings = lazyWithRetry(() => import('./pages/Rankings'));
const Compare = lazyWithRetry(() => import('./pages/Compare'));
const LiveCount = lazyWithRetry(() => import('./pages/LiveCount'));
const Dashboard = lazyWithRetry(() => import('./pages/Dashboard'));
const About = lazyWithRetry(() => import('./pages/About'));
const Contact = lazyWithRetry(() => import('./pages/Contact'));
const Privacy = lazyWithRetry(() => import('./pages/Privacy'));
const Terms = lazyWithRetry(() => import('./pages/Terms'));
const Blog = lazyWithRetry(() => import('./pages/Blog'));
const BlogPost = lazyWithRetry(() => import('./pages/BlogPost'));
const Admin = lazyWithRetry(() => import('./pages/Admin'));
const ResetPassword = lazyWithRetry(() => import('./pages/ResetPassword'));
const AuthPage = lazyWithRetry(() => import('./pages/AuthPage'));
const Calculator = lazyWithRetry(() => import('./pages/Calculator'));
const Support = lazyWithRetry(() => import('./pages/Support'));
const Account = lazyWithRetry(() => import('./pages/Account'));
const Promote = lazyWithRetry(() => import('./pages/Promote'));
const Refunds = lazyWithRetry(() => import('./pages/Refunds'));
const ShareProfile = lazyWithRetry(() => import('./pages/ShareProfile'));
const Reports = lazyWithRetry(() => import('./pages/Reports'));
const FAQ = lazyWithRetry(() => import('./pages/FAQ'));
const Methodology = lazyWithRetry(() => import('./pages/Methodology'));
const Trending = lazyWithRetry(() => import('./pages/Trending'));
const Milestones = lazyWithRetry(() => import('./pages/Milestones'));
const HubPage = lazyWithRetry(() => import('./pages/HubPage'));
const HubIndex = lazyWithRetry(() => import('./pages/HubPage').then((m) => ({ default: m.HubIndex })));
const NewsletterUnsubscribe = lazyWithRetry(() => import('./pages/NewsletterUnsubscribe'));
const NotFound = lazyWithRetry(() => import('./pages/NotFound'));

// cmdk (command palette) and sonner (toasts) are 23 KB gzip between them, and
// neither is needed to paint anything. Both are pulled out of the critical
// bundle and mounted once the browser goes idle instead.
const CommandPalette = lazyWithRetry(() => import('./components/CommandPalette'));
const Toaster = lazyWithRetry(() => import('sonner').then((m) => ({ default: m.Toaster })));

/**
 * Mounts the command palette and the toast host after first idle.
 *
 * While waiting, this holds the palette's own trigger listeners (Cmd/Ctrl+K,
 * `/`, and the `openCommandPalette` event that Header and Home dispatch) so an
 * early trigger isn't dropped on the floor — it mounts immediately and passes
 * `startOpen` through. Idle normally fires within ~100ms of load, and the only
 * toast that fires without user input is Account's post-Stripe one behind a
 * 2000ms timer, so the toast host is always listening before it's needed.
 */
function DeferredOverlays() {
  const [mounted, setMounted] = useState(false);
  const [startOpen, setStartOpen] = useState(false);

  useEffect(() => {
    if (mounted) return undefined;

    let idleId;
    let timerId;
    const mount = (openPalette) => {
      if (openPalette) setStartOpen(true);
      setMounted(true);
    };

    const onKey = (e) => {
      const modPressed = isMac ? e.metaKey : e.ctrlKey;
      const isSlashOpen =
        e.key === '/' &&
        !['INPUT', 'TEXTAREA'].includes(e.target.tagName) &&
        !e.target.isContentEditable;
      if ((modPressed && e.key.toLowerCase() === 'k') || isSlashOpen) {
        e.preventDefault();
        mount(true);
      }
    };
    const onOpenEvent = () => mount(true);

    document.addEventListener('keydown', onKey);
    window.addEventListener('openCommandPalette', onOpenEvent);

    if (typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(() => mount(false), { timeout: 3000 });
    } else {
      timerId = setTimeout(() => mount(false), 1500);
    }

    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('openCommandPalette', onOpenEvent);
      if (idleId && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idleId);
      if (timerId) clearTimeout(timerId);
    };
  }, [mounted]);

  if (!mounted) return null;

  return (
    <Suspense fallback={null}>
      <CommandPalette startOpen={startOpen} />
      <Toaster
        position="bottom-right"
        theme="light"
        richColors
        closeButton
        toastOptions={{
          style: {
            background: '#ffffff',
            border: '1px solid #e5e5e5',
            color: '#0a0a0a',
            boxShadow: '0 12px 24px -6px rgb(0 0 0 / 0.10), 0 6px 12px -6px rgb(0 0 0 / 0.06)',
          },
        }}
      />
    </Suspense>
  );
}

// Minimal loading fallback
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// Fires a GA4 page_view on every client-side navigation.
// index.html already fires one on initial load, so we skip the first render.
function RouteChangeTracker() {
  const location = useLocation();
  const isFirst = useRef(true);

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    if (window.gtag) {
      window.gtag('config', 'G-1KWMEM41YG', {
        page_path: location.pathname + location.search,
      });
    }
  }, [location]);

  return null;
}

// AuthPanel host — rendered at App level so it's a sibling of <main> and NOT
// inside Header (which has backdrop-blur that would create a containing block
// for the panel's position:fixed h-full and collapse it to 64px tall).
function AuthPanelHost() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [returnTo, setReturnTo] = useState(null);
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    const handler = (e) => {
      setMessage(e.detail?.message || '');
      setReturnTo(e.detail?.returnTo || null);
      setOpen(true);
    };
    window.addEventListener('openAuthPanel', handler);
    return () => window.removeEventListener('openAuthPanel', handler);
  }, []);

  // Redirect to returnTo after successful sign-in
  useEffect(() => {
    if (isAuthenticated && returnTo) {
      navigate(returnTo);
      setReturnTo(null);
    }
  }, [isAuthenticated, returnTo, navigate]);

  return (
    <AuthPanel
      isOpen={open}
      onClose={() => { setOpen(false); setMessage(''); }}
      message={message}
    />
  );
}

// Extracted so we can call useLocation() to suppress chrome on share pages
function LayoutWrapper() {
  const location = useLocation();
  const isShareRoute = location.pathname.startsWith('/s/');

  return (
    <div className="min-h-screen bg-[#fafafa] text-neutral-900 flex flex-col">
      <RouteChangeTracker />
      <ScrollToTop />
      <BackToTop />
      {!isShareRoute && <Header />}
      <main className="flex-1">
        <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/rankings" element={<Rankings />} />
          <Route path="/rankings/:platform" element={<Rankings />} />
          <Route path="/best" element={<HubIndex />} />
          <Route path="/best/:slug" element={<HubPage />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/youtube/money-calculator" element={<Calculator />} />
          <Route path="/trending" element={<Trending />} />
          <Route path="/milestones" element={<Milestones />} />
          <Route path="/live/:platform/:username" element={<LiveCount />} />
          <Route path="/s/:platform/:username" element={<ShareProfile />} />
          <Route path="/:platform/:username" element={<CreatorProfile />} />
          <Route path="/auth/sign-in" element={<AuthPage initialMode="signin" />} />
          <Route path="/auth/sign-up" element={<AuthPage initialMode="signup" />} />
          <Route path="/auth/reset" element={<ResetPassword />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/account" element={<Account />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/support" element={<Support />} />
          <Route path="/promote" element={<Promote />} />
          <Route path="/refunds" element={<Refunds />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/newsletter/unsubscribe" element={<NewsletterUnsubscribe />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/blog/admin" element={<Navigate to="/admin" replace />} />
          <Route path="/faq" element={<FAQ />} />
          <Route path="/methodology" element={<Methodology />} />
          <Route path="/blog/:slug" element={<BlogPost />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
        </ErrorBoundary>
      </main>
      {!isShareRoute && <Footer />}
    </div>
  );
}

function App() {
  return (
    // reducedMotion="user" disables framer-motion transform/layout animations
    // for users with prefers-reduced-motion set (opacity still animates)
    <MotionConfig reducedMotion="user">
    <AuthProvider>
      <LayoutWrapper />
      <AuthPanelHost />
      <DeferredOverlays />
    </AuthProvider>
    </MotionConfig>
  );
}

export default App;
