import { useMemo, useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2, Wallet, X } from 'lucide-react';
import { EXPENSE_CATEGORIES, categoryColor, label } from '@shared/constants';
import { Alert, Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, ErrorState, Field, Modal, PageHeader, ProgressBar, Select, SkeletonCards, StatusBadge, toOptions } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useFetch } from '@/hooks/useFetch';
import { api, errorMessage, fieldErrors, get } from '@/lib/api';
import { currentMonthInput, formatCurrency, formatPercent, monthLabel } from '@/lib/format';
import type { BudgetView } from '@/types';

interface BudgetResponse {
  month: number;
  year: number;
  budget: BudgetView | null;
  history: { id: string; month: number; year: number; totalAmount: number }[];
}

interface Row {
  category: string;
  amount: string;
}

export default function Budgets() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [monthInput, setMonthInput] = useState(currentMonthInput());
  const [year, month] = monthInput.split('-').map(Number);
  const { data, loading, error, reload } = useFetch(() => get<BudgetResponse>('/budgets', { month, year }), [month, year]);

  const [open, setOpen] = useState(false);
  const [total, setTotal] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [newCategory, setNewCategory] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const budget = data?.budget ?? null;
  const allocated = useMemo(() => rows.reduce((s, r) => s + (Number(r.amount) || 0), 0), [rows]);
  const available = EXPENSE_CATEGORIES.filter((c) => !rows.some((r) => r.category === c));

  function openForm() {
    setErrors({});
    if (budget) {
      setTotal(String(budget.total.amount));
      setRows(budget.categories.map((c) => ({ category: c.category, amount: String(c.amount) })));
    } else {
      setTotal('');
      setRows([]);
    }
    setNewCategory('');
    setOpen(true);
  }

  function addRow() {
    const category = newCategory || available[0];
    if (!category) return;
    setRows((r) => [...r, { category, amount: '' }]);
    setNewCategory('');
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    const totalNum = Number(total);
    if (!total || totalNum <= 0) local.totalAmount = 'Enter a monthly budget greater than 0';
    rows.forEach((r, i) => {
      if (!(Number(r.amount) > 0)) local[`categories.${i}.amount`] = 'Enter an amount';
    });
    if (!local.totalAmount && allocated > totalNum + 0.001) local.totalAmount = 'Category budgets add up to more than the monthly total';
    setErrors(local);
    if (Object.keys(local).length) return;

    const payload = { month, year, totalAmount: totalNum, categories: rows.map((r) => ({ category: r.category, amount: Number(r.amount) })) };
    setSaving(true);
    try {
      if (budget) await api.put(`/budgets/${budget.id}`, payload);
      else await api.post('/budgets', payload);
      toast.success(budget ? 'Budget updated' : 'Budget created');
      setOpen(false);
      reload();
    } catch (err) {
      const fe = fieldErrors(err);
      setErrors(fe);
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!budget) return;
    setSaving(true);
    try {
      await api.delete(`/budgets/${budget.id}`);
      toast.success('Budget deleted');
      setConfirmDelete(false);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Budgets"
        subtitle={`Plan and monitor spending for ${monthLabel(month, year)}`}
        actions={
          <>
            <input type="month" className="input w-44" value={monthInput} onChange={(e) => e.target.value && setMonthInput(e.target.value)} aria-label="Select month" />
            {isAdmin && (
              <Button onClick={openForm}>
                {budget ? <><Pencil className="h-4 w-4" /> Edit budget</> : <><Plus className="h-4 w-4" /> Create budget</>}
              </Button>
            )}
            {isAdmin && budget && (
              <Button variant="secondary" onClick={() => setConfirmDelete(true)}><Trash2 className="h-4 w-4 text-red-500" /> Delete</Button>
            )}
          </>
        }
      />

      {data && data.history.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2" aria-label="Months with budgets">
          {data.history.slice(0, 8).map((h) => {
            const key = `${h.year}-${String(h.month).padStart(2, '0')}`;
            return (
              <button key={h.id} onClick={() => setMonthInput(key)} className={`rounded-full border px-3 py-1 text-xs font-medium transition ${key === monthInput ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                {monthLabel(h.month, h.year)}
              </button>
            );
          })}
        </div>
      )}

      {error ? (
        <Card><ErrorState message={error} onRetry={reload} /></Card>
      ) : loading && !data ? (
        <SkeletonCards count={3} />
      ) : !budget ? (
        <Card>
          <EmptyState
            icon={Wallet}
            title={`No budget for ${monthLabel(month, year)}`}
            message={isAdmin ? 'Set a monthly limit and optional category budgets to track how much of it you have used.' : 'A family admin needs to create the budget for this month.'}
            action={isAdmin ? <Button onClick={openForm}><Plus className="h-4 w-4" /> Create budget</Button> : undefined}
          />
        </Card>
      ) : (
        <div className={loading ? 'opacity-70 transition-opacity' : ''}>
          <Card className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Overall monthly budget</p>
                <p className="mt-1 text-3xl font-bold">{formatCurrency(budget.total.amount)}</p>
              </div>
              <StatusBadge status={budget.total.status} />
            </div>
            <ProgressBar className="mt-5 h-3" percent={budget.total.percentUsed} status={budget.total.status} />
            <div className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
              <div><p className="text-slate-500 dark:text-slate-400">Spent</p><p className="font-semibold">{formatCurrency(budget.total.spent)}</p></div>
              <div><p className="text-slate-500 dark:text-slate-400">Remaining</p><p className={`font-semibold ${budget.total.remaining < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{formatCurrency(budget.total.remaining)}</p></div>
              <div><p className="text-slate-500 dark:text-slate-400">Used</p><p className="font-semibold">{formatPercent(budget.total.percentUsed, 1)}</p></div>
              <div><p className="text-slate-500 dark:text-slate-400">Not allocated to a category</p><p className="font-semibold">{formatCurrency(budget.unallocated)}</p></div>
            </div>
            {budget.total.status === 'EXCEEDED' && <div className="mt-4"><Alert>You have gone over the monthly budget by {formatCurrency(Math.abs(budget.total.remaining))}.</Alert></div>}
          </Card>

          <Card className="mt-6">
            <CardHeader title="Category budgets" subtitle="Safe under 70% · Warning 70-90% · Critical 90-100% · Exceeded at 100%" />
            {budget.categories.length === 0 ? (
              <EmptyState title="No category budgets" message={isAdmin ? 'Edit the budget to add limits such as Food or Transport.' : 'No category limits were set.'} />
            ) : (
              <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
                {budget.categories.map((c) => (
                  <div key={c.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 font-medium">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: categoryColor(c.category) }} />
                        {label(c.category)}
                      </span>
                      <StatusBadge status={c.status} />
                    </div>
                    <ProgressBar className="mt-3" percent={c.percentUsed} status={c.status} />
                    <div className="mt-3 flex items-end justify-between text-sm">
                      <div>
                        <p className="font-semibold">{formatCurrency(c.spent)} <span className="font-normal text-slate-500 dark:text-slate-400">of {formatCurrency(c.amount)}</span></p>
                        <p className={`text-xs ${c.remaining < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
                          {c.remaining < 0 ? `${formatCurrency(Math.abs(c.remaining))} over budget` : `${formatCurrency(c.remaining)} left`}
                        </p>
                      </div>
                      <Badge tone="slate">{formatPercent(c.percentUsed, 0)}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      <Modal
        open={open}
        size="lg"
        title={`${budget ? 'Edit' : 'Create'} budget - ${monthLabel(month, year)}`}
        onClose={() => !saving && setOpen(false)}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button><Button type="submit" form="budget-form" loading={saving}>{budget ? 'Save changes' : 'Create budget'}</Button></>}
      >
        <form id="budget-form" onSubmit={save} className="space-y-5" noValidate>
          <Field label="Overall monthly budget (₹)" required error={errors.totalAmount}>
            <input className={`input ${errors.totalAmount ? 'input-error' : ''}`} type="number" min="0" step="0.01" value={total} onChange={(e) => setTotal(e.target.value)} autoFocus />
          </Field>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="label mb-0">Category budgets</p>
              <p className={`text-xs ${allocated > Number(total) ? 'text-red-600' : 'text-slate-500 dark:text-slate-400'}`}>
                Allocated {formatCurrency(allocated)}{Number(total) > 0 ? ` of ${formatCurrency(Number(total))}` : ''}
              </p>
            </div>
            <div className="space-y-2">
              {rows.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-700">No category budgets yet. Add Food, Transport and more below.</p>}
              {rows.map((r, i) => (
                <div key={r.category} className="flex items-start gap-2">
                  <div className="flex h-[38px] w-40 shrink-0 items-center gap-2 rounded-xl bg-slate-100 px-3 text-sm font-medium dark:bg-slate-800">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: categoryColor(r.category) }} />
                    {label(r.category)}
                  </div>
                  <div className="flex-1">
                    <input className={`input ${errors[`categories.${i}.amount`] ? 'input-error' : ''}`} type="number" min="0" step="0.01" placeholder="Amount (₹)" aria-label={`${label(r.category)} budget`} value={r.amount} onChange={(e) => setRows((list) => list.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                    {errors[`categories.${i}.amount`] && <p className="mt-1 text-xs text-red-600">{errors[`categories.${i}.amount`]}</p>}
                  </div>
                  <Button variant="ghost" size="sm" className="mt-1" onClick={() => setRows((list) => list.filter((_, j) => j !== i))} aria-label={`Remove ${label(r.category)}`}><X className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
            {available.length > 0 && (
              <div className="mt-3 flex gap-2">
                <Select aria-label="Category to add" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Choose a category" options={toOptions(available)} />
                <Button variant="secondary" onClick={addRow}><Plus className="h-4 w-4" /> Add</Button>
              </div>
            )}
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={confirmDelete} title="Delete this budget?" message={`The budget for ${monthLabel(month, year)} will be removed. Your income and expenses are not affected.`} loading={saving} onConfirm={remove} onCancel={() => setConfirmDelete(false)} />
    </>
  );
}
