import { useMemo, useState, type FormEvent } from 'react';
import { ArrowDownAZ, ArrowUpAZ, Pencil, Plus, Receipt, Repeat, Search, Trash2, X } from 'lucide-react';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, FREQUENCIES, PAYMENT_METHODS, label } from '@shared/constants';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Modal, PageHeader, Pagination, Select, SkeletonRows, TableWrap, toOptions, trClass } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import { useDebounced, useFetch } from '@/hooks/useFetch';
import { api, errorMessage, fieldErrors, get } from '@/lib/api';
import { formatCurrency, formatDate, todayInput, toInputDate } from '@/lib/format';
import type { Member, Paged } from '@/types';

type Kind = 'income' | 'expense';
interface Rec {
  id: string;
  amount: number;
  category: string;
  date: string;
  isRecurring: boolean;
  memberId: string | null;
  memberName: string | null;
  canEdit: boolean;
  source?: string;
  description?: string | null;
  paymentMethod?: string;
  notes?: string | null;
  frequency?: string | null;
}

interface FormState {
  amount: string;
  title: string; // source (income) or description (expense)
  category: string;
  date: string;
  description: string; // income description
  notes: string; // expense notes
  paymentMethod: string;
  isRecurring: boolean;
  frequency: string;
  memberId: string;
}

const emptyForm = (kind: Kind): FormState => ({
  amount: '',
  title: '',
  category: kind === 'income' ? 'SALARY' : 'FOOD',
  date: todayInput(),
  description: '',
  notes: '',
  paymentMethod: 'UPI',
  isRecurring: false,
  frequency: 'MONTHLY',
  memberId: '',
});

const CONFIG = {
  income: {
    endpoint: '/income',
    title: 'Income',
    subtitle: 'Track every source of family income.',
    singular: 'income',
    categories: INCOME_CATEGORIES,
    titleLabel: 'Source',
    addLabel: 'Add income',
  },
  expense: {
    endpoint: '/expenses',
    title: 'Expenses',
    subtitle: 'Record daily spending and see where the money goes.',
    singular: 'expense',
    categories: EXPENSE_CATEGORIES,
    titleLabel: 'Description',
    addLabel: 'Add expense',
  },
} as const;

