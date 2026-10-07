import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound, Pencil, Plus, UserRound } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { SelectField, TextField } from '../ui/FormField';
import EmptyState from '../states/EmptyState';
import { userService } from '../../services/userService';
import { toApiError } from '../../services/api';
import { useUsers } from '../../hooks/useUsers';
import { useAuth } from '../../hooks/useAuth';
import { PASSWORD_MIN_LENGTH, USER_ROLES, type UserRole } from '../../utils/constants';
import { formatDateTime } from '../../utils/format';
import type { User, UserInput } from '../../types/user';

const EMPTY = { name: '', email: '', role: 'Security Analyst' as UserRole, password: '' };
type FormErrors = Partial<Record<keyof typeof EMPTY, string>>;

const ROLE_HELP: Record<UserRole, string> = {
  Admin: 'Everything, including users, project deletion and the audit log.',
  'Security Analyst': 'Create and edit projects, upload reports, update findings and decide on duplicates.',
  Viewer: 'Read-only: dashboards, projects, scans and findings, and exports.',
};

function UserFormModal({ open, user, onClose, onSaved }: { open: boolean; user: User | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(user ? { name: user.name, email: user.email, role: user.role, password: '' } : EMPTY);
      setErrors({});
      setSubmitError(null);
    }
  }, [open, user]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const next: FormErrors = {};
    if (!form.name.trim()) next.name = 'Name is required.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) next.email = 'Enter a valid email address.';
    if (!user && form.password && form.password.length < PASSWORD_MIN_LENGTH) next.password = `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    setSubmitError(null);
    try {
      const payload: UserInput = { name: form.name.trim(), email: form.email.trim(), role: form.role };
      if (user) await userService.update(user.id, payload);
      else await userService.create(form.password ? { ...payload, password: form.password } : payload);
      onSaved();
    } catch (err) {
      const apiError = toApiError(err);
      const fieldErrors: FormErrors = {};
      apiError.fieldErrors.forEach((f) => {
        if (f.field in EMPTY) fieldErrors[f.field as keyof typeof EMPTY] = f.message;
      });
      setErrors(fieldErrors);
      setSubmitError(apiError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={user ? 'Edit user' : 'Add user'}
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="user-form" loading={busy}>
            {user ? 'Save changes' : 'Add user'}
          </Button>
        </>
      }
    >
      <form id="user-form" noValidate onSubmit={submit} className="space-y-4">
        {submitError && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {submitError}
          </p>
        )}
        <TextField label="Name" required maxLength={200} value={form.name} error={errors.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <TextField label="Email" required type="email" maxLength={320} value={form.email} error={errors.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <SelectField
          label="Role"
          options={USER_ROLES}
          value={form.role}
          hint={ROLE_HELP[form.role]}
          onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
        />
        {!user && (
          <TextField
            label="Initial password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            error={errors.password}
            hint={`At least ${PASSWORD_MIN_LENGTH} characters. Leave empty to add someone who can be assigned findings but cannot sign in yet.`}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        )}
      </form>
    </Modal>
  );
}

function SetPasswordModal({ user, onClose, onSaved }: { user: User | null; onClose: () => void; onSaved: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPassword('');
    setError(null);
  }, [user]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await userService.setPassword(user.id, password);
      onSaved();
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={user !== null}
      size="sm"
      title={user?.can_sign_in ? `Reset password for ${user.name}` : `Set password for ${user?.name ?? ''}`}
      description="Share it with them privately. They are signed out everywhere and can change it after signing in."
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="set-password-form" loading={busy}>
            Set password
          </Button>
        </>
      }
    >
      <form id="set-password-form" noValidate onSubmit={submit}>
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          error={error ?? undefined}
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          onChange={(e) => setPassword(e.target.value)}
        />
      </form>
    </Modal>
  );
}

/** User accounts and roles. Admin only (the API refuses these changes for other roles). */
export default function UsersCard() {
  const { users, reloadUsers, loaded } = useUsers();
  const { user: me } = useAuth();
  const [editing, setEditing] = useState<User | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [passwordFor, setPasswordFor] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const toggleActive = async (user: User) => {
    setError(null);
    setNotice(null);
    try {
      await userService.update(user.id, { active: !user.active });
      reloadUsers();
    } catch (err) {
      setError(toApiError(err).message);
    }
  };

  return (
    <Card
      title="Users"
      description="Accounts that can sign in, and people who can be assigned findings. Roles are enforced by the server."
      bodyClassName=""
      actions={
        <Button
          size="sm"
          icon={<Plus className="size-4" aria-hidden />}
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          Add user
        </Button>
      }
    >
      {error && (
        <p role="alert" className="mx-5 mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mx-5 mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      )}
      {loaded && users.length === 0 ? (
        <EmptyState compact icon={<UserRound className="size-5" aria-hidden />} title="No users yet" description="Add the people who work on your projects." />
      ) : (
        <div className="relative overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
              <tr>
                <th scope="col" className="px-5 py-2">Name</th>
                <th scope="col" className="px-5 py-2">Email</th>
                <th scope="col" className="px-5 py-2">Role</th>
                <th scope="col" className="px-5 py-2">Sign-in</th>
                <th scope="col" className="px-5 py-2">Status</th>
                <th scope="col" className="px-5 py-2 text-right"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => (
                <tr key={user.id} className={user.active ? '' : 'text-slate-400'}>
                  <td className="px-5 py-2 font-medium whitespace-nowrap">
                    {user.name}
                    {me?.id === user.id && <span className="ml-2 rounded bg-teal-50 px-1.5 py-0.5 text-xs font-medium text-teal-700">you</span>}
                  </td>
                  <td className="px-5 py-2">{user.email}</td>
                  <td className="px-5 py-2 whitespace-nowrap">{user.role}</td>
                  <td className="px-5 py-2 text-xs whitespace-nowrap">
                    {user.can_sign_in ? (user.last_login_at ? `Last ${formatDateTime(user.last_login_at)}` : 'Never signed in') : 'No password set'}
                  </td>
                  <td className="px-5 py-2">{user.active ? 'Active' : 'Inactive'}</td>
                  <td className="space-x-2 px-5 py-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setPasswordFor(user)}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      aria-label={`${user.can_sign_in ? 'Reset' : 'Set'} password for ${user.name}`}
                    >
                      <KeyRound className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(user);
                        setFormOpen(true);
                      }}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      aria-label={`Edit ${user.name}`}
                    >
                      <Pencil className="size-4" aria-hidden />
                    </button>
                    {me?.id !== user.id && (
                      <button type="button" onClick={() => void toggleActive(user)} className="text-xs font-medium text-slate-600 hover:text-slate-900">
                        {user.active ? 'Deactivate' : 'Activate'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <UserFormModal
        open={formOpen}
        user={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          reloadUsers();
        }}
      />
      <SetPasswordModal
        user={passwordFor}
        onClose={() => setPasswordFor(null)}
        onSaved={() => {
          setNotice(`Password set for ${passwordFor?.name}.`);
          setPasswordFor(null);
          reloadUsers();
        }}
      />
    </Card>
  );
}
