import { useEffect, useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import {
  PERMISSION_MODULES,
  DEFAULT_ROLE_PERMISSIONS,
  ALL_PERMISSION_IDS,
} from '../../../constants/permissions';
import {
  fetchUserPermissions,
  updateUserPermissions,
  type ManagedUser,
} from '../api/users.api';
import { displayRole } from '../../auth/utils/roleLabel';

interface UserPermissionsModalProps {
  user: ManagedUser;
  onClose: () => void;
  onSaved: () => void;
}

export function UserPermissionsModal({ user, onClose, onSaved }: UserPermissionsModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    fetchUserPermissions(user.id)
      .then((perms) => {
        setSelected(new Set(perms));
      })
      .catch(() => {
        // Fallback to role defaults if fetch fails
        setSelected(new Set(DEFAULT_ROLE_PERMISSIONS[user.role] ?? []));
      })
      .finally(() => setIsLoading(false));
  }, [user.id, user.role]);

  const togglePermission = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleModule = (moduleId: string) => {
    const mod = PERMISSION_MODULES.find((m) => m.id === moduleId);
    if (!mod) return;
    const allModIds = mod.permissions.map((p) => p.id);
    const hasAll = allModIds.every((id) => selected.has(id));

    setSelected((prev) => {
      const next = new Set(prev);
      if (hasAll) {
        for (const id of allModIds) next.delete(id);
      } else {
        for (const id of allModIds) next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelected(new Set(ALL_PERMISSION_IDS));
  };

  const handleClearAll = () => {
    setSelected(new Set());
  };

  const handleResetToDefaults = () => {
    setSelected(new Set(DEFAULT_ROLE_PERMISSIONS[user.role] ?? []));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await updateUserPermissions(user.id, Array.from(selected));
      setNotice('Permissions updated successfully.');
      setTimeout(() => {
        onSaved();
      }, 700);
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg ?? 'Failed to update permissions.');
      setIsSaving(false);
    }
  };

  return (
    <Modal title="Manage User Permissions" onClose={onClose} maxWidthClass="max-w-2xl">
      <div className="space-y-4">
        {/* User Info Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-3.5">
          <div>
            <p className="text-sm font-bold text-ink">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-xs text-secondary">{user.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-primary-soft/50 px-2.5 py-1 text-[10px] font-bold tracking-wider text-primary-deep">
              {displayRole(user.role)}
            </span>
            <span className="text-xs font-semibold tabular-nums text-secondary">
              {selected.size} / {ALL_PERMISSION_IDS.length} active
            </span>
          </div>
        </div>

        {notice && (
          <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800">
            {notice}
          </div>
        )}
        {error && (
          <div role="alert" className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-2.5 text-xs font-semibold text-danger">
            {error}
          </div>
        )}

        {/* Quick Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-3">
          <p className="text-[11px] font-semibold text-muted">Module Permissions & CRUD Capabilities</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSelectAll}
              className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold text-ink hover:bg-background"
            >
              Select All
            </button>
            <button
              type="button"
              onClick={handleClearAll}
              className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold text-ink hover:bg-background"
            >
              Clear All
            </button>
            <button
              type="button"
              onClick={handleResetToDefaults}
              className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary-soft/40"
            >
              Reset to Defaults
            </button>
          </div>
        </div>

        {/* Module Checklist */}
        {isLoading ? (
          <div className="py-12 text-center text-sm text-secondary">Loading permissions…</div>
        ) : (
          <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
            {PERMISSION_MODULES.map((module) => {
              const allModIds = module.permissions.map((p) => p.id);
              const checkedCount = allModIds.filter((id) => selected.has(id)).length;
              const allChecked = checkedCount === allModIds.length;
              const someChecked = checkedCount > 0 && !allChecked;

              return (
                <div key={module.id} className="rounded-xl border border-border/80 bg-card p-3 shadow-xs">
                  <div className="flex items-center justify-between border-b border-border/50 pb-2">
                    <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-ink">
                      <input
                        type="checkbox"
                        checked={allChecked}
                        ref={(el) => {
                          if (el) el.indeterminate = someChecked;
                        }}
                        onChange={() => toggleModule(module.id)}
                        className="h-4 w-4 rounded border-border-strong/80 text-primary focus:ring-primary"
                      />
                      <span>{module.name}</span>
                    </label>
                    <span className="text-[10px] font-semibold text-secondary">
                      {checkedCount} / {allModIds.length}
                    </span>
                  </div>

                  <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {module.permissions.map((perm) => {
                      const isChecked = selected.has(perm.id);
                      return (
                        <label
                          key={perm.id}
                          className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2 text-xs transition ${
                            isChecked
                              ? 'border-primary/30 bg-primary-soft/20 text-ink'
                              : 'border-border/60 bg-white/70 text-secondary hover:border-border-strong/60'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => togglePermission(perm.id)}
                            className="mt-0.5 h-3.5 w-3.5 rounded border-border-strong text-primary focus:ring-primary"
                          />
                          <div className="min-w-0">
                            <span className="font-semibold">{perm.label}</span>
                            <span className="block text-[10px] uppercase tracking-wider text-muted">{perm.action}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border-strong/60 px-4 py-2 text-sm font-semibold text-ink hover:bg-background"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving || isLoading}
            className="rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary-dark disabled:opacity-60"
          >
            {isSaving ? 'Saving…' : 'Save Permissions'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
