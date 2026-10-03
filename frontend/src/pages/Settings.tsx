import { Laptop, LogOut, Moon, Sun } from 'lucide-react';
import { Button, Card, CardHeader, Field, PageHeader, Select, cx } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { type ThemeMode, useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import { formatCurrency } from '@/lib/format';

const THEMES: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Laptop },
];

export default function Settings() {
  const { settings, update } = useSettings();
  const { logout } = useAuth();
  const toast = useToast();

  return (
    <>
      <PageHeader title="Settings" subtitle="Preferences are saved on this device." />
      <div className="max-w-2xl space-y-6">
        <Card>
          <CardHeader title="Appearance" subtitle="Choose how the app looks" />
          <div className="grid grid-cols-3 gap-3 p-5">
            {THEMES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => update({ theme: value })}
                aria-pressed={settings.theme === value}
                className={cx('flex flex-col items-center gap-2 rounded-xl border p-4 text-sm font-medium transition', settings.theme === value ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800')}
              >
                <Icon className="h-5 w-5" />
                {label}
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Display" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Rows per page" hint="Applies to income, expenses and transactions">
              <Select value={String(settings.pageSize)} onChange={(e) => update({ pageSize: Number(e.target.value) })} options={[5, 10, 20, 50].map((n) => ({ value: String(n), label: `${n} rows` }))} />
            </Field>
            <Field label="Number format" hint={`Example: ${formatCurrency(1234567.5)}`}>
              <Select value={settings.numberFormat} onChange={(e) => update({ numberFormat: e.target.value as 'en-IN' | 'en-US' })} options={[{ value: 'en-IN', label: 'Indian (12,34,567)' }, { value: 'en-US', label: 'International (1,234,567)' }]} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Session" />
          <div className="flex flex-wrap items-center justify-between gap-3 p-5">
            <p className="text-sm text-slate-500 dark:text-slate-400">Sign out of this device. Your data stays safe in the database.</p>
            <Button variant="secondary" onClick={() => { logout(); toast.success('Signed out'); }}><LogOut className="h-4 w-4" /> Sign out</Button>
          </div>
        </Card>
      </div>
    </>
  );
}
