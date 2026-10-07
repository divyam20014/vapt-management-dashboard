import { useState, type FormEvent, type ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';
import Button from '../components/ui/Button';
import { TextField } from '../components/ui/FormField';
import { useAuth } from '../hooks/useAuth';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { toApiError } from '../services/api';
import { PASSWORD_MIN_LENGTH } from '../utils/constants';

function Shell({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-md bg-teal-600 text-white">
            <ShieldCheck className="size-5" aria-hidden />
          </div>
          <p className="text-lg font-semibold text-slate-900">VAPT Manager</p>
        </div>
        <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
          <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
          <p className="mt-1 mb-6 text-sm text-slate-500">{description}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </p>
  );
}

export function SignInPage({ notice }: { notice?: string }) {
  useDocumentTitle('Sign in');
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(toApiError(err).message);
      setPassword('');
      setBusy(false);
    }
  };

  return (
    <Shell title="Sign in" description="Use the account an Admin created for you.">
      <form noValidate onSubmit={submit} className="space-y-4">
        {notice && !error && (
          <p role="status" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {notice}
          </p>
        )}
        <FormError message={error} />
        <TextField label="Email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button type="submit" className="w-full" loading={busy}>
          Sign in
        </Button>
      </form>
    </Shell>
  );
}

export function SetupPage() {
  useDocumentTitle('Set up');
  const { setup } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof form, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const next: typeof errors = {};
    if (!form.name.trim()) next.name = 'Name is required.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) next.email = 'Enter a valid email address.';
    if (form.password.length < PASSWORD_MIN_LENGTH) next.password = `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
    if (form.confirm !== form.password) next.confirm = 'The passwords do not match.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    setError(null);
    try {
      await setup({ name: form.name.trim(), email: form.email.trim(), password: form.password });
    } catch (err) {
      const apiError = toApiError(err);
      const fieldErrors: typeof errors = {};
      apiError.fieldErrors.forEach((f) => {
        if (f.field in form) fieldErrors[f.field as keyof typeof form] = f.message;
      });
      setErrors(fieldErrors);
      setError(apiError.message);
      setBusy(false);
    }
  };

  return (
    <Shell title="Create the first Admin" description="Nobody can sign in yet. This account manages users and roles; you can add other people afterwards.">
      <form noValidate onSubmit={submit} className="space-y-4">
        <FormError message={error} />
        <TextField label="Name" required autoComplete="name" maxLength={200} value={form.name} error={errors.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <TextField label="Email" type="email" required autoComplete="username" maxLength={320} value={form.email} error={errors.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <TextField
          label="Password"
          type="password"
          required
          autoComplete="new-password"
          hint={`At least ${PASSWORD_MIN_LENGTH} characters. A passphrase works well.`}
          value={form.password}
          error={errors.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <TextField label="Confirm password" type="password" required autoComplete="new-password" value={form.confirm} error={errors.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
        <Button type="submit" className="w-full" loading={busy}>
          Create Admin and sign in
        </Button>
      </form>
    </Shell>
  );
}
