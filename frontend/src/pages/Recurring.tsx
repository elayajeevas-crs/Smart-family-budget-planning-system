import { useState, type FormEvent } from 'react';
import { BellRing, CalendarClock, Pencil, Plus, Repeat, RefreshCw, Trash2, Wallet } from 'lucide-react';
import { EXPENSE_CATEGORIES, FREQUENCIES, PAYMENT_METHODS, label } from '@shared/constants';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Modal, PageHeader, Select, SkeletonRows, StatCard, TableWrap, toOptions, trClass } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useFetch } from '@/hooks/useFetch';
import { api, errorMessage, fieldErrors, get } from '@/lib/api';
import { formatCurrency, formatDate, relativeDue, todayInput, toInputDate } from '@/lib/format';
import type { RecurringItem } from '@/types';

interface ListResponse {
  data: RecurringItem[];
  summary: { activeCount: number; monthlyTotal: number; dueSoon: number };
}

const emptyForm = {
  name: '',
  amount: '',
  frequency: 'MONTHLY',
  nextDueDate: todayInput(),
  category: 'HOUSING',
  paymentMethod: 'UPI',
  autoCreateExpense: false,
  reminderDays: '3',
  isActive: true,
};

export default function Recurring() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useFetch(() => get<ListResponse>('/recurring'), []);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<RecurringItem | null>(null);
  const [processing, setProcessing] = useState(false);

  const set = <K extends keyof typeof emptyForm>(k: K, v: (typeof emptyForm)[K]) => setForm((f) => ({ ...f, [k]: v }));

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm, nextDueDate: todayInput() });
    setErrors({});
    setOpen(true);
  }
  function openEdit(r: RecurringItem) {
    setEditing(r);
    setForm({ name: r.name, amount: String(r.amount), frequency: r.frequency, nextDueDate: toInputDate(r.nextDueDate), category: r.category, paymentMethod: r.paymentMethod, autoCreateExpense: r.autoCreateExpense, reminderDays: String(r.reminderDays), isActive: r.isActive });
    setErrors({});
    setOpen(true);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!form.name.trim()) local.name = 'Name is required';
    if (!(Number(form.amount) > 0)) local.amount = 'Enter an amount greater than 0';
    if (!form.nextDueDate) local.nextDueDate = 'Choose the next due date';
    const reminder = Number(form.reminderDays);
    if (!Number.isInteger(reminder) || reminder < 0 || reminder > 30) local.reminderDays = 'Enter 0 to 30 days';
    setErrors(local);
    if (Object.keys(local).length) return;
    const payload = { name: form.name.trim(), amount: Number(form.amount), frequency: form.frequency, nextDueDate: form.nextDueDate, category: form.category, paymentMethod: form.paymentMethod, autoCreateExpense: form.autoCreateExpense, reminderDays: reminder, isActive: form.isActive };
    setSaving(true);
    try {
      if (editing) await api.put(`/recurring/${editing.id}`, payload);
      else await api.post('/recurring', payload);
      toast.success(editing ? 'Recurring expense updated' : 'Recurring expense added');
      setOpen(false);
      reload();
    } catch (err) {
      const fe = fieldErrors(err);
      setErrors(fe);
      if (!Object.keys(fe).length) toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!deleting) return;
    setSaving(true);
    try {
      await api.delete(`/recurring/${deleting.id}`);
      toast.success('Recurring expense deleted');
      setDeleting(null);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function processNow() {
    setProcessing(true);
    try {
      const res = await api.post<{ created: number }>('/recurring/process');
      toast.success(res.data.created ? `Created ${res.data.created} expense${res.data.created === 1 ? '' : 's'}` : 'Nothing was due');
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setProcessing(false);
    }
  }

  const rows = data?.data ?? [];

  return (
    <>
      <PageHeader
        title="Recurring Payments"
        subtitle="Rent, EMIs, subscriptions and bills that repeat. Auto-create keeps your expenses up to date."
        actions={isAdmin && (
          <>
            <Button variant="secondary" onClick={processNow} loading={processing}><RefreshCw className="h-4 w-4" /> Process due now</Button>
            <Button onClick={openCreate}><Plus className="h-4 w-4" /> Add recurring</Button>
          </>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Active items" value={String(data?.summary.activeCount ?? 0)} icon={Repeat} tone="indigo" />
        <StatCard label="Monthly commitment" value={formatCurrency(data?.summary.monthlyTotal ?? 0)} icon={Wallet} tone="amber" hint="All frequencies converted to a monthly amount" />
        <StatCard label="Due soon" value={String(data?.summary.dueSoon ?? 0)} icon={BellRing} tone={(data?.summary.dueSoon ?? 0) > 0 ? 'red' : 'green'} hint="Within their reminder window" />
      </div>

      <Card className="mt-6">
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && !data ? (
          <SkeletonRows />
        ) : rows.length === 0 ? (
          <EmptyState icon={CalendarClock} title="No recurring expenses" message={isAdmin ? 'Add rent, electricity, EMI or subscriptions to see your fixed monthly burden.' : 'A family admin can add recurring expenses.'} action={isAdmin ? <Button onClick={openCreate}><Plus className="h-4 w-4" /> Add recurring</Button> : undefined} />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <th className="th">Name</th>
                <th className="th">Category</th>
                <th className="th text-right">Amount</th>
                <th className="th">Frequency</th>
                <th className="th">Next due</th>
                <th className="th">Auto-create</th>
                <th className="th">Reminder</th>
                {isAdmin && <th className="th text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={`${trClass} ${r.isActive ? '' : 'opacity-60'}`}>
                  <td className="td font-medium">{r.name} {!r.isActive && <Badge tone="slate">Paused</Badge>}</td>
                  <td className="td"><Badge tone="indigo">{label(r.category)}</Badge></td>
                  <td className="td text-right font-semibold">{formatCurrency(r.amount)}</td>
                  <td className="td">{label(r.frequency)}</td>
                  <td className="td whitespace-nowrap">
                    {formatDate(r.nextDueDate)}
                    <p className={`text-xs ${r.daysUntilDue < 0 ? 'text-red-600' : r.daysUntilDue <= r.reminderDays ? 'text-amber-600' : 'text-slate-500 dark:text-slate-400'}`}>{relativeDue(r.daysUntilDue)}</p>
                  </td>
                  <td className="td">{r.autoCreateExpense ? <Badge tone="green">On</Badge> : <Badge tone="slate">Off</Badge>}</td>
                  <td className="td">{r.reminderDays} day{r.reminderDays === 1 ? '' : 's'} before</td>
                  {isAdmin && (
                    <td className="td text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(r)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleting(r)} aria-label="Delete"><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Modal open={open} title={editing ? 'Edit recurring expense' : 'Add recurring expense'} onClose={() => !saving && setOpen(false)} footer={<><Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button><Button type="submit" form="recurring-form" loading={saving}>{editing ? 'Save changes' : 'Add'}</Button></>}>
        <form id="recurring-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field label="Name" required error={errors.name} className="sm:col-span-2">
            <input className={`input ${errors.name ? 'input-error' : ''}`} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. House rent" autoFocus />
          </Field>
          <Field label="Amount (₹)" required error={errors.amount}>
            <input className={`input ${errors.amount ? 'input-error' : ''}`} type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set('amount', e.target.value)} />
          </Field>
          <Field label="Frequency" required>
            <Select value={form.frequency} onChange={(e) => set('frequency', e.target.value)} options={toOptions(FREQUENCIES)} />
          </Field>
          <Field label="Next due date" required error={errors.nextDueDate}>
            <input className={`input ${errors.nextDueDate ? 'input-error' : ''}`} type="date" value={form.nextDueDate} onChange={(e) => set('nextDueDate', e.target.value)} />
          </Field>
          <Field label="Category" required>
            <Select value={form.category} onChange={(e) => set('category', e.target.value)} options={toOptions(EXPENSE_CATEGORIES)} />
          </Field>
          <Field label="Payment method">
            <Select value={form.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value)} options={toOptions(PAYMENT_METHODS)} />
          </Field>
          <Field label="Reminder (days before)" error={errors.reminderDays}>
            <input className={`input ${errors.reminderDays ? 'input-error' : ''}`} type="number" min="0" max="30" value={form.reminderDays} onChange={(e) => set('reminderDays', e.target.value)} />
          </Field>
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600" checked={form.autoCreateExpense} onChange={(e) => set('autoCreateExpense', e.target.checked)} />
            <span>Auto-create an expense on each due date<span className="block text-xs text-slate-500 dark:text-slate-400">The expense is added automatically and the next due date moves forward. Leave off if you record it yourself.</span></span>
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-indigo-600" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} />
            Active (uncheck to pause)
          </label>
        </form>
      </Modal>

      <ConfirmDialog open={Boolean(deleting)} title="Delete recurring expense?" message={deleting ? `"${deleting.name}" will stop repeating. Expenses already created are kept.` : ''} loading={saving} onConfirm={remove} onCancel={() => setDeleting(null)} />
    </>
  );
}
