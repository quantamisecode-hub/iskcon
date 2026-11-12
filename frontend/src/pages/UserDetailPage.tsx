import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchAssignments, fetchUser, type AssignmentRow, type ManagedUser } from '../features/users/api/users.api';
import { Skeleton } from '../components/ui/Skeleton';

export function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [user, setUser] = useState<ManagedUser | null>(null);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetchUser(id)
      .then(setUser)
      .catch(() => setNotFound(true))
      .finally(() => setIsLoading(false));
    fetchAssignments({ activeOnly: false, page: 1, pageSize: 100 })
      .then((page) => setAssignments(page.assignments))
      .catch(() => setAssignments([]));
  }, [id]);

  if (isLoading) {
    return (
      <div className="space-y-4" role="status" aria-label="Loading user">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    );
  }

  if (notFound || !user) {
    return (
      <div className="rounded-2xl border border-border bg-card p-12 text-center">
        <h1 className="text-2xl font-bold text-ink">User not found</h1>
        <Link to="/users" className="mt-6 inline-block rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-dark">Back to Users</Link>
      </div>
    );
  }

  const activeAssignment = assignments.find((a) => a.executor.id === user.id && a.isActive);
  const history = assignments.filter((a) => a.executor.id === user.id && !a.isActive);

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-xs font-medium text-secondary">
        <Link to="/users" className="hover:text-primary">Users</Link>
        <span aria-hidden="true" className="mx-2 text-muted">/</span>
        <span className="text-ink">{user.firstName} {user.lastName}</span>
      </nav>

      <h1 className="text-2xl font-bold tracking-tight text-ink">{user.firstName} {user.lastName}</h1>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-secondary">Account</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <Row label="Email" value={user.email} />
            <Row label="Role" value={user.role} />
            <Row label="Status" value={user.isActive ? 'Active' : 'Inactive'} />
            <Row label="Created" value={new Date(user.createdAt).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} />
            <Row label="Last Login" value={user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : 'Never'} />
          </dl>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm xl:col-span-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-secondary">Assignment History</h2>
          {user.role !== 'EXECUTOR' ? (
            <p className="mt-4 text-sm text-secondary">Assignments apply to Executors only.</p>
          ) : activeAssignment ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">Currently Assigned</p>
              <p className="mt-1.5 text-sm font-semibold text-ink">
                Assigned to {activeAssignment.admin.firstName} {activeAssignment.admin.lastName} since{' '}
                {new Date(activeAssignment.assignedAt).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-secondary">This executor is not currently assigned to any admin.</p>
          )}

          <h3 className="mt-6 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Previous Assignments</h3>
          {history.length === 0 ? (
            <p className="mt-2 text-xs text-secondary">No assignment history yet.</p>
          ) : (
            <ol className="mt-3 space-y-2">
              {history.map((assignment) => (
                <li key={assignment.id} className="rounded-xl border border-border bg-background px-4 py-3">
                  <p className="text-xs font-semibold text-ink">
                    {assignment.admin.firstName} {assignment.admin.lastName} · assigned{' '}
                    {new Date(assignment.assignedAt).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' })}
                  </p>
                  <p className="mt-0.5 text-[11px] text-secondary">
                    Ended {assignment.unassignedAt ? new Date(assignment.unassignedAt).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' }) : '—'} · History preserved
                  </p>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-4 text-[11px] text-muted">Historical ownership is never rewritten — past events and requests remain attached to their original admin.</p>
        </section>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 pb-2.5 last:border-0 last:pb-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-right text-sm font-medium text-ink">{value}</dd>
    </div>
  );
}