export default function RecordManager({ kind }: { kind: Kind }) {
  const cfg = CONFIG[kind];
  const { isAdmin } = useAuth();
  const { settings } = useSettings();
  const toast = useToast();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [memberId, setMemberId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const debouncedSearch = useDebounced(search);

  const members = useFetch(() => get<{ data: Member[] }>('/family/members'), []);
  const list = useFetch(
    () =>
      get<Paged<Rec> & { summary: { totalAmount: number } }>(cfg.endpoint, {
        page,
        limit: settings.pageSize,
        search: debouncedSearch,
        category,
        memberId,
        paymentMethod: kind === 'expense' ? paymentMethod : undefined,
        dateFrom,
        dateTo,
        sortBy,
        sortOrder,
      }),
    [kind, page, settings.pageSize, debouncedSearch, category, memberId, paymentMethod, dateFrom, dateTo, sortBy, sortOrder],
  );

  const [editing, setEditing] = useState<Rec | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm(kind));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Rec | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const hasFilters = Boolean(search || category || memberId || paymentMethod || dateFrom || dateTo);
  const resetPage = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  const memberOptions = useMemo(() => (members.data?.data ?? []).map((m) => ({ value: m.id, label: m.name })), [members.data]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm(kind));
    setErrors({});
    setFormOpen(true);
  }

  function openEdit(r: Rec) {
    setEditing(r);
    setForm({
      amount: String(r.amount),
      title: kind === 'income' ? (r.source ?? '') : (r.description ?? ''),
      category: r.category,
      date: toInputDate(r.date),
      description: kind === 'income' ? (r.description ?? '') : '',
      notes: kind === 'expense' ? (r.notes ?? '') : '',
      paymentMethod: r.paymentMethod ?? 'UPI',
      isRecurring: r.isRecurring,
      frequency: r.frequency ?? 'MONTHLY',
      memberId: r.memberId ?? '',
    });
    setErrors({});
    setFormOpen(true);
  }

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    const amount = Number(form.amount);
    if (!form.amount || !Number.isFinite(amount) || amount <= 0) e.amount = 'Enter an amount greater than 0';
    if (!form.title.trim()) e[kind === 'income' ? 'source' : 'description'] = `${cfg.titleLabel} is required`;
    if (!form.date) e.date = 'Choose a date';
    return e;
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const local = validate();
    setErrors(local);
    if (Object.keys(local).length) return;

    const common = {
      amount: Number(form.amount),
      category: form.category,
      date: form.date,
      isRecurring: form.isRecurring,
      ...(isAdmin && form.memberId ? { memberId: form.memberId } : {}),
    };
    const payload =
      kind === 'income'
        ? { ...common, source: form.title.trim(), description: form.description.trim() || null, frequency: form.isRecurring ? form.frequency : null }
        : { ...common, description: form.title.trim(), paymentMethod: form.paymentMethod, notes: form.notes.trim() || null };

    setSaving(true);
    try {
      if (editing) await api.put(`${cfg.endpoint}/${editing.id}`, payload);
      else await api.post(cfg.endpoint, payload);
      toast.success(editing ? `${cfg.title} updated` : `${cfg.title} added`);
      setFormOpen(false);
      list.reload();
      members.reload();
    } catch (err) {
      const fe = fieldErrors(err);
      setErrors(fe);
      if (!Object.keys(fe).length) toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api.delete(`${cfg.endpoint}/${deleting.id}`);
      toast.success(`${cfg.title} deleted`);
      setDeleting(null);
      if (list.data && list.data.data.length === 1 && page > 1) setPage(page - 1);
      else list.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDeleteBusy(false);
    }
  }

  function clearFilters() {
    setSearch('');
    setCategory('');
    setMemberId('');
    setPaymentMethod('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  }

  const rows = list.data?.data ?? [];

  return (
    <>
      <PageHeader
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> {cfg.addLabel}
          </Button>
        }
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input className="input pl-9" placeholder={`Search ${cfg.singular}...`} value={search} onChange={(e) => resetPage(setSearch)(e.target.value)} aria-label="Search" />
          </div>
          <Select aria-label="Category" value={category} onChange={(e) => resetPage(setCategory)(e.target.value)} placeholder="All categories" options={toOptions(cfg.categories)} />
          <Select aria-label="Family member" value={memberId} onChange={(e) => resetPage(setMemberId)(e.target.value)} placeholder="All members" options={memberOptions} />
          {kind === 'expense' ? (
            <Select aria-label="Payment method" value={paymentMethod} onChange={(e) => resetPage(setPaymentMethod)(e.target.value)} placeholder="All payment methods" options={toOptions(PAYMENT_METHODS)} />
          ) : (
            <div className="hidden lg:block" />
          )}
          <input type="date" className="input" value={dateFrom} max={dateTo || undefined} onChange={(e) => resetPage(setDateFrom)(e.target.value)} aria-label="From date" />
          <input type="date" className="input" value={dateTo} min={dateFrom || undefined} onChange={(e) => resetPage(setDateTo)(e.target.value)} aria-label="To date" />
          <div className="flex gap-2">
            <Select
              aria-label="Sort by"
              value={sortBy}
              onChange={(e) => resetPage(setSortBy)(e.target.value)}
              options={[
                { value: 'date', label: 'Sort: Date' },
                { value: 'amount', label: 'Sort: Amount' },
                { value: 'category', label: 'Sort: Category' },
              ]}
            />
            <Button variant="secondary" onClick={() => setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))} aria-label={`Sort ${sortOrder === 'asc' ? 'descending' : 'ascending'}`}>
              {sortOrder === 'asc' ? <ArrowUpAZ className="h-4 w-4" /> : <ArrowDownAZ className="h-4 w-4" />}
            </Button>
          </div>
          {hasFilters && (
            <Button variant="ghost" onClick={clearFilters}>
              <X className="h-4 w-4" /> Clear filters
            </Button>
          )}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 text-sm dark:border-slate-800">
          <span className="text-slate-500 dark:text-slate-400">{list.data ? `${list.data.pagination.total} record${list.data.pagination.total === 1 ? '' : 's'}` : 'Loading...'}</span>
          <span className="font-semibold">Total: {formatCurrency(list.data?.summary.totalAmount ?? 0)}</span>
        </div>

        {list.error ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : list.loading && !list.data ? (
          <SkeletonRows />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={hasFilters ? 'No matching records' : `No ${cfg.singular} recorded yet`}
            message={hasFilters ? 'Try changing or clearing the filters.' : `Add your first ${cfg.singular} record to get started.`}
            action={hasFilters ? <Button variant="secondary" onClick={clearFilters}>Clear filters</Button> : <Button onClick={openCreate}><Plus className="h-4 w-4" /> {cfg.addLabel}</Button>}
          />
        ) : (
          <div className={list.loading ? 'opacity-60 transition-opacity' : ''}>
            <TableWrap>
              <thead>
                <tr>
                  <th className="th">Date</th>
                  <th className="th">{cfg.titleLabel}</th>
                  <th className="th">Category</th>
                  {kind === 'expense' && <th className="th">Payment</th>}
                  <th className="th">Member</th>
                  <th className="th text-right">Amount</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={trClass}>
                    <td className="td whitespace-nowrap">{formatDate(r.date)}</td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{kind === 'income' ? r.source : r.description}</span>
                        {r.isRecurring && (
                          <span title="Recurring">
                            <Repeat className="h-3.5 w-3.5 text-indigo-500" />
                          </span>
                        )}
                      </div>
                      {kind === 'income' && r.description && <p className="text-xs text-slate-500 dark:text-slate-400">{r.description}</p>}
                      {kind === 'expense' && r.notes && <p className="text-xs text-slate-500 dark:text-slate-400">{r.notes}</p>}
                    </td>
                    <td className="td"><Badge tone="indigo">{label(r.category)}</Badge></td>
                    {kind === 'expense' && <td className="td whitespace-nowrap">{label(r.paymentMethod)}</td>}
                    <td className="td whitespace-nowrap">{r.memberName ?? '-'}</td>
                    <td className={`td whitespace-nowrap text-right font-semibold ${kind === 'income' ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{formatCurrency(r.amount)}</td>
                    <td className="td whitespace-nowrap text-right">
                      {r.canEdit ? (
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(r)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleting(r)} aria-label="Delete"><Trash2 className="h-4 w-4 text-red-500" /></Button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">View only</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            {list.data && <Pagination pagination={list.data.pagination} onPage={setPage} />}
          </div>
        )}
      </Card>

      <Modal
        open={formOpen}
        title={editing ? `Edit ${cfg.singular}` : cfg.addLabel}
        onClose={() => !saving && setFormOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" form="record-form" loading={saving}>{editing ? 'Save changes' : cfg.addLabel}</Button>
          </>
        }
      >
        <form id="record-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field label="Amount (₹)" required error={errors.amount}>
            <input className={`input ${errors.amount ? 'input-error' : ''}`} type="number" inputMode="decimal" step="0.01" min="0" value={form.amount} onChange={(e) => set('amount', e.target.value)} autoFocus />
          </Field>
          <Field label="Date" required error={errors.date}>
            <input className={`input ${errors.date ? 'input-error' : ''}`} type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
          </Field>
          <Field label={cfg.titleLabel} required error={errors.source ?? errors.description} className="sm:col-span-2">
            <input className={`input ${errors.source || errors.description ? 'input-error' : ''}`} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder={kind === 'income' ? 'e.g. Monthly salary' : 'e.g. Weekly groceries'} />
          </Field>
          <Field label="Category" required error={errors.category}>
            <Select value={form.category} onChange={(e) => set('category', e.target.value)} options={toOptions(cfg.categories)} />
          </Field>
          {kind === 'expense' ? (
            <Field label="Payment method" error={errors.paymentMethod}>
              <Select value={form.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value)} options={toOptions(PAYMENT_METHODS)} />
            </Field>
          ) : (
            <Field label="Type" error={errors.isRecurring}>
              <Select value={form.isRecurring ? 'recurring' : 'one-time'} onChange={(e) => set('isRecurring', e.target.value === 'recurring')} options={[{ value: 'one-time', label: 'One-time' }, { value: 'recurring', label: 'Recurring' }]} />
            </Field>
          )}
          {kind === 'income' && form.isRecurring && (
            <Field label="Frequency" required error={errors.frequency}>
              <Select value={form.frequency} onChange={(e) => set('frequency', e.target.value)} options={toOptions(FREQUENCIES)} />
            </Field>
          )}
          {isAdmin && (
            <Field label="Family member" hint="Defaults to you">
              <Select value={form.memberId} onChange={(e) => set('memberId', e.target.value)} placeholder="Me" options={memberOptions} />
            </Field>
          )}
          {kind === 'expense' && (
            <label className="flex items-center gap-2 self-end pb-2 text-sm sm:col-span-1">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-indigo-600" checked={form.isRecurring} onChange={(e) => set('isRecurring', e.target.checked)} />
              This is a recurring expense
            </label>
          )}
          <Field label={kind === 'income' ? 'Description (optional)' : 'Notes (optional)'} error={errors.description ?? errors.notes} className="sm:col-span-2">
            <textarea className="input min-h-[72px]" value={kind === 'income' ? form.description : form.notes} onChange={(e) => set(kind === 'income' ? 'description' : 'notes', e.target.value)} />
          </Field>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Delete ${cfg.singular}?`}
        message={deleting ? `This will permanently remove ${formatCurrency(deleting.amount)} (${kind === 'income' ? deleting.source : deleting.description}). This cannot be undone.` : ''}
        loading={deleteBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
