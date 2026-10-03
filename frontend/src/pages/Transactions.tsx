import { useMemo, useState } from 'react';
import { ArrowDownAZ, ArrowDownRight, ArrowUpAZ, ArrowUpRight, Download, ListOrdered, Repeat, Search, X } from 'lucide-react';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, PAYMENT_METHODS, label } from '@shared/constants';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Pagination, Select, SkeletonRows, StatusBadge, TableWrap, toOptions, trClass } from '@/components/ui';
import { useSettings } from '@/context/SettingsContext';
import { useDebounced, useFetch } from '@/hooks/useFetch';
import { get } from '@/lib/api';
import { exportCsv } from '@/lib/export';
import { formatCurrency, formatDate } from '@/lib/format';
import type { Member, Paged, TransactionItem } from '@/types';

type Resp = Paged<TransactionItem> & { summary: { income: number; expenses: number } };

const ALL_CATEGORIES = Array.from(new Set([...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES]));

export default function Transactions() {
  const { settings } = useSettings();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [category, setCategory] = useState('');
  const [memberId, setMemberId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const debounced = useDebounced(search);

  const members = useFetch(() => get<{ data: Member[] }>('/family/members'), []);
  const { data, loading, error, reload } = useFetch(
    () => get<Resp>('/transactions', { page, limit: settings.pageSize, search: debounced, type, category, memberId, paymentMethod, dateFrom, dateTo, sortBy, sortOrder }),
    [page, settings.pageSize, debounced, type, category, memberId, paymentMethod, dateFrom, dateTo, sortBy, sortOrder],
  );

  const memberOptions = useMemo(() => (members.data?.data ?? []).map((m) => ({ value: m.id, label: m.name })), [members.data]);
  const filtered = Boolean(search || type || category || memberId || paymentMethod || dateFrom || dateTo);
  const reset = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };
  const rows = data?.data ?? [];

  function clear() {
    setSearch('');
    setType('');
    setCategory('');
    setMemberId('');
    setPaymentMethod('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  }

  async function exportAll() {
    const all = await get<Resp>('/transactions', { page: 1, limit: 100, search: debounced, type, category, memberId, paymentMethod, dateFrom, dateTo, sortBy, sortOrder });
    exportCsv('transactions.csv', [
      { header: 'Date', value: (t: TransactionItem) => t.date.slice(0, 10) },
      { header: 'Type', value: (t) => label(t.type) },
      { header: 'Category', value: (t) => label(t.category) },
      { header: 'Description', value: (t) => t.description },
      { header: 'Amount', value: (t) => (t.type === 'EXPENSE' ? -t.amount : t.amount) },
      { header: 'Member', value: (t) => t.memberName ?? '' },
      { header: 'Payment method', value: (t) => label(t.paymentMethod) },
      { header: 'Status', value: (t) => label(t.status) },
    ], all.data);
  }

  return (
    <>
      <PageHeader
        title="Transactions"
        subtitle="Every income and expense in one place."
        actions={<Button variant="secondary" onClick={exportAll} disabled={!rows.length}><Download className="h-4 w-4" /> Export CSV (first 100)</Button>}
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input className="input pl-9" placeholder="Search transactions..." value={search} onChange={(e) => reset(setSearch)(e.target.value)} aria-label="Search" />
          </div>
          <Select aria-label="Type" value={type} onChange={(e) => reset(setType)(e.target.value)} placeholder="Income & expenses" options={[{ value: 'INCOME', label: 'Income only' }, { value: 'EXPENSE', label: 'Expenses only' }]} />
          <Select aria-label="Category" value={category} onChange={(e) => reset(setCategory)(e.target.value)} placeholder="All categories" options={toOptions(ALL_CATEGORIES)} />
          <Select aria-label="Member" value={memberId} onChange={(e) => reset(setMemberId)(e.target.value)} placeholder="All members" options={memberOptions} />
          <Select aria-label="Payment method" value={paymentMethod} onChange={(e) => reset(setPaymentMethod)(e.target.value)} placeholder="All payment methods" options={toOptions(PAYMENT_METHODS)} />
          <input type="date" className="input" value={dateFrom} max={dateTo || undefined} onChange={(e) => reset(setDateFrom)(e.target.value)} aria-label="From date" />
          <input type="date" className="input" value={dateTo} min={dateFrom || undefined} onChange={(e) => reset(setDateTo)(e.target.value)} aria-label="To date" />
          <div className="flex gap-2">
            <Select aria-label="Sort by" value={sortBy} onChange={(e) => reset(setSortBy)(e.target.value)} options={[{ value: 'date', label: 'Sort: Date' }, { value: 'amount', label: 'Sort: Amount' }, { value: 'category', label: 'Sort: Category' }, { value: 'type', label: 'Sort: Type' }]} />
            <Button variant="secondary" onClick={() => setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))} aria-label="Toggle sort direction">
              {sortOrder === 'asc' ? <ArrowUpAZ className="h-4 w-4" /> : <ArrowDownAZ className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        {filtered && <Button variant="ghost" size="sm" className="mt-3" onClick={clear}><X className="h-4 w-4" /> Clear filters</Button>}
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3 text-sm dark:border-slate-800">
          <span className="text-slate-500 dark:text-slate-400">{data ? `${data.pagination.total} transaction${data.pagination.total === 1 ? '' : 's'}` : 'Loading...'}</span>
          <span className="flex gap-4 font-medium">
            <span className="text-emerald-600 dark:text-emerald-400">Income {formatCurrency(data?.summary.income ?? 0)}</span>
            <span className="text-rose-600 dark:text-rose-400">Expenses {formatCurrency(data?.summary.expenses ?? 0)}</span>
          </span>
        </div>
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && !data ? (
          <SkeletonRows />
        ) : rows.length === 0 ? (
          <EmptyState icon={ListOrdered} title={filtered ? 'No matching transactions' : 'No transactions yet'} message={filtered ? 'Try changing or clearing the filters.' : 'Income and expenses you add will show up here.'} action={filtered ? <Button variant="secondary" onClick={clear}>Clear filters</Button> : undefined} />
        ) : (
          <div className={loading ? 'opacity-60 transition-opacity' : ''}>
            <TableWrap>
              <thead>
                <tr>
                  <th className="th">Date</th>
                  <th className="th">Type</th>
                  <th className="th">Category</th>
                  <th className="th">Description</th>
                  <th className="th text-right">Amount</th>
                  <th className="th">Member</th>
                  <th className="th">Payment</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={`${t.type}-${t.id}`} className={trClass}>
                    <td className="td whitespace-nowrap">{formatDate(t.date)}</td>
                    <td className="td">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${t.type === 'INCOME' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {t.type === 'INCOME' ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                        {label(t.type)}
                      </span>
                    </td>
                    <td className="td"><Badge tone="indigo">{label(t.category)}</Badge></td>
                    <td className="td"><span className="flex items-center gap-1.5">{t.description}{t.isRecurring && <span title="Recurring"><Repeat className="h-3.5 w-3.5 text-indigo-500" /></span>}</span></td>
                    <td className={`td whitespace-nowrap text-right font-semibold ${t.type === 'INCOME' ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{t.type === 'INCOME' ? '+' : '-'}{formatCurrency(t.amount)}</td>
                    <td className="td whitespace-nowrap">{t.memberName ?? '-'}</td>
                    <td className="td whitespace-nowrap">{label(t.paymentMethod)}</td>
                    <td className="td"><StatusBadge status={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            {data && <Pagination pagination={data.pagination} onPage={setPage} />}
          </div>
        )}
      </Card>
    </>
  );
}
