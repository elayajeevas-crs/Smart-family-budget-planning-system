import { useState, type FormEvent } from 'react';
import { History, Pencil, PiggyBank, Plus, Target, Trash2, Wallet } from 'lucide-react';
import { SAVINGS_CATEGORIES, label } from '@shared/constants';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Modal, PageHeader, ProgressBar, Select, SkeletonCards, StatCard, StatusBadge, toOptions } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useFetch } from '@/hooks/useFetch';
import { api, errorMessage, fieldErrors, get } from '@/lib/api';
import { formatCurrency, formatDate, formatPercent, todayInput, toInputDate } from '@/lib/format';
import type { Contribution, SavingsGoal } from '@/types';

interface ListResponse {
  data: SavingsGoal[];
  summary: { totalTarget: number; totalSaved: number; completed: number; behind: number };
}

const emptyForm = { name: '', category: 'OTHER', targetAmount: '', currentAmount: '0', targetDate: '', description: '' };

export default function Savings() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useFetch(() => get<ListResponse>('/savings-goals'), []);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SavingsGoal | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [contributing, setContributing] = useState<SavingsGoal | null>(null);
  const [contribution, setContribution] = useState({ amount: '', date: todayInput(), note: '' });

  const [historyFor, setHistoryFor] = useState<SavingsGoal | null>(null);
  const history = useFetch(() => (historyFor ? get<{ goal: { contributions: Contribution[] } }>(`/savings-goals/${historyFor.id}`) : Promise.resolve(null)), [historyFor?.id]);

  const [deleting, setDeleting] = useState<SavingsGoal | null>(null);

  const set = (k: keyof typeof emptyForm, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setErrors({});
    setFormOpen(true);
  }
  function openEdit(g: SavingsGoal) {
    setEditing(g);
    setForm({ name: g.name, category: g.category, targetAmount: String(g.targetAmount), currentAmount: String(g.currentAmount), targetDate: toInputDate(g.targetDate), description: g.description ?? '' });
    setErrors({});
    setFormOpen(true);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!form.name.trim()) local.name = 'Goal name is required';
    if (!(Number(form.targetAmount) > 0)) local.targetAmount = 'Enter a target greater than 0';
    if (Number(form.currentAmount) < 0 || form.currentAmount === '') local.currentAmount = 'Enter 0 or more';
    if (!form.targetDate) local.targetDate = 'Choose a target date';
    setErrors(local);
    if (Object.keys(local).length) return;
    const payload = { name: form.name.trim(), category: form.category, targetAmount: Number(form.targetAmount), currentAmount: Number(form.currentAmount), targetDate: form.targetDate, description: form.description.trim() || null };
    setSaving(true);
    try {
      if (editing) await api.put(`/savings-goals/${editing.id}`, payload);
      else await api.post('/savings-goals', payload);
      toast.success(editing ? 'Goal updated' : 'Goal created');
      setFormOpen(false);
      reload();
    } catch (err) {
      const fe = fieldErrors(err);
      setErrors(fe);
      if (!Object.keys(fe).length) toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function contribute(e: FormEvent) {
    e.preventDefault();
    if (!contributing) return;
    if (!(Number(contribution.amount) > 0)) return setErrors({ amount: 'Enter an amount greater than 0' });
    setSaving(true);
    try {
      await api.post(`/savings-goals/${contributing.id}/contribute`, { amount: Number(contribution.amount), date: contribution.date || undefined, note: contribution.note.trim() || null });
      toast.success(`Added ${formatCurrency(Number(contribution.amount))} to ${contributing.name}`);
      setContributing(null);
      reload();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!deleting) return;
    setSaving(true);
    try {
      await api.delete(`/savings-goals/${deleting.id}`);
      toast.success('Goal deleted');
      setDeleting(null);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const goals = data?.data ?? [];

  return (
    <>
      <PageHeader
        title="Savings Goals"
        subtitle="Set targets, contribute regularly and see how much to save each month."
        actions={isAdmin && <Button onClick={openCreate}><Plus className="h-4 w-4" /> New goal</Button>}
      />

      {error ? (
        <Card><ErrorState message={error} onRetry={reload} /></Card>
      ) : loading && !data ? (
        <SkeletonCards count={3} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total saved" value={formatCurrency(data?.summary.totalSaved ?? 0)} icon={PiggyBank} tone="green" />
            <StatCard label="Total target" value={formatCurrency(data?.summary.totalTarget ?? 0)} icon={Target} tone="indigo" hint={formatPercent(((data?.summary.totalSaved ?? 0) / (data?.summary.totalTarget || 1)) * 100, 0) + ' funded'} />
            <StatCard label="Completed goals" value={String(data?.summary.completed ?? 0)} icon={Wallet} tone="blue" />
            <StatCard label="Falling behind" value={String(data?.summary.behind ?? 0)} icon={History} tone={(data?.summary.behind ?? 0) > 0 ? 'red' : 'green'} />
          </div>

          {goals.length === 0 ? (
            <Card className="mt-6">
              <EmptyState icon={Target} title="No savings goals yet" message={isAdmin ? 'Create a goal like an Emergency Fund or a New Laptop and track your progress.' : 'A family admin can create savings goals.'} action={isAdmin ? <Button onClick={openCreate}><Plus className="h-4 w-4" /> Create a goal</Button> : undefined} />
            </Card>
          ) : (
            <div className={`mt-6 grid gap-4 lg:grid-cols-2 ${loading ? 'opacity-70' : ''}`}>
              {goals.map((g) => (
                <Card key={g.id} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-semibold">{g.name}</h3>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge tone="indigo">{label(g.category)}</Badge>
                        <StatusBadge status={g.status} />
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold">{formatPercent(g.progressPercent, 0)}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">funded</p>
                    </div>
                  </div>
                  {g.description && <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{g.description}</p>}
                  <ProgressBar className="mt-4 h-3" percent={g.progressPercent} status={g.status === 'BEHIND' || g.status === 'OVERDUE' ? 'CRITICAL' : 'SAFE'} />
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div><p className="text-xs text-slate-500 dark:text-slate-400">Saved</p><p className="font-semibold">{formatCurrency(g.currentAmount)}</p></div>
                    <div><p className="text-xs text-slate-500 dark:text-slate-400">Target</p><p className="font-semibold">{formatCurrency(g.targetAmount)}</p></div>
                    <div><p className="text-xs text-slate-500 dark:text-slate-400">Remaining</p><p className="font-semibold">{formatCurrency(g.remainingAmount)}</p></div>
                    <div><p className="text-xs text-slate-500 dark:text-slate-400">Target date</p><p className="font-semibold">{formatDate(g.targetDate)}</p></div>
                  </div>
                  {g.status !== 'COMPLETED' && (
                    <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60">
                      {g.status === 'OVERDUE' ? <>Target date passed. <strong>{formatCurrency(g.remainingAmount)}</strong> still needed.</> : <>Save <strong>{formatCurrency(g.requiredMonthlySaving)}</strong> per month for {g.monthsLeft} month{g.monthsLeft === 1 ? '' : 's'} to reach this goal.</>}
                      {g.status === 'BEHIND' && <span className="block text-xs text-red-600 dark:text-red-400">Should be around {formatPercent(g.expectedPercent, 0)} by now.</span>}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setHistoryFor(g)}><History className="h-4 w-4" /> History</Button>
                    {isAdmin && (
                      <>
                        <Button size="sm" onClick={() => { setContributing(g); setContribution({ amount: '', date: todayInput(), note: '' }); setErrors({}); }}><Plus className="h-4 w-4" /> Contribute</Button>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(g)} aria-label="Edit goal"><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleting(g)} aria-label="Delete goal"><Trash2 className="h-4 w-4 text-red-500" /></Button>
                      </>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      <Modal open={formOpen} title={editing ? 'Edit goal' : 'New savings goal'} onClose={() => !saving && setFormOpen(false)} footer={<><Button variant="secondary" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button><Button type="submit" form="goal-form" loading={saving}>{editing ? 'Save changes' : 'Create goal'}</Button></>}>
        <form id="goal-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field label="Goal name" required error={errors.name} className="sm:col-span-2">
            <input className={`input ${errors.name ? 'input-error' : ''}`} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Emergency Fund" autoFocus />
          </Field>
          <Field label="Category">
            <Select value={form.category} onChange={(e) => set('category', e.target.value)} options={toOptions(SAVINGS_CATEGORIES)} />
          </Field>
          <Field label="Target date" required error={errors.targetDate}>
            <input className={`input ${errors.targetDate ? 'input-error' : ''}`} type="date" value={form.targetDate} onChange={(e) => set('targetDate', e.target.value)} />
          </Field>
          <Field label="Target amount (₹)" required error={errors.targetAmount}>
            <input className={`input ${errors.targetAmount ? 'input-error' : ''}`} type="number" min="0" step="0.01" value={form.targetAmount} onChange={(e) => set('targetAmount', e.target.value)} />
          </Field>
          <Field label="Current amount (₹)" error={errors.currentAmount} hint="Use 'Contribute' to add to it later">
            <input className={`input ${errors.currentAmount ? 'input-error' : ''}`} type="number" min="0" step="0.01" value={form.currentAmount} onChange={(e) => set('currentAmount', e.target.value)} />
          </Field>
          <Field label="Description (optional)" error={errors.description} className="sm:col-span-2">
            <textarea className="input min-h-[72px]" value={form.description} onChange={(e) => set('description', e.target.value)} />
          </Field>
        </form>
      </Modal>

      <Modal open={Boolean(contributing)} size="sm" title={`Contribute to ${contributing?.name ?? ''}`} onClose={() => !saving && setContributing(null)} footer={<><Button variant="secondary" onClick={() => setContributing(null)} disabled={saving}>Cancel</Button><Button type="submit" form="contribute-form" loading={saving}>Add contribution</Button></>}>
        <form id="contribute-form" onSubmit={contribute} className="space-y-4" noValidate>
          <Field label="Amount (₹)" required error={errors.amount}>
            <input className={`input ${errors.amount ? 'input-error' : ''}`} type="number" min="0" step="0.01" value={contribution.amount} onChange={(e) => setContribution((c) => ({ ...c, amount: e.target.value }))} autoFocus />
          </Field>
          <Field label="Date" error={errors.date}>
            <input className="input" type="date" value={contribution.date} onChange={(e) => setContribution((c) => ({ ...c, date: e.target.value }))} />
          </Field>
          <Field label="Note (optional)" error={errors.note}>
            <input className="input" value={contribution.note} onChange={(e) => setContribution((c) => ({ ...c, note: e.target.value }))} />
          </Field>
        </form>
      </Modal>

      <Modal open={Boolean(historyFor)} title={`${historyFor?.name ?? ''} - contributions`} onClose={() => setHistoryFor(null)}>
        {history.loading ? (
          <p className="py-6 text-center text-sm text-slate-500">Loading...</p>
        ) : history.error ? (
          <ErrorState message={history.error} onRetry={history.reload} />
        ) : !history.data || history.data.goal.contributions.length === 0 ? (
          <EmptyState title="No contributions yet" message="Contributions you add will be listed here." />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {history.data.goal.contributions.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-medium">{formatDate(c.date)}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{c.note || 'Contribution'}{c.userName ? ` · ${c.userName}` : ''}</p>
                </div>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">+{formatCurrency(c.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <ConfirmDialog open={Boolean(deleting)} title="Delete this goal?" message={deleting ? `"${deleting.name}" and its contribution history will be removed permanently.` : ''} loading={saving} onConfirm={remove} onCancel={() => setDeleting(null)} />
    </>
  );
}
