import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchUsers, type ManagedUser } from '../features/users/api/users.api';
import { useAuth } from '../hooks/useAuth';
import {
  createUser,
  fetchAssignments,
  setUserStatus,
  updateUser,
  assignExecutor,
  unassignExecutor,
  resetUserPassword,
  deleteUser,
  type AssignmentRow,
} from '../features/users/api/users.api';
import { Modal } from '../components/ui/Modal';
import { Skeleton } from '../components/ui/Skeleton';
import { TrashIcon } from '../components/ui/icons';

const PAGE_SIZE = 15;

export function UsersPage() {
  const { user: currentUser } = useAuth();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'' | 'ADMIN' | 'EXECUTOR'>('');
  const [statusFilter, setStatusFilter] = useState<'' | 'true' | 'false'>('');
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [total, setTotal] = useState(0);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [deactivating, setDeactivating] = useState<ManagedUser | null>(null);
  const [assigning, setAssigning] = useState<ManagedUser | null>(null);
  const [deleting, setDeleting] = useState<ManagedUser | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const filters = useMemo(
    () => ({ search: search.trim() || undefined, role: roleFilter || undefined, isActive: statusFilter || undefined, page, pageSize: PAGE_SIZE }),
    [search, roleFilter, statusFilter, page],
  );

  const loadUsers = () => {
    fetchUsers(filters)
      .then((r) => { setUsers(r.users); setTotal(r.total); })
      .catch(() => setError('Unable to load users.'))
      .finally(() => setIsLoading(false));
  };

  const loadAssignments = () => {
    fetchAssignments({ activeOnly: true, page: 1, pageSize: 100 })
      .then((page) => setAssignments(page.assignments))
      .catch(() => setAssignments([]));
  };

  useEffect(() => {
    setIsLoading(true);
    loadUsers();
    loadAssignments();
  }, [filters]);

  useEffect(() => { setPage(1); }, [search, roleFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const assignmentByExecutor = useMemo(() => new Map(assignments.map((a) => [a.executor.id, a])), [assignments]);

  const toggleStatus = async (user: ManagedUser) => {
    if (!user.isActive) {
      try {
        await setUserStatus(user.id, 'ACTIVE');
        setNotice(`“${user.firstName} ${user.lastName}” reactivated.`);
        loadUsers();
      } catch (err) {
        const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
        setError(msg ?? 'Could not reactivate user.');
      }
      return;
    }
    setDeactivating(user);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-primary">Users</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Users</h1>
          <p className="mt-1 text-sm text-secondary">Manage Admins and Executors, assignments and access.</p>
        </div>
        <button type="button" onClick={() => setShowCreate(true)} className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-lift transition hover:bg-primary-dark">+ Create User</button>
      </div>

      {notice && <div role="status" className="rounded-xl border border-[#1e7a3c]/25 bg-[#e9f7ee] px-4 py-3 text-sm font-medium text-[#145c2c]">{notice}</div>}
      {error && <div role="alert" className="flex items-center justify-between gap-4 rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger"><span>{error}</span><button type="button" onClick={() => setError(null)} className="font-semibold underline">Dismiss</button></div>}

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-card p-4 md:grid-cols-4">
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or email…" aria-label="Search users" className="rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary md:col-span-2" />
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as '' | 'ADMIN' | 'EXECUTOR')} aria-label="Filter by role" className="rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary">
          <option value="">All roles</option>
          <option value="ADMIN">ADMIN</option>
          <option value="EXECUTOR">EXECUTOR</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as '' | 'true' | 'false')} aria-label="Filter by status" className="rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary">
          <option value="">All statuses</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-2xl" />)}</div>
      ) : users.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-strong/70 bg-card p-12 text-center">
          <p className="text-base font-bold text-ink">No users found</p>
          <p className="mt-1 text-sm text-secondary">Adjust the filters or create a new account.</p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background text-left text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Assignment</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const assignment = assignmentByExecutor.get(user.id);
                  return (
                    <tr key={user.id} className="border-b border-border/60 transition last:border-0 hover:bg-background/60">
                      <td className="px-4 py-3 font-semibold text-ink"><Link to={`/users/${user.id}`} className="underline-offset-2 hover:text-primary hover:underline">{user.firstName} {user.lastName}</Link></td>
                      <td className="px-4 py-3 text-secondary">{user.email}</td>
                      <td className="px-4 py-3"><span className="rounded-full bg-primary-soft/50 px-2.5 py-1 text-[10px] font-bold tracking-wider text-primary-deep">{user.role}</span></td>
                      <td className="px-4 py-3 text-xs text-secondary">
                        {user.role === 'EXECUTOR' ? (assignment ? `→ ${assignment.admin.firstName} ${assignment.admin.lastName}` : 'Unassigned') : '—'}
                      </td>
                      <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${user.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-100 text-slate-600'}`}>{user.isActive ? 'Active' : 'Inactive'}</span></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <button type="button" onClick={() => setEditing(user)} className="rounded-lg border border-border-strong/60 px-3 py-1.5 text-xs font-semibold text-ink hover:border-primary hover:text-primary">Edit</button>
                          {user.role === 'EXECUTOR' && (
                            <button type="button" onClick={() => setAssigning(user)} className="rounded-lg border border-border-strong/60 px-3 py-1.5 text-xs font-semibold text-ink hover:border-primary hover:text-primary">Assign</button>
                          )}
                          <button type="button" onClick={() => void toggleStatus(user)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${user.isActive ? 'border-danger/40 text-danger hover:bg-danger-soft' : 'border-emerald-300 text-emerald-800 hover:bg-emerald-50'}`}>{user.isActive ? 'Deactivate' : 'Reactivate'}</button>
                          {currentUser?.id !== user.id && (
                            <button type="button" onClick={() => setDeleting(user)} aria-label={`Delete ${user.firstName} ${user.lastName}`} title="Delete user" className="rounded-lg border border-danger/40 p-1.5 text-danger transition hover:bg-danger-soft">
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-secondary">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total} users</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="rounded-xl border border-border-strong/60 px-3 py-1.5 text-sm font-medium disabled:opacity-40">← Prev</button>
              <span className="px-2 text-xs font-semibold tabular-nums text-secondary">Page {page} of {totalPages}</span>
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="rounded-xl border border-border-strong/60 px-3 py-1.5 text-sm font-medium disabled:opacity-40">Next →</button>
            </div>
          </div>
        </>
      )}

      {showCreate && <UserFormModal mode="create" onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); loadUsers(); }} />}
      {editing && <UserFormModal mode="edit" user={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); loadUsers(); }} />}
      {deactivating && (
        <DeactivateDialog
          user={deactivating}
          onClose={() => setDeactivating(null)}
          onConfirm={async () => {
            try {
              await setUserStatus(deactivating.id, 'INACTIVE');
              setNotice(`“${deactivating.firstName} ${deactivating.lastName}” deactivated.`);
              setDeactivating(null);
              loadUsers();
            } catch (err) {
              const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
              setError(msg ?? 'Could not deactivate user.');
              setDeactivating(null);
            }
          }}
        />
      )}

      {deleting && (
        <DeleteDialog
          user={deleting}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            setIsDeleting(true);
            try {
              await deleteUser(deleting.id);
              setNotice(`“${deleting.firstName} ${deleting.lastName}” deleted.`);
              setDeleting(null);
              setIsDeleting(false);
              loadUsers();
            } catch (err) {
              const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
              setError(msg ?? 'Could not delete user.');
              setDeleting(null);
              setIsDeleting(false);
            }
          }}
          isBusy={isDeleting}
        />
      )}
      {assigning && <AssignDialog executor={assigning} assignments={assignments} onClose={() => setAssigning(null)} onDone={() => { setAssigning(null); loadAssignments(); }} />}
    </div>
  );
}

function UserFormModal({ mode, user, onClose, onSaved }: { mode: 'create' | 'edit'; user?: ManagedUser; onClose: () => void; onSaved: () => void }) {
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'EXECUTOR'>(user?.role ?? 'EXECUTOR');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [resetNotice, setResetNotice] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  const handleResetPassword = async () => {
    if (!user || resetPassword.length < 8) return;
    setIsResetting(true);
    setResetError(null);
    setResetNotice(null);
    try {
      await resetUserPassword(user.id, resetPassword);
      setResetPassword('');
      setResetNotice('Password reset. The user has been signed out of all sessions.');
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setResetError(msg ?? 'Could not reset the password.');
    } finally {
      setIsResetting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (!firstName.trim() || !lastName.trim() || !email.trim()) { setError('Name and email are required.'); return; }
    if (mode === 'create' && password.length < 8) { setError('Password must be at least 8 characters with a letter and a number/capital.'); return; }
    setIsSaving(true);
    try {
      if (mode === 'create') {
        await createUser({ firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim().toLowerCase(), password, role });
      } else {
        await updateUser(user!.id, { firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim().toLowerCase(), role });
      }
      onSaved();
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg ?? 'Could not save the user.');
    } finally { setIsSaving(false); }
  };

  return (
    <Modal title={mode === 'create' ? 'Create User' : 'Edit User'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div role="alert" className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-2.5 text-sm text-danger">{error}</div>}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="u-first" className="mb-1.5 block text-xs font-semibold text-ink">First name *</label>
            <input id="u-first" type="text" required autoFocus value={firstName} onChange={(e) => setFirstName(e.target.value)} className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary" />
          </div>
          <div>
            <label htmlFor="u-last" className="mb-1.5 block text-xs font-semibold text-ink">Last name *</label>
            <input id="u-last" type="text" required value={lastName} onChange={(e) => setLastName(e.target.value)} className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary" />
          </div>
        </div>
        <div>
          <label htmlFor="u-email" className="mb-1.5 block text-xs font-semibold text-ink">Email *</label>
          <input id="u-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary" />
        </div>
        {mode === 'create' && (
          <div>
            <label htmlFor="u-password" className="mb-1.5 block text-xs font-semibold text-ink">Password *</label>
            <input id="u-password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="Min 8 chars · letter + digit or capital" className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary" />
          </div>
        )}
        <div>
          <label htmlFor="u-role" className="mb-1.5 block text-xs font-semibold text-ink">Role</label>
          <select id="u-role" value={role} onChange={(e) => setRole(e.target.value as 'ADMIN' | 'EXECUTOR')} className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary">
            <option value="EXECUTOR">EXECUTOR</option>
            <option value="ADMIN">ADMIN</option>
          </select>
        </div>
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-border-strong/60 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-background">Cancel</button>
          <button type="submit" disabled={isSaving} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-dark disabled:opacity-70">{isSaving ? 'Saving…' : 'Save User'}</button>
        </div>
      </form>

      {mode === 'edit' && (
        <div className="mt-5 border-t border-border pt-4">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-secondary">Reset Password (Admin Override)</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            No old password required. The user's current sessions will be signed out immediately.
          </p>
          {resetNotice && (
            <p role="status" className="mt-2 rounded-xl border border-[#1e7a3c]/25 bg-[#e9f7ee] px-3 py-2 text-[11px] font-semibold text-[#145c2c]">{resetNotice}</p>
          )}
          {resetError && (
            <p role="alert" className="mt-2 rounded-xl border border-danger/25 bg-danger-soft px-3 py-2 text-[11px] font-semibold text-danger">{resetError}</p>
          )}
          <div className="mt-2 flex items-center gap-2">
            <input
              type="password"
              aria-label="New password"
              placeholder="New password (min 8 chars)"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary"
            />
            <button
              type="button"
              disabled={isResetting || resetPassword.length < 8}
              onClick={() => void handleResetPassword()}
              className="flex-none rounded-xl border border-danger/40 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-danger transition hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isResetting ? 'Resetting…' : 'Reset'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function DeleteDialog({ user, onClose, onConfirm, isBusy }: { user: ManagedUser; onClose: () => void; onConfirm: () => void; isBusy: boolean }) {
  return (
    <Modal title="Delete User Permanently" onClose={onClose} maxWidthClass="max-w-md">
      <p className="text-sm leading-relaxed text-secondary">
        <strong className="text-ink">{user.firstName} {user.lastName}</strong> ({user.email}) will be{' '}
        <strong className="text-danger">permanently deleted</strong>. Their sessions, assignments and audit identity are
        removed/anonymized. Events they created are not deleted — deleting is refused in that case.
      </p>
      <p className="mt-2 text-[11px] leading-relaxed text-muted">This cannot be undone.</p>
      <div className="mt-5 flex items-center justify-end gap-3">
        <button type="button" onClick={onClose} className="rounded-xl border border-border-strong/60 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-background">Cancel</button>
        <button type="button" disabled={isBusy} onClick={onConfirm} className="inline-flex items-center gap-2 rounded-xl bg-danger px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"><TrashIcon className="h-4 w-4" />{isBusy ? 'Deleting…' : 'Delete'}</button>
      </div>
    </Modal>
  );
}

function DeactivateDialog({ user, onClose, onConfirm }: { user: ManagedUser; onClose: () => void; onConfirm: () => void }) {
  const [isBusy, setIsBusy] = useState(false);
  return (
    <Modal title="Deactivate User?" onClose={onClose} maxWidthClass="max-w-md">
      <p className="text-sm leading-relaxed text-secondary">
        <strong className="text-ink">{user.firstName} {user.lastName}</strong> will no longer be able to sign in or access the application. Their records and history remain intact.
      </p>
      <div className="mt-5 flex items-center justify-end gap-3">
        <button type="button" onClick={onClose} className="rounded-xl border border-border-strong/60 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-background">Cancel</button>
        <button type="button" disabled={isBusy} onClick={() => { setIsBusy(true); onConfirm(); }} className="rounded-xl bg-danger px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60">{isBusy ? 'Deactivating…' : 'Deactivate'}</button>
      </div>
    </Modal>
  );
}

function AssignDialog({ executor, assignments, onClose, onDone }: { executor: ManagedUser; assignments: AssignmentRow[]; onClose: () => void; onDone: () => void }) {
  const { user: currentUser } = useAuth();
  const [admins, setAdmins] = useState<ManagedUser[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(true);
  const [selectedAdminId, setSelectedAdminId] = useState<string>(currentUser?.id ?? '');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAdminsLoading(true);
    fetchUsers({ role: 'ADMIN', isActive: 'true', pageSize: 100 })
      .then((result) => setAdmins(result.users))
      .catch(() => setAdmins([]))
      .finally(() => setAdminsLoading(false));
  }, []);

  const existing = assignments.find((a) => a.executor.id === executor.id);
  const sameAdmin = existing?.admin.id === selectedAdminId;
  const isReassignment = Boolean(existing) && !sameAdmin;

  const handleAssign = async () => {
    setIsBusy(true);
    setError(null);
    try {
      await assignExecutor(executor.id, selectedAdminId);
      onDone();
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg ?? 'Could not assign executor.');
      setIsBusy(false);
    }
  };

  const handleUnassign = async () => {
    if (!existing) return;
    setIsBusy(true);
    setError(null);
    try {
      await unassignExecutor(existing.id);
      onDone();
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg ?? 'Could not unassign executor.');
      setIsBusy(false);
    }
  };

  return (
    <Modal title={existing ? 'Reassign Executor' : 'Assign Executor to Admin'} onClose={onClose} maxWidthClass="max-w-md">
      <div className="space-y-4">
        {existing ? (
          <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs leading-relaxed text-sky-900">
            <strong>Currently assigned to {existing.admin.firstName} {existing.admin.lastName}.</strong>{' '}
            Reassigning creates a new assignment and preserves full history — previous events and requests
            remain associated with their original admin.
          </p>
        ) : (
          <p className="text-sm leading-relaxed text-secondary">
            Assign <strong className="text-ink">{executor.firstName} {executor.lastName}</strong> to an admin.
            They will be able to manage events within the selected admin's scope.
          </p>
        )}

        <div>
          <label htmlFor="assign-admin" className="mb-1.5 block text-xs font-semibold text-ink">Assign to Admin</label>
          <select
            id="assign-admin"
            value={selectedAdminId}
            onChange={(e) => setSelectedAdminId(e.target.value)}
            disabled={adminsLoading}
            className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:opacity-60"
          >
            {admins.map((admin) => (
              <option key={admin.id} value={admin.id}>
                {admin.firstName} {admin.lastName} — {admin.email}{admin.id === currentUser?.id ? ' (you)' : ''}
              </option>
            ))}
          </select>
        </div>

        {error && <p role="alert" className="text-xs font-semibold text-danger">{error}</p>}

        <div className="flex flex-wrap items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-border-strong/60 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-background">Cancel</button>
          {existing && (
            <button type="button" disabled={isBusy} onClick={() => void handleUnassign()} className="rounded-xl border border-danger/40 px-4 py-2.5 text-sm font-semibold text-danger transition hover:bg-danger-soft disabled:opacity-60">
              {isBusy ? 'Ending…' : 'End Assignment'}
            </button>
          )}
          <button type="button" disabled={isBusy || !selectedAdminId || sameAdmin || adminsLoading} onClick={() => void handleAssign()} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-dark disabled:opacity-60">
            {isBusy ? 'Working…' : sameAdmin ? 'Already Assigned' : isReassignment ? 'Reassign' : 'Assign'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
