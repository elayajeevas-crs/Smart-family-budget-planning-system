import { useState, type FormEvent } from 'react';
import { AlertOctagon, CalendarClock, CalendarDays, CheckCircle2, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, PAYMENT_STATUSES, label } from '@shared/constants';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Modal, PageHeader, Pagination, Select, SkeletonRows, StatCard, StatusBadge, TableWrap, toOptions, trClass } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useDebounced, useFetch } from '@/hooks/useFetch';
import { api, errorMessage, fieldErrors, get } from '@/lib/api';
import { formatCurrency, formatDate, relativeDue, todayInput, toInputDate } from '@/lib/format';
import type { Paged, PaymentItem } from '@/types';

interface Bucket {
  count: number;
  amount: number;
}
type ListResponse = Paged<PaymentItem> & {
  summary: { upcoming: Bucket; dueToday: Bucket; overdue: Bucket; paid: Bucket };
};

const emptyForm = { name: '', amount: '', dueDate: todayInput(), category: 'BILLS', notes: '', status: 'PENDING' };

export default function Payments() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [dueState, setDueState] = useState('');
  const [category, setCategory] = useState('');
  const debounced = useDebounced(search);

  const { data, loading, error, reload } = useFetch(
    () => get<ListResponse>('/payments', { page, limit: 10, search: debounced, status, dueState, category }),
    [page, debounced, status, dueState, category],
  );

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<PaymentItem | null>(null);
  const [paying, setPaying] = useState<PaymentItem | null>(null);
  const [payOptions, setPayOptions] = useState({ recordExpense: true, paymentMethod: 'UPI' });

  const set = (k: keyof typeof emptyForm, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const filtered = Boolean(search || status || dueState || category);

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm, dueDate: todayInput() });
    setErrors({});
    setOpen(true);
  }
  function openEdit(p: PaymentItem) {
    setEditing(p);
    setForm({ name: p.name, amount: String(p.amount), dueDate: toInputDate(p.dueDate), category: p.category, notes: p.notes ?? '', status: p.status === 'PAID' ? 'PAID' : 'PENDING' });
    setErrors({});
    setOpen(true);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!form.name.trim()) local.name = 'Payment name is required';
    if (!(Number(form.amount) > 0)) local.amount = 'Enter an amount greater than 0';
    if (!form.dueDate) local.dueDate = 'Choose a due date';
    setErrors(local);
    if (Object.keys(local).length) return;
    const payload = { name: form.name.trim(), amount: Number(form.amount), dueDate: form.dueDate, category: form.category, notes: form.notes.trim() || null, status: form.status };
    setSaving(true);
    try {
      if (editing) await api.put(`/payments/${editing.id}`, payload);
      else await api.post('/payments', payload);
      toast.success(editing ? 'Payment updated' : 'Payment added');
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

  async function markPaid() {
    if (!paying) return;
    setSaving(true);
    try {
      await api.post(`/payments/${paying.id}/mark-paid`, payOptions);
      toast.success(payOptions.recordExpense ? 'Marked as paid and recorded as an expense' : 'Marked as paid');
      setPaying(null);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!deleting) return;
    setSaving(true);
    try {
      await api.delete(`/payments/${deleting.id}`);
      toast.success('Payment deleted');
      setDeleting(null);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const s = data?.summary;
  const rows = data?.data ?? [];
  const reset = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  return (
    <>
      <PageHeader title="Pending Payments" subtitle="Bills and dues. Overdue items are flagged automatically." actions={isAdmin && <Button onClick={openCreate}><Plus className="h-4 w-4" /> Add payment</Button>} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <button className="text-left" onClick={() => reset(setDueState)(dueState === 'UPCOMING' ? '' : 'UPCOMING')} aria-label="Filter upcoming payments">
          <StatCard label="Upcoming" value={formatCurrency(s?.upcoming.amount ?? 0)} icon={CalendarDays} tone="blue" hint={`${s?.upcoming.count ?? 0} payment${s?.upcoming.count === 1 ? '' : 's'}`} />
        </button>
        <button className="text-left" onClick={() => reset(setDueState)(dueState === 'DUE_TODAY' ? '' : 'DUE_TODAY')} aria-label="Filter payments due today">
          <StatCard label="Due today" value={formatCurrency(s?.dueToday.amount ?? 0)} icon={CalendarClock} tone="amber" hint={`${s?.dueToday.count ?? 0} payment${s?.dueToday.count === 1 ? '' : 's'}`} />
        </button>
        <button className="text-left" onClick={() => reset(setDueState)(dueState === 'OVERDUE' ? '' : 'OVERDUE')} aria-label="Filter overdue payments">
          <StatCard label="Overdue" value={formatCurrency(s?.overdue.amount ?? 0)} icon={AlertOctagon} tone="red" hint={`${s?.overdue.count ?? 0} payment${s?.overdue.count === 1 ? '' : 's'}`} />
        </button>
        <StatCard label="Paid" value={formatCurrency(s?.paid.amount ?? 0)} icon={CheckCircle2} tone="green" hint={`${s?.paid.count ?? 0} payment${s?.paid.count === 1 ? '' : 's'}`} />
      </div>

      <Card className="mt-6 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input className="input pl-9" placeholder="Search payments..." value={search} onChange={(e) => reset(setSearch)(e.target.value)} aria-label="Search payments" />
          </div>
          <Select aria-label="Status" value={status} onChange={(e) => reset(setStatus)(e.target.value)} placeholder="All statuses" options={toOptions(PAYMENT_STATUSES)} />
          <Select aria-label="Due" value={dueState} onChange={(e) => reset(setDueState)(e.target.value)} placeholder="Any due date" options={[{ value: 'UPCOMING', label: 'Upcoming' }, { value: 'DUE_TODAY', label: 'Due today' }, { value: 'OVERDUE', label: 'Overdue' }]} />
          <Select aria-label="Category" value={category} onChange={(e) => reset(setCategory)(e.target.value)} placeholder="All categories" options={toOptions(EXPENSE_CATEGORIES)} />
        </div>
      </Card>

      <Card className="mt-4">
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && !data ? (
          <SkeletonRows />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title={filtered ? 'No matching payments' : 'No payments yet'}
            message={filtered ? 'Try changing the filters.' : isAdmin ? 'Add upcoming bills so you never miss a due date.' : 'A family admin can add payments.'}
            action={filtered ? <Button variant="secondary" onClick={() => { setSearch(''); setStatus(''); setDueState(''); setCategory(''); setPage(1); }}>Clear filters</Button> : isAdmin ? <Button onClick={openCreate}><Plus className="h-4 w-4" /> Add payment</Button> : undefined}
          />
        ) : (
          <div className={loading ? 'opacity-60 transition-opacity' : ''}>
            <TableWrap>
              <thead>
                <tr>
                  <th className="th">Payment</th>
                  <th className="th">Category</th>
                  <th className="th">Due date</th>
                  <th className="th">Status</th>
                  <th className="th text-right">Amount</th>
                  {isAdmin && <th className="th text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className={trClass}>
                    <td className="td">
                      <p className="font-medium">{p.name}</p>
                      {p.notes && <p className="text-xs text-slate-500 dark:text-slate-400">{p.notes}</p>}
                    </td>
                    <td className="td"><Badge tone="indigo">{label(p.category)}</Badge></td>
                    <td className="td whitespace-nowrap">
                      {formatDate(p.dueDate)}
                      {p.status !== 'PAID' && <p className={`text-xs ${p.dueState === 'OVERDUE' ? 'text-red-600 dark:text-red-400' : p.dueState === 'DUE_TODAY' ? 'text-amber-600' : 'text-slate-500 dark:text-slate-400'}`}>{relativeDue(p.daysUntilDue)}</p>}
                      {p.status === 'PAID' && p.paidAt && <p className="text-xs text-slate-500 dark:text-slate-400">Paid {formatDate(p.paidAt)}</p>}
                    </td>
                    <td className="td"><StatusBadge status={p.status} /></td>
                    <td className="td text-right font-semibold">{formatCurrency(p.amount)}</td>
                    {isAdmin && (
                      <td className="td whitespace-nowrap text-right">
                        {p.status !== 'PAID' && <Button size="sm" variant="secondary" onClick={() => { setPaying(p); setPayOptions({ recordExpense: true, paymentMethod: 'UPI' }); }}><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Mark paid</Button>}
                        <Button variant="ghost" size="sm" onClick={() => openEdit(p)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleting(p)} aria-label="Delete"><Trash2 className="h-4 w-4 text-red-500" /></Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            {data && <Pagination pagination={data.pagination} onPage={setPage} />}
          </div>
        )}
      </Card>

      <Modal open={open} title={editing ? 'Edit payment' : 'Add payment'} onClose={() => !saving && setOpen(false)} footer={<><Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button><Button type="submit" form="payment-form" loading={saving}>{editing ? 'Save changes' : 'Add payment'}</Button></>}>
        <form id="payment-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field label="Payment name" required error={errors.name} className="sm:col-span-2">
            <input className={`input ${errors.name ? 'input-error' : ''}`} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Credit card bill" autoFocus />
          </Field>
          <Field label="Amount (₹)" required error={errors.amount}>
            <input className={`input ${errors.amount ? 'input-error' : ''}`} type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set('amount', e.target.value)} />
          </Field>
          <Field label="Due date" required error={errors.dueDate}>
            <input className={`input ${errors.dueDate ? 'input-error' : ''}`} type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
          </Field>
          <Field label="Category">
            <Select value={form.category} onChange={(e) => set('category', e.target.value)} options={toOptions(EXPENSE_CATEGORIES)} />
          </Field>
          <Field label="Status" hint="Overdue is set automatically from the due date">
            <Select value={form.status} onChange={(e) => set('status', e.target.value)} options={[{ value: 'PENDING', label: 'Pending' }, { value: 'PAID', label: 'Paid' }]} />
          </Field>
          <Field label="Notes (optional)" error={errors.notes} className="sm:col-span-2">
            <textarea className="input min-h-[72px]" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </form>
      </Modal>

      <Modal open={Boolean(paying)} size="sm" title="Mark as paid" onClose={() => !saving && setPaying(null)} footer={<><Button variant="secondary" onClick={() => setPaying(null)} disabled={saving}>Cancel</Button><Button onClick={markPaid} loading={saving}>Confirm payment</Button></>}>
        {paying && (
          <div className="space-y-4">
            <p className="text-sm">Mark <strong>{paying.name}</strong> ({formatCurrency(paying.amount)}) as paid?</p>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600" checked={payOptions.recordExpense} onChange={(e) => setPayOptions((o) => ({ ...o, recordExpense: e.target.checked }))} />
              <span>Also record this as an expense today<span className="block text-xs text-slate-500 dark:text-slate-400">Keeps your spending totals and budgets accurate.</span></span>
            </label>
            {payOptions.recordExpense && (
              <Field label="Payment method">
                <Select value={payOptions.paymentMethod} onChange={(e) => setPayOptions((o) => ({ ...o, paymentMethod: e.target.value }))} options={toOptions(PAYMENT_METHODS)} />
              </Field>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog open={Boolean(deleting)} title="Delete payment?" message={deleting ? `"${deleting.name}" will be removed permanently.` : ''} loading={saving} onConfirm={remove} onCancel={() => setDeleting(null)} />
    </>
  );
}
