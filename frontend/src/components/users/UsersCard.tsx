import { useEffect, useState, type FormEvent } from 'react';
import { Pencil, Plus, UserRound } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { SelectField, TextField } from '../ui/FormField';
import EmptyState from '../states/EmptyState';
import { userService } from '../../services/userService';
import { toApiError } from '../../services/api';
import { useActingUser } from '../../hooks/useActingUser';
import { USER_ROLES, type UserRole } from '../../utils/constants';
import type { User, UserInput } from '../../types/user';

const EMPTY: UserInput = { name: '', email: '', role: 'Security Analyst' };

function UserFormModal({ open, user, onClose, onSaved }: { open: boolean; user: User | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<UserInput>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof UserInput, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(user ? { name: user.name, email: user.email, role: user.role } : EMPTY);
      setErrors({});
      setSubmitError(null);
    }
  }, [open, user]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const next: typeof errors = {};
    if (!form.name.trim()) next.name = 'Name is required.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) next.email = 'Enter a valid email address.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    setSubmitError(null);
    try {
      const payload = { name: form.name.trim(), email: form.email.trim(), role: form.role };
      if (user) await userService.update(user.id, payload);
      else await userService.create(payload);
      onSaved();
    } catch (err) {
      const apiError = toApiError(err);
      const fieldErrors: typeof errors = {};
      apiError.fieldErrors.forEach((f) => {
        if (f.field in EMPTY) fieldErrors[f.field as keyof UserInput] = f.message;
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
          hint="Stored now; enforced when sign-in is added."
          onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
        />
      </form>
    </Modal>
  );
}

/** People who can be assigned findings and who record changes. */
export default function UsersCard() {
  const { users, actingUser, setActingUser, reloadUsers, loaded } = useActingUser();
  const [editing, setEditing] = useState<User | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleActive = async (user: User) => {
    setError(null);
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
      description="Used for assignment and to record who changed what. This is not sign-in; authentication is added in a later phase."
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
      {loaded && users.length === 0 ? (
        <EmptyState compact icon={<UserRound className="size-5" aria-hidden />} title="No users yet" description="Add yourself first so status changes can be attributed to you." />
      ) : (
        <div className="relative overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
              <tr>
                <th scope="col" className="px-5 py-2">Name</th>
                <th scope="col" className="px-5 py-2">Email</th>
                <th scope="col" className="px-5 py-2">Role</th>
                <th scope="col" className="px-5 py-2">Status</th>
                <th scope="col" className="px-5 py-2 text-right"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => (
                <tr key={user.id} className={user.active ? '' : 'text-slate-400'}>
                  <td className="px-5 py-2 font-medium">
                    {user.name}
                    {actingUser?.id === user.id && <span className="ml-2 rounded bg-teal-50 px-1.5 py-0.5 text-xs font-medium text-teal-700">acting as</span>}
                  </td>
                  <td className="px-5 py-2">{user.email}</td>
                  <td className="px-5 py-2">{user.role}</td>
                  <td className="px-5 py-2">{user.active ? 'Active' : 'Inactive'}</td>
                  <td className="space-x-2 px-5 py-2 text-right whitespace-nowrap">
                    {user.active && actingUser?.id !== user.id && (
                      <button type="button" onClick={() => setActingUser(user.id)} className="text-xs font-medium text-teal-700 hover:text-teal-800">
                        Act as
                      </button>
                    )}
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
                    <button type="button" onClick={() => void toggleActive(user)} className="text-xs font-medium text-slate-600 hover:text-slate-900">
                      {user.active ? 'Deactivate' : 'Activate'}
                    </button>
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
    </Card>
  );
}
