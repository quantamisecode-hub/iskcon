import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  changePasswordRequest,
  updateAvatarRequest,
  updateProfileRequest,
} from '../features/auth/api/auth.api';
import {
  CameraIcon,
  LockIcon,
  MailIcon,
  PencilIcon,
  ShieldIcon,
  TrashIcon,
  UserIcon,
  VerifiedBadgeIcon,
} from '../components/ui/icons';

/**
 * Profile — account settings for the signed-in user.
 * Sections: photo, details (name/email), password.
 * Password change revokes OTHER sessions server-side (current stays valid).
 */
export function ProfilePage() {
  const { user, refreshUser } = useAuth();

  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [emailPassword, setEmailPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [detailsNotice, setDetailsNotice] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [isAvatarBusy, setIsAvatarBusy] = useState(false);
  const [avatarNotice, setAvatarNotice] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFirstName(user?.firstName ?? '');
    setLastName(user?.lastName ?? '');
    setEmail(user?.email ?? '');
  }, [user?.firstName, user?.lastName, user?.email]);

  const emailChanged = useMemo(
    () => email.trim().toLowerCase() !== (user?.email ?? '').toLowerCase(),
    [email, user?.email],
  );

  if (!user) return null;

  const flash = (setter: (v: string | null) => void, message: string) => {
    setter(message);
    window.setTimeout(() => setter(null), 4000);
  };

  const handleSaveDetails = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setDetailsError(null);
    setDetailsNotice(null);

    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedFirst || !trimmedLast || !trimmedEmail) {
      setDetailsError('First name, last name and email are all required.');
      return;
    }
    if (emailChanged && !emailPassword) {
      setDetailsError('Your current password is required to change the login email.');
      return;
    }

    setIsSaving(true);
    try {
      await updateProfileRequest({
        firstName: trimmedFirst,
        lastName: trimmedLast,
        email: trimmedEmail,
        ...(emailChanged ? { currentPassword: emailPassword } : {}),
      });
      await refreshUser();
      setEmailPassword('');
      flash(setDetailsNotice, 'Profile updated.');
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setDetailsError(msg ?? 'Could not update the profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordNotice(null);

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters long.');
      return;
    }
    const hasLetter = /[a-zA-Z]/.test(newPassword);
    const hasDigitOrCapital = /\d/.test(newPassword) || /[A-Z]/.test(newPassword);
    if (!hasLetter || !hasDigitOrCapital) {
      setPasswordError('New password must contain a letter and a number or a capital letter.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    setIsChangingPassword(true);
    try {
      await changePasswordRequest({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      flash(setPasswordNotice, 'Password changed. Your other sessions were signed out.');
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setPasswordError(msg ?? 'Could not change the password.');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const processAvatarFile = async (file: File): Promise<string> => {
    if (!file.type.startsWith('image/')) {
      throw new Error('Please choose an image file (PNG, JPEG or WebP).');
    }
    if (file.size > 4 * 1024 * 1024) {
      throw new Error('That image is larger than 4 MB. Please choose a smaller one.');
    }
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Could not read that image.'));
        image.src = objectUrl;
      });
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not process the image.');
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, 0, 0, 256, 256);
      return canvas.toDataURL('image/jpeg', 0.85);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const handleAvatarPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAvatarError(null);
    setAvatarNotice(null);
    setIsAvatarBusy(true);
    try {
      const dataUrl = await processAvatarFile(file);
      await updateAvatarRequest(dataUrl);
      await refreshUser();
      flash(setAvatarNotice, 'Photo updated.');
    } catch (err) {
      setAvatarError((err as Error).message ?? 'Could not update the photo.');
    } finally {
      setIsAvatarBusy(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setAvatarError(null);
    setAvatarNotice(null);
    setIsAvatarBusy(true);
    try {
      await updateAvatarRequest(null);
      await refreshUser();
      flash(setAvatarNotice, 'Photo removed.');
    } catch {
      setAvatarError('Could not remove the photo.');
    } finally {
      setIsAvatarBusy(false);
    }
  };

  const initials = `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-primary">Profile</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">My Profile</h1>
        <p className="mt-1 text-sm text-secondary">Manage your photo, details and password.</p>
      </div>

      {/* Photo + identity */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
          <div className="relative flex-none">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={`${user.firstName} ${user.lastName}`}
                className="h-28 w-28 rounded-full border-4 border-primary-soft object-cover"
              />
            ) : (
              <div className="flex h-28 w-28 items-center justify-center rounded-full border-4 border-primary-soft bg-primary text-3xl font-bold text-primary-foreground">
                {initials}
              </div>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isAvatarBusy}
              aria-label="Change profile photo"
              title="Change photo"
              className="absolute bottom-0 right-0 rounded-full border border-border bg-card p-2 text-ink shadow-md transition hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-60"
            >
              <CameraIcon className="h-4 w-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(e) => void handleAvatarPick(e)}
              aria-hidden="true"
              tabIndex={-1}
            />
          </div>

          <div className="min-w-0 text-center sm:text-left">
            <p className="flex flex-wrap items-center justify-center gap-2 text-xl font-bold tracking-tight text-ink sm:justify-start">
              {user.firstName} {user.lastName}
              {user.role === 'ADMIN' && (
                <VerifiedBadgeIcon
                  title="Verified account"
                  className="h-5 w-5 flex-none drop-shadow-sm"
                />
              )}
            </p>
            <p className="mt-0.5 text-sm text-secondary">{user.email}</p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft/60 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-deep">
                <ShieldIcon className="h-3 w-3" />
                {user.role}
              </span>
              <button
                type="button"
                onClick={handleRemoveAvatar}
                disabled={isAvatarBusy || !user.avatarUrl}
                className="inline-flex items-center gap-1.5 rounded-full border border-border-strong/60 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-secondary transition hover:border-danger hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
              >
                <TrashIcon className="h-3 w-3" />
                {isAvatarBusy ? 'Working…' : 'Remove photo'}
              </button>
            </div>
            {avatarNotice && <p role="status" className="mt-2 text-xs font-semibold text-emerald-700">{avatarNotice}</p>}
            {avatarError && <p role="alert" className="mt-2 text-xs font-semibold text-danger">{avatarError}</p>}
          </div>
        </div>
      </section>

      {/* Details */}
      <form onSubmit={handleSaveDetails} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-secondary">
            <UserIcon className="h-4 w-4 text-primary" />
            Account Details
          </h2>
        </div>
        {detailsNotice && <p role="status" className="mt-3 rounded-xl border border-[#1e7a3c]/25 bg-[#e9f7ee] px-4 py-2.5 text-xs font-semibold text-[#145c2c]">{detailsNotice}</p>}
        {detailsError && <p role="alert" className="mt-3 rounded-xl border border-danger/25 bg-danger-soft px-4 py-2.5 text-xs font-semibold text-danger">{detailsError}</p>}

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="p-first" className="mb-1.5 block text-xs font-semibold text-ink">First name</label>
            <input id="p-first" type="text" required value={firstName} onChange={(e) => setFirstName(e.target.value)} className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25" />
          </div>
          <div>
            <label htmlFor="p-last" className="mb-1.5 block text-xs font-semibold text-ink">Last name</label>
            <input id="p-last" type="text" required value={lastName} onChange={(e) => setLastName(e.target.value)} className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25" />
          </div>
        </div>
        <div className="mt-4">
          <label htmlFor="p-email" className="mb-1.5 block text-xs font-semibold text-ink">Email address</label>
          <div className="relative">
            <MailIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input id="p-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-border-strong/70 bg-white py-2.5 pl-10 pr-3.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25" />
          </div>
          <p className="mt-1.5 text-[10px] text-muted">This is your login email.</p>
        </div>

        {emailChanged && (
          <div className="mt-4">
            <label htmlFor="p-email-pass" className="mb-1.5 block text-xs font-semibold text-ink">
              Current password <span className="font-normal text-muted">(required to change email)</span>
            </label>
            <div className="relative">
              <LockIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input id="p-email-pass" type="password" autoComplete="current-password" value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} placeholder="Enter your password to confirm" className="w-full rounded-xl border border-amber-300 bg-amber-50/50 py-2.5 pl-10 pr-3.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200" />
            </div>
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-dark disabled:opacity-70"
          >
            {isSaving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>

      {/* Password */}
      <form onSubmit={handleChangePassword} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-secondary">
          <LockIcon className="h-4 w-4 text-primary" />
          Change Password
        </h2>
        {passwordNotice && <p role="status" className="mt-3 rounded-xl border border-[#1e7a3c]/25 bg-[#e9f7ee] px-4 py-2.5 text-xs font-semibold text-[#145c2c]">{passwordNotice}</p>}
        {passwordError && <p role="alert" className="mt-3 rounded-xl border border-danger/25 bg-danger-soft px-4 py-2.5 text-xs font-semibold text-danger">{passwordError}</p>}

        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="p-cur" className="mb-1.5 block text-xs font-semibold text-ink">Current password</label>
            <input id="p-cur" type="password" required autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="p-new" className="mb-1.5 block text-xs font-semibold text-ink">New password</label>
              <input id="p-new" type="password" required autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 8 chars" className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25" />
            </div>
            <div>
              <label htmlFor="p-confirm" className="mb-1.5 block text-xs font-semibold text-ink">Confirm new password</label>
              <input id="p-confirm" type="password" required autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25" />
            </div>
          </div>
          <p className="text-[10px] leading-relaxed text-muted">
            At least 8 characters, with a letter and a number or capital letter. Changing your password signs out all your other devices.
          </p>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="submit"
            disabled={isChangingPassword}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-dark disabled:opacity-70"
          >
            <PencilIcon className="h-4 w-4" />
            {isChangingPassword ? 'Updating…' : 'Change password'}
          </button>
        </div>
      </form>
    </div>
  );
}
