/**
 * Login Page — ISKCON Premium Theme
 * Split-screen: terracotta brand panel + warm cream sign-in form.
 * Auth flow: existing auth API (HTTP-only session cookie).
 */

import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

/** Only same-app paths (never `//host` or absolute URLs) may be a post-login target. */
function safeRedirectTarget(from: unknown): string {
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//') || from === '/login') {
    return '/dashboard';
  }
  return from;
}

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, status, login } = useAuth();
  // Set by ProtectedRoute so the user lands back on the page they asked for.
  const redirectTo = safeRedirectTarget((location.state as { from?: unknown } | null)?.from);

  // Already signed in? Skip the form.
  useEffect(() => {
    if (status === 'ready' && isAuthenticated) {
      navigate(redirectTo, { replace: true });
    }
  }, [status, isAuthenticated, navigate, redirectTo]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await login(email.trim().toLowerCase(), password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      const apiMessage = (err as {
        response?: { data?: { error?: { message?: string } } };
        message?: string;
      })?.response?.data?.error?.message;
      setError(apiMessage ?? 'Invalid email or password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* ================= Brand Panel (desktop) ================= */}
      <aside
        aria-hidden="true"
        className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-gradient-to-br from-primary-deep via-primary-dark to-primary p-10 text-[#fbf6ef] lg:flex xl:w-1/2 xl:p-14"
      >
        {/* decorative mandala rings */}
        <div className="pointer-events-none absolute -right-28 top-1/2 h-[30rem] w-[30rem] -translate-y-1/2 rounded-full border border-white/15" />
        <div className="pointer-events-none absolute -right-10 top-1/2 h-[21rem] w-[21rem] -translate-y-1/2 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -right-44 -top-24 h-72 w-72 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -bottom-28 -left-16 h-80 w-80 rounded-full border border-white/10" />

        {/* brand row */}
        <div className="relative flex items-center gap-3">
          <span className="rounded-2xl bg-white p-1.5 shadow-md">
            <img src="/iskcon-logo.png" alt="" className="h-12 w-auto" />
          </span>
          <div className="leading-tight">
            <p className="text-[15px] font-bold tracking-[0.22em]">ISKCON</p>
            <p className="text-[11px] font-medium tracking-wide text-white/70">
              Food Inventory &amp; Material Management
            </p>
          </div>
        </div>

        {/* headline block */}
        <div className="relative max-w-md">
          <LotusMark className="mb-8 h-16 w-16 text-white/90" />
          <h2 className="text-4xl font-bold leading-[1.15] tracking-tight xl:text-5xl">
            Every grain,
            <br />
            accounted for.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-white/80">
            One secure home for prasādam food supplies, kitchen materials and
            inventory across the temple — from receipt to distribution.
          </p>
        </div>
      </aside>

      {/* ================= Sign-in Panel ================= */}
      <main className="flex flex-1 items-center justify-center px-5 py-10 sm:px-10">
        <div className="animate-login-card-in w-full max-w-md">
          {/* mobile brand row */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img src="/iskcon-logo.png" alt="" className="h-12 w-auto" />
            <div className="leading-tight">
              <p className="text-sm font-bold tracking-[0.22em] text-primary">
                ISKCON
              </p>
              <p className="text-[10px] font-medium text-secondary">
                Food Inventory &amp; Material Management
              </p>
            </div>
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-ink">
            Welcome back
          </h1>
          <p className="mt-1.5 text-sm text-secondary">
            Sign in with your staff credentials to continue.
          </p>

          {error && (
            <div
              role="alert"
              aria-live="polite"
              className="mt-6 flex items-start gap-3 rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger"
            >
              <AlertIcon className="mt-0.5 h-5 w-5 flex-none" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-7 space-y-5" noValidate={false}>
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-xs font-semibold tracking-wide text-ink"
              >
                Email address
              </label>
              <div className="relative">
                <MailIcon className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  placeholder="name@iskcon.org"
                  className="w-full rounded-xl border border-border-strong/70 bg-white py-3 pl-11 pr-4 text-sm text-ink placeholder:text-muted outline-none transition duration-200 focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:opacity-60"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-xs font-semibold tracking-wide text-ink"
              >
                Password
              </label>
              <div className="relative">
                <LockIcon className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-border-strong/70 bg-white py-3 pl-11 pr-12 text-sm text-ink placeholder:text-muted outline-none transition duration-200 focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  {showPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              aria-busy={isLoading}
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground shadow-lift transition duration-200 hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isLoading ? (
                <>
                  <SpinnerIcon className="h-5 w-5 animate-spin" />
                  Signing you in…
                </>
              ) : (
                <>
                  Sign In
                  <ArrowIcon className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </form>

          <div className="mt-7 border-t border-border pt-5 text-center text-xs text-secondary">
            Need an account?{' '}
            <a
              href="mailto:admin@dev.local"
              className="font-semibold text-primary underline-offset-2 transition hover:text-primary-dark hover:underline"
            >
              Contact the administrator
            </a>
            <p className="mt-4 text-[11px] leading-relaxed text-muted">
              Secured with HTTP-only session cookies.
              <br />
              Your password never touches browser storage.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ---------- Inline icons (stroke = currentColor) ---------- */

type IconProps = { className?: string };

function LotusMark({ className }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M32 12c3 6.5 3 12 0 17.5-3-5.5-3-11 0-17.5z" />
      <path d="M18 17.5c5.5 4.5 9 9.8 9.8 16-6-1.8-10.8-5.6-14.4-11.4" opacity="0.9" />
      <path d="M46 17.5c-5.5 4.5-9 9.8-9.8 16 6-1.8 10.8-5.6 14.4-11.4" opacity="0.9" />
      <path d="M10 36.5c7 2.8 13 2 17.5-3-1.5-6-7.5-10.5-14-12.5" opacity="0.8" />
      <path d="M54 36.5c-7 2.8-13 2-17.5-3 1.5-6 7.5-10.5 14-12.5" opacity="0.8" />
      <path d="M14 46.5c7 5.6 16.4 5.6 18 0 1.6 5.6 11 5.6 18 0" />
    </svg>
  );
}

function MailIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M4 7l8 6 8-6" />
    </svg>
  );
}

function LockIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="4.5" y="10" width="15" height="10" rx="2.5" />
      <path d="M8 10V7.8a4 4 0 0 1 8 0V10" />
    </svg>
  );
}

function EyeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  );
}

function EyeOffIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 4l16 16" />
      <path d="M10.6 6.1A9.6 9.6 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3.2 3.9M6.2 8.3A16 16 0 0 0 2.5 12S6 18 12 18a9 9 0 0 0 4-.9" />
      <path d="M9.9 9.9a3.2 3.2 0 0 0 4.5 4.5" />
    </svg>
  );
}

function AlertIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5" />
      <path d="M12 16h.01" />
    </svg>
  );
}

function SpinnerIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className={className} aria-hidden="true">
      <path d="M12 3a9 9 0 1 1-9 9" />
    </svg>
  );
}

function ArrowIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}
