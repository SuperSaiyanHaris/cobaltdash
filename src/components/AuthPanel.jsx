import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { X } from 'lucide-react';
import AuthForm from './AuthForm';

/**
 * Slide-out auth panel for CONTEXTUAL prompts ("Sign in to follow creators").
 * The dedicated /auth/sign-in page is the primary destination; this modal keeps
 * users in place when they hit an auth wall mid-browse. Both share <AuthForm>.
 */
export default function AuthPanel({ isOpen, onClose, message: contextMessage }) {
  const { isAuthenticated } = useAuth();
  const [mode, setMode] = useState('signin'); // signin | signup | reset
  const [isAnimating, setIsAnimating] = useState(false);

  // Trigger slide-in animation when opening
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => setIsAnimating(true), 10);
    } else {
      setIsAnimating(false);
    }
  }, [isOpen]);

  // Auto-close panel when user logs in
  useEffect(() => {
    if (isAuthenticated && isOpen) onClose();
  }, [isAuthenticated, isOpen, onClose]);

  // Close on escape + lock body scroll
  useEffect(() => {
    const handleEscape = (e) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-neutral-900/50 z-50 transition-opacity duration-300 ${
          isAnimating ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />

      {/* Slide-out Panel */}
      <div
        className={`fixed right-0 top-0 h-full w-full sm:w-[460px] bg-white z-50 shadow-2xl overflow-y-auto transform transition-all duration-300 ease-out ${
          isAnimating ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white/95 backdrop-blur-md border-b border-neutral-200 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold text-neutral-900 tracking-tight">
            {mode === 'signup' ? 'Create an account' : mode === 'reset' ? 'Reset password' : 'Welcome back'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-7">
          <AuthForm
            mode={mode}
            setMode={setMode}
            onSuccess={onClose}
            contextMessage={contextMessage}
          />
        </div>
      </div>
    </>
  );
}
