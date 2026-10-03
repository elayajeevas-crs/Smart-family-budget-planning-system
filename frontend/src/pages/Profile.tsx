import { useState, type FormEvent } from 'react';
import { KeyRound, ShieldCheck, UserCog } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Field, PageHeader } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { api, errorMessage, fieldErrors } from '@/lib/api';
import { formatDate } from '@/lib/format';

export default function Profile() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [profile, setProfile] = useState({ name: user?.name ?? '', email: user?.email ?? '' });
  const [pErrors, setPErrors] = useState<Record<string, string>>({});
  const [pBusy, setPBusy] = useState(false);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [wErrors, setWErrors] = useState<Record<string, string>>({});
  const [wBusy, setWBusy] = useState(false);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (profile.name.trim().length < 2) local.name = 'Enter your full name';
    if (!/^\S+@\S+\.\S+$/.test(profile.email)) local.email = 'Enter a valid email address';
    setPErrors(local);
    if (Object.keys(local).length) return;
    setPBusy(true);
    try {
      await api.put('/auth/profile', { name: profile.name.trim(), email: profile.email.trim() });
      await refresh();
      toast.success('Profile updated');
    } catch (err) {
      const fe = fieldErrors(err);
      setPErrors(fe);
      toast.error(errorMessage(err));
    } finally {
      setPBusy(false);
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!pw.currentPassword) local.currentPassword = 'Enter your current password';
    if (pw.newPassword.length < 8 || !/[a-z]/.test(pw.newPassword) || !/[A-Z]/.test(pw.newPassword) || !/[0-9]/.test(pw.newPassword)) {
      local.newPassword = 'Use 8+ characters with upper case, lower case and a number';
    }
    if (pw.newPassword !== pw.confirmPassword) local.confirmPassword = 'Passwords do not match';
    setWErrors(local);
    if (Object.keys(local).length) return;
    setWBusy(true);
    try {
      await api.put('/auth/change-password', pw);
      setPw({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast.success('Password changed');
    } catch (err) {
      const fe = fieldErrors(err);
      setWErrors(fe);
      toast.error(errorMessage(err));
    } finally {
      setWBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Profile" subtitle="Manage your personal details and password." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-1">
          <div className="flex flex-col items-center text-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-indigo-600 text-3xl font-bold text-white">{user?.name.charAt(0).toUpperCase()}</span>
            <h2 className="mt-4 text-lg font-semibold">{user?.name}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{user?.email}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <Badge tone={user?.role === 'ADMIN' ? 'indigo' : 'slate'}>{user?.role === 'ADMIN' ? 'Family admin' : 'Family member'}</Badge>
              {user?.family && <Badge tone="blue">{user.family.name}</Badge>}
            </div>
            <p className="mt-4 text-xs text-slate-400">Member since {formatDate(user?.createdAt)}</p>
          </div>
          <div className="mt-6 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            Passwords are hashed with bcrypt and never leave the server.
          </div>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Personal details" action={<UserCog className="h-5 w-5 text-slate-400" />} />
            <form onSubmit={saveProfile} className="grid gap-4 p-5 sm:grid-cols-2" noValidate>
              <Field label="Full name" required error={pErrors.name}>
                <input className={`input ${pErrors.name ? 'input-error' : ''}`} value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} />
              </Field>
              <Field label="Email" required error={pErrors.email}>
                <input className={`input ${pErrors.email ? 'input-error' : ''}`} type="email" value={profile.email} onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))} />
              </Field>
              <div className="sm:col-span-2"><Button type="submit" loading={pBusy}>Save changes</Button></div>
            </form>
          </Card>

          <Card>
            <CardHeader title="Change password" action={<KeyRound className="h-5 w-5 text-slate-400" />} />
            <form onSubmit={changePassword} className="grid gap-4 p-5 sm:grid-cols-2" noValidate>
              <Field label="Current password" required error={wErrors.currentPassword} className="sm:col-span-2">
                <input className={`input ${wErrors.currentPassword ? 'input-error' : ''}`} type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw((p) => ({ ...p, currentPassword: e.target.value }))} />
              </Field>
              <Field label="New password" required error={wErrors.newPassword}>
                <input className={`input ${wErrors.newPassword ? 'input-error' : ''}`} type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw((p) => ({ ...p, newPassword: e.target.value }))} />
              </Field>
              <Field label="Confirm new password" required error={wErrors.confirmPassword}>
                <input className={`input ${wErrors.confirmPassword ? 'input-error' : ''}`} type="password" autoComplete="new-password" value={pw.confirmPassword} onChange={(e) => setPw((p) => ({ ...p, confirmPassword: e.target.value }))} />
              </Field>
              <div className="sm:col-span-2"><Button type="submit" loading={wBusy}>Update password</Button></div>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
