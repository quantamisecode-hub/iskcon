import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';
import { useRedirectIfAuthenticated } from '../hooks/useRedirectIfAuthenticated';
import { useLoginSubmit } from '../hooks/useLoginSubmit';
import { PasswordInput } from '../components/PasswordInput';

/**
 * Professional login screen: email, password, show/hide, validation,
 * loading state, and API/network error handling. No social logins by design.
 * Only the BACKEND decides credential validity — the UI checks are UX only.
 */
export function LoginPage() {
  const { login } = useAuth();
  const { submitting, error, run } = useLoginSubmit();
  useRedirectIfAuthenticated();

  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  function validate(): boolean {
    const errors: typeof fieldErrors = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = 'Enter a valid email address.';
    }
    if (password.length === 0) {
      errors.password = 'Enter your password.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!validate()) return;

    const target = (location.state as { from?: string } | null)?.from ?? '/dashboard';
    const ok = await run(login, email.trim(), password);
    if (ok) navigate(target, { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-8">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Food Inventory System</h1>
        <p className="mt-1 text-sm text-slate-500">Sign in to your account</p>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className="w-full rounded-md border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {fieldErrors.email ? <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p> : null}
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              Password
            </label>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {fieldErrors.password ? (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.password}</p>
            ) : null}
          </div>

          {error ? (
            <div
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {error.message}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
