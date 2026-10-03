import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, PiggyBank, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';
import { Alert, Button, Field, cx } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { errorMessage, fieldErrors } from '@/lib/api';

function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15">
            <PiggyBank className="h-6 w-6" />
          </span>
          <span className="text-lg font-bold">Smart Family Budget</span>
        </div>
        <div>
          <h2 className="text-4xl font-bold leading-tight">Plan together.<br />Spend wisely.<br />Stay debt-free.</h2>
          <ul className="mt-8 space-y-4 text-indigo-100">
            <li className="flex items-center gap-3"><TrendingUp className="h-5 w-5" /> See where every rupee goes</li>
            <li className="flex items-center gap-3"><ShieldCheck className="h-5 w-5" /> Budgets and alerts before overspending happens</li>
            <li className="flex items-center gap-3"><Sparkles className="h-5 w-5" /> Insights and goals that keep your family on track</li>
          </ul>
        </div>
        <p className="text-sm text-indigo-200">Financial awareness for every family member.</p>
      </div>
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white">
              <PiggyBank className="h-5 w-5" />
            </span>
            <span className="font-bold">Smart Family Budget</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
          <div className="mt-6">{children}</div>
          <div className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">{footer}</div>
        </div>
      </div>
    </div>
  );
}

function PasswordInput({ value, onChange, invalid, autoComplete, id }: { value: string; onChange: (v: string) => void; invalid?: boolean; autoComplete: string; id: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        className={cx('input pr-10', invalid && 'input-error')}
        type={show ? 'text' : 'password'}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
      />
      <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-0 px-3 text-slate-400 hover:text-slate-600" aria-label={show ? 'Hide password' : 'Show password'}>
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const local: Record<string, string> = {};
    if (!email.trim()) local.email = 'Email is required';
    if (!password) local.password = 'Password is required';
    setErrors(local);
    if (Object.keys(local).length) return;
    setLoading(true);
    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(errorMessage(err, 'Unable to sign in'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to manage your family finances."
      footer={<>New here? <Link to="/register" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">Create an account</Link></>}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}
        <Field label="Email" error={errors.email}>
          <input className={cx('input', errors.email && 'input-error')} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" error={errors.password}>
          <PasswordInput id="login-password" value={password} onChange={setPassword} invalid={Boolean(errors.password)} autoComplete="current-password" />
        </Field>
        <Button type="submit" className="w-full" loading={loading}>Sign in</Button>
      </form>

      <div className="mt-6 rounded-xl border border-dashed border-indigo-300 bg-indigo-50 p-4 text-sm dark:border-indigo-800 dark:bg-indigo-950/40">
        <p className="font-medium text-indigo-900 dark:text-indigo-200">Demo account (sample data)</p>
        <p className="mt-1 text-indigo-800 dark:text-indigo-300">
          <span className="font-mono">demo@smartbudget.com</span> / <span className="font-mono">Demo@12345</span>
        </p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => { setEmail('demo@smartbudget.com'); setPassword('Demo@12345'); setErrors({}); }}>
          Fill demo credentials
        </Button>
      </div>
    </AuthShell>
  );
}

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const rules = [
    { ok: form.password.length >= 8, text: 'At least 8 characters' },
    { ok: /[a-z]/.test(form.password) && /[A-Z]/.test(form.password), text: 'Upper and lower case letters' },
    { ok: /[0-9]/.test(form.password), text: 'At least one number' },
  ];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const local: Record<string, string> = {};
    if (form.name.trim().length < 2) local.name = 'Enter your full name';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) local.email = 'Enter a valid email address';
    if (!rules.every((r) => r.ok)) local.password = 'Password does not meet the requirements';
    if (form.password !== form.confirmPassword) local.confirmPassword = 'Passwords do not match';
    setErrors(local);
    if (Object.keys(local).length) return;
    setLoading(true);
    try {
      await register({ ...form, name: form.name.trim(), email: form.email.trim() });
      toast.success('Account created. Next, set up your family.');
      navigate('/family', { replace: true });
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(errorMessage(err, 'Unable to create account'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Start planning your family's finances in minutes."
      footer={<>Already have an account? <Link to="/login" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">Sign in</Link></>}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}
        <Field label="Full name" error={errors.name}>
          <input className={cx('input', errors.name && 'input-error')} autoComplete="name" value={form.name} onChange={(e) => set('name')(e.target.value)} />
        </Field>
        <Field label="Email" error={errors.email}>
          <input className={cx('input', errors.email && 'input-error')} type="email" autoComplete="email" value={form.email} onChange={(e) => set('email')(e.target.value)} />
        </Field>
        <Field label="Password" error={errors.password}>
          <PasswordInput id="reg-password" value={form.password} onChange={set('password')} invalid={Boolean(errors.password)} autoComplete="new-password" />
          <ul className="mt-2 space-y-0.5 text-xs">
            {rules.map((r) => (
              <li key={r.text} className={r.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}>
                {r.ok ? '✓' : '•'} {r.text}
              </li>
            ))}
          </ul>
        </Field>
        <Field label="Confirm password" error={errors.confirmPassword}>
          <PasswordInput id="reg-confirm" value={form.confirmPassword} onChange={set('confirmPassword')} invalid={Boolean(errors.confirmPassword)} autoComplete="new-password" />
        </Field>
        <Button type="submit" className="w-full" loading={loading}>Create account</Button>
      </form>
    </AuthShell>
  );
}
