import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

/**
 * Shared admin-gate check for /admin and its panels. Extracted from the
 * original BlogAdmin.jsx so both the Blog and Subscribers tabs (and any
 * future admin tab) run the same check exactly once per page load.
 */
export function useAdminAuth() {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      window.dispatchEvent(new CustomEvent('openAuthPanel', {
        detail: { message: 'Sign in to access the admin dashboard' }
      }));
      return;
    }

    async function checkAdmin() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          setIsAdmin(false);
          setAdminChecked(true);
          return;
        }

        const res = await fetch('/api/blog-admin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ action: 'check' }),
        });

        if (res.status === 401) {
          await supabase.auth.signOut();
          setIsAdmin(false);
        } else {
          const data = await res.json();
          setIsAdmin(data.isAdmin);
        }
      } catch {
        setIsAdmin(false);
      } finally {
        setAdminChecked(true);
      }
    }
    checkAdmin();
  }, [user, authLoading]);

  return { user, authLoading, isAdmin, adminChecked };
}
