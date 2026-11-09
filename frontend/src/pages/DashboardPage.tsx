import { useAuth } from '../hooks/useAuth';
/**
 * Minimal dashboard placeholder (Phase 2).
 * Confirms the authenticated session, role, and navigation shell work.
 * The real dashboard arrives with business modules in later phases.
 */
export function DashboardPage() {
  const { user } = useAuth();

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-semibold text-slate-900">
        Welcome, {user?.firstName} {user?.lastName}
      </h1>
      <p className="mt-2 text-slate-600">
        You are signed in as <strong>{user?.role}</strong>. Authentication is secured server-side
        via an HTTP-only session cookie.
      </p>
      <dl className="mt-6 grid max-w-lg grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <dt className="text-slate-500">Name</dt>
        <dd className="text-slate-800">
          {user?.firstName} {user?.lastName}
        </dd>
        <dt className="text-slate-500">Email</dt>
        <dd className="text-slate-800">{user?.email}</dd>
        <dt className="text-slate-500">Role</dt>
        <dd className="text-slate-800">{user?.role}</dd>
        <dt className="text-slate-500">Account</dt>
        <dd className="text-slate-800">{user?.isActive ? 'Active' : 'Inactive'}</dd>
      </dl>
      <p className="mt-6 rounded-md bg-slate-50 p-4 text-sm text-slate-500">
        Next up in later phases: events &amp; calendar, inventory, requests, approvals, and
        notifications. Navigation is already role-aware and ready for them.
      </p>
    </section>
  );
}
