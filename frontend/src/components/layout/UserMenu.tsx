import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ChevronDown, KeyRound, LogOut, UserRound } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { TextField } from '../ui/FormField';
import { useAuth } from '../../hooks/useAuth';
import { authService } from '../../services/authService';
import { toApiError } from '../../services/api';
import { PASSWORD_MIN_LENGTH } from '../../utils/constants';

function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [errors, setErrors] = useState<Partial<Record<'current' | 'next' | 'confirm', string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({ current: '', next: '', confirm: '' });
      setErrors({});
      setError(null);
      setDone(false);
    }
  }, [open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const next: typeof errors = {};
    if (!form.current) next.current = 'Enter your current password.';
    if (form.next.length < PASSWORD_MIN_LENGTH) next.next = `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
    if (form.confirm !== form.next) next.confirm = 'The passwords do not match.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    setError(null);
    try {
      await authService.changePassword(form.current, form.next);
      setDone(true);
    } catch (err) {
      const apiError = toApiError(err);
      const field = apiError.fieldErrors[0];
      if (field?.field === 'current_password') setErrors({ current: field.message });
      else if (field?.field === 'new_password') setErrors({ next: field.message });
      else setError(apiError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Change password"
      description="Other browsers signed in to your account will be signed out."
      size="sm"
      onClose={busy ? () => undefined : onClose}
      footer={
        done ? (
          <Button onClick={onClose}>Close</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form="password-form" loading={busy}>
              Change password
            </Button>
          </>
        )
      }
    >
      {done ? (
        <p role="status" className="text-sm text-emerald-700">
          Your password was changed.
        </p>
      ) : (
        <form id="password-form" noValidate onSubmit={submit} className="space-y-4">
          {error && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <TextField label="Current password" type="password" autoComplete="current-password" required value={form.current} error={errors.current} onChange={(e) => setForm({ ...form, current: e.target.value })} />
          <TextField label="New password" type="password" autoComplete="new-password" required hint={`At least ${PASSWORD_MIN_LENGTH} characters.`} value={form.next} error={errors.next} onChange={(e) => setForm({ ...form, next: e.target.value })} />
          <TextField label="Confirm new password" type="password" autoComplete="new-password" required value={form.confirm} error={errors.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
        </form>
      )}
    </Modal>
  );
}

/** The signed-in user, their role, and sign-out. */
export default function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${user.name} (${user.role})`}
        onClick={() => setOpen((value) => !value)}
        className="flex max-w-48 items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
      >
        <UserRound className="size-4 shrink-0 text-slate-500" aria-hidden />
        <span className="hidden min-w-0 text-left leading-tight sm:block">
          <span className="block truncate font-medium text-slate-900">{user.name}</span>
          <span className="block truncate text-xs text-slate-500">{user.role}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-slate-400" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 z-40 mt-1 w-56 rounded-md bg-white py-1 shadow-lg ring-1 ring-slate-200">
          <div className="border-b border-slate-100 px-3 py-2">
            <p className="truncate text-sm font-medium text-slate-900">{user.name}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
            <p className="mt-0.5 text-xs text-slate-500">Role: {user.role}</p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setPasswordOpen(true);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            <KeyRound className="size-4" aria-hidden />
            Change password
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => void logout()}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            <LogOut className="size-4" aria-hidden />
            Sign out
          </button>
        </div>
      )}
      <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </div>
  );
}
