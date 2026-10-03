import { useState, type ReactNode } from 'react';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { label } from '@shared/constants';
import { BudgetActualChart, CategoryPie, HorizontalBars, SimpleBars } from '@/components/charts';
import { RangePicker, defaultRange, rangeParams, type RangeValue } from '@/components/RangePicker';
import { Button, Card, CardHeader, EmptyState, ErrorState, PageHeader, SkeletonRows, StatusBadge, StatCard, TableWrap, cx, trClass } from '@/components/ui';
import { useFetch } from '@/hooks/useFetch';
import { get } from '@/lib/api';
import { exportCsv, exportPdf } from '@/lib/export';
import { currentMonthInput, formatCurrency, formatDate, formatPercent, formatPlainMoney, monthLabel } from '@/lib/format';
import { PiggyBank, Scale, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import type { BudgetView } from '@/types';

type Tab = 'monthly' | 'expenses' | 'income' | 'budget' | 'savings';
const TABS: { id: Tab; label: string }[] = [
  { id: 'monthly', label: 'Monthly financial' },
  { id: 'expenses', label: 'Expense report' },
  { id: 'income', label: 'Income report' },
  { id: 'budget', label: 'Budget report' },
  { id: 'savings', label: 'Savings report' },
];

interface Share { key: string; amount: number; percent: number }
interface ExpenseRow { id: string; date: string; description: string; category: string; paymentMethod: string; amount: number; memberName: string | null }
interface IncomeRow { id: string; date: string; source: string; category: string; description: string | null; amount: number; memberName: string | null }

interface Monthly {
  period: { month: number; year: number };
  summary: { income: number; expenses: number; balance: number; savingsRate: number; expenseToIncomeRatio: number; previousMonthExpenses: number; previousMonthIncome: number };
  expensesByCategory: Share[];
  incomeByCategory: Share[];
  dailySpending: { day: string; amount: number }[];
  budget: BudgetView | null;
  goals: { id: string; name: string; targetAmount: number; currentAmount: number; progressPercent: number; status: string }[];
  topExpenses: ExpenseRow[];
  incomes: IncomeRow[];
  expenses: ExpenseRow[];
}
interface ExpenseReport { total: number; count: number; average: number; byCategory: Share[]; byMember: Share[]; byPaymentMethod: Share[]; monthly: { label: string; amount: number }[]; rows: ExpenseRow[] }
interface IncomeReport { total: number; count: number; average: number; byCategory: Share[]; byMember: Share[]; monthly: { label: string; amount: number }[]; rows: IncomeRow[] }
interface BudgetReport { period: { month: number; year: number }; budget: BudgetView | null; history: { label: string; budget: number; spent: number; percentUsed: number; status: string | null }[] }
interface SavingsReport { goals: { id: string; name: string; targetAmount: number; currentAmount: number; progressPercent: number; remainingAmount: number; requiredMonthlySaving: number; targetDate: string; status: string }[]; totalContributed: number; monthly: { label: string; amount: number }[]; contributions: { id: string; date: string; goalName: string; userName: string; amount: number; note: string | null }[] }

const toCatShares = (s: Share[]) => s.map((x) => ({ category: x.key, amount: x.amount, percent: x.percent }));

function ExportBar({ onCsv, onPdf, disabled }: { onCsv: () => void; onPdf: () => void; disabled?: boolean }) {
  return (
    <div className="flex gap-2">
      <Button variant="secondary" onClick={onCsv} disabled={disabled}><FileSpreadsheet className="h-4 w-4" /> CSV</Button>
      <Button variant="secondary" onClick={onPdf} disabled={disabled}><FileText className="h-4 w-4" /> PDF</Button>
    </div>
  );
}

function DataTable({ head, rows, empty = 'No data for this period.' }: { head: string[]; rows: (string | number | JSX.Element)[][]; empty?: string }) {
  if (!rows.length) return <EmptyState icon={Download} title={empty} />;
  return (
    <TableWrap>
      <thead>
        <tr>{head.map((h, i) => <th key={h} className={cx('th', i === head.length - 1 && /amount|budget|spent|used|%/i.test(h) ? 'text-right' : '')}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={trClass}>
            {r.map((c, j) => <td key={j} className={cx('td', typeof c === 'string' && c.startsWith('₹') ? 'text-right font-medium' : '')}>{c}</td>)}
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}

function Panel({ state, children }: { state: { loading: boolean; error: string | null; reload: () => void; data: unknown }; children: ReactNode }) {
  if (state.error) return <Card><ErrorState message={state.error} onRetry={state.reload} /></Card>;
  if (!state.data) return <Card><SkeletonRows rows={8} /></Card>;
  return <div className={cx('space-y-6', state.loading && 'opacity-70 transition-opacity')}>{children}</div>;
}

export default function Reports() {
  const [tab, setTab] = useState<Tab>('monthly');
  const [monthInput, setMonthInput] = useState(currentMonthInput());
  const [year, month] = monthInput.split('-').map(Number);
  const [range, setRange] = useState<RangeValue>({ ...defaultRange, range: 'this_month' });
  const rp = rangeParams(range);
  const rKey = JSON.stringify(rp);

  const monthly = useFetch(() => (tab === 'monthly' ? get<Monthly>('/reports/monthly', { month, year }) : Promise.resolve(null)), [tab, month, year]);
  const expenses = useFetch(() => (tab === 'expenses' ? get<ExpenseReport>('/reports/expenses', rp) : Promise.resolve(null)), [tab, rKey]);
  const income = useFetch(() => (tab === 'income' ? get<IncomeReport>('/reports/income', rp) : Promise.resolve(null)), [tab, rKey]);
  const budget = useFetch(() => (tab === 'budget' ? get<BudgetReport>('/reports/budget', { month, year }) : Promise.resolve(null)), [tab, month, year]);
  const savings = useFetch(() => (tab === 'savings' ? get<SavingsReport>('/reports/savings', rp) : Promise.resolve(null)), [tab, rKey]);

  const usesMonth = tab === 'monthly' || tab === 'budget';
  const period = usesMonth ? monthLabel(month, year) : RANGE_LABEL(range);

  function RANGE_LABEL(r: RangeValue): string {
    return r.range === 'custom' ? `${r.from || '?'} to ${r.to || '?'}` : r.range.replace(/_/g, ' ');
  }

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Summaries, charts and tables you can export."
        actions={usesMonth ? <input type="month" className="input w-44" value={monthInput} onChange={(e) => e.target.value && setMonthInput(e.target.value)} aria-label="Select month" /> : <RangePicker value={range} onChange={setRange} />}
      />

      <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800/60" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={cx('whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition', tab === t.id ? 'bg-white shadow-sm dark:bg-slate-900' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100')}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'monthly' && (
        <Panel state={monthly}>
          {monthly.data && (() => {
            const d = monthly.data;
            const s = d.summary;
            return (
              <>
                <div className="flex justify-end">
                  <ExportBar
                    onCsv={() => exportCsv(`monthly-report-${monthInput}.csv`, [
                      { header: 'Date', value: (r: { date: string; type: string; category: string; description: string; amount: number; member: string }) => r.date },
                      { header: 'Type', value: (r) => r.type },
                      { header: 'Category', value: (r) => r.category },
                      { header: 'Description', value: (r) => r.description },
                      { header: 'Amount', value: (r) => r.amount },
                      { header: 'Member', value: (r) => r.member },
                    ], [
                      ...d.incomes.map((r) => ({ date: r.date.slice(0, 10), type: 'Income', category: label(r.category), description: r.source, amount: r.amount, member: r.memberName ?? '' })),
                      ...d.expenses.map((r) => ({ date: r.date.slice(0, 10), type: 'Expense', category: label(r.category), description: r.description, amount: -r.amount, member: r.memberName ?? '' })),
                    ])}
                    onPdf={() => exportPdf(`monthly-report-${monthInput}.pdf`, 'Monthly Financial Report', period, [
                      ['Total income', formatPlainMoney(s.income)], ['Total expenses', formatPlainMoney(s.expenses)], ['Balance', formatPlainMoney(s.balance)], ['Savings rate', formatPercent(s.savingsRate, 1)], ['Expense-to-income ratio', formatPercent(s.expenseToIncomeRatio, 1)],
                    ], [
                      { title: 'Expenses by category', head: ['Category', 'Amount', 'Share'], body: d.expensesByCategory.map((c) => [label(c.key), formatPlainMoney(c.amount), `${c.percent}%`]) },
                      { title: 'Budget status', head: ['Category', 'Budget', 'Spent', 'Used', 'Status'], body: (d.budget?.categories ?? []).map((c) => [label(c.category), formatPlainMoney(c.amount), formatPlainMoney(c.spent), `${c.percentUsed}%`, label(c.status)]) },
                      { title: 'Top expenses', head: ['Date', 'Description', 'Category', 'Amount'], body: d.topExpenses.map((e) => [formatDate(e.date), e.description, label(e.category), formatPlainMoney(e.amount)]) },
                    ])}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <StatCard label="Income" value={formatCurrency(s.income)} icon={TrendingUp} tone="green" hint={`Last month ${formatCurrency(s.previousMonthIncome)}`} />
                  <StatCard label="Expenses" value={formatCurrency(s.expenses)} icon={TrendingDown} tone="red" hint={`Last month ${formatCurrency(s.previousMonthExpenses)}`} />
                  <StatCard label="Balance" value={formatCurrency(s.balance)} icon={Wallet} tone={s.balance < 0 ? 'red' : 'indigo'} />
                  <StatCard label="Savings rate" value={formatPercent(s.savingsRate, 1)} icon={PiggyBank} tone="purple" hint={`Expense-to-income ${formatPercent(s.expenseToIncomeRatio, 1)}`} />
                </div>
                <div className="grid gap-6 lg:grid-cols-2">
                  <Card><CardHeader title="Expenses by category" /><div className="p-5"><CategoryPie data={toCatShares(d.expensesByCategory)} /></div></Card>
                  <Card><CardHeader title="Daily spending" /><div className="p-5"><SimpleBars data={d.dailySpending.map((x) => ({ label: x.day, amount: x.amount }))} dataKey="amount" name="Spent" color="#f43f5e" /></div></Card>
                </div>
                <Card>
                  <CardHeader title="Budget status" subtitle={d.budget ? `Overall ${formatCurrency(d.budget.total.spent)} of ${formatCurrency(d.budget.total.amount)}` : 'No budget set for this month'} />
                  <DataTable head={['Category', 'Budget', 'Spent', 'Remaining', 'Used', 'Status']} rows={(d.budget?.categories ?? []).map((c) => [label(c.category), formatCurrency(c.amount), formatCurrency(c.spent), formatCurrency(c.remaining), `${c.percentUsed.toFixed(0)}%`, <StatusBadge key={c.id} status={c.status} />])} empty="No category budgets" />
                </Card>
                <Card><CardHeader title="Top 10 expenses" /><DataTable head={['Date', 'Description', 'Category', 'Member', 'Amount']} rows={d.topExpenses.map((e) => [formatDate(e.date), e.description, label(e.category), e.memberName ?? '-', formatCurrency(e.amount)])} /></Card>
                <Card><CardHeader title="Savings goals" /><DataTable head={['Goal', 'Saved', 'Target', 'Progress', 'Status']} rows={d.goals.map((g) => [g.name, formatCurrency(g.currentAmount), formatCurrency(g.targetAmount), `${g.progressPercent.toFixed(0)}%`, <StatusBadge key={g.id} status={g.status} />])} empty="No savings goals" /></Card>
              </>
            );
          })()}
        </Panel>
      )}

      {tab === 'expenses' && (
        <Panel state={expenses}>
          {expenses.data && (() => {
            const d = expenses.data;
            return (
              <>
                <div className="flex justify-end">
                  <ExportBar
                    disabled={!d.rows.length}
                    onCsv={() => exportCsv('expense-report.csv', [
                      { header: 'Date', value: (r: ExpenseRow) => r.date.slice(0, 10) }, { header: 'Description', value: (r) => r.description }, { header: 'Category', value: (r) => label(r.category) },
                      { header: 'Payment method', value: (r) => label(r.paymentMethod) }, { header: 'Member', value: (r) => r.memberName ?? '' }, { header: 'Amount', value: (r) => r.amount },
                    ], d.rows)}
                    onPdf={() => exportPdf('expense-report.pdf', 'Expense Report', period, [['Total spent', formatPlainMoney(d.total)], ['Transactions', String(d.count)], ['Average per transaction', formatPlainMoney(d.average)]], [
                      { title: 'By category', head: ['Category', 'Amount', 'Share'], body: d.byCategory.map((c) => [label(c.key), formatPlainMoney(c.amount), `${c.percent}%`]) },
                      { title: 'By member', head: ['Member', 'Amount', 'Share'], body: d.byMember.map((c) => [c.key, formatPlainMoney(c.amount), `${c.percent}%`]) },
                      { title: 'Transactions', head: ['Date', 'Description', 'Category', 'Amount'], body: d.rows.map((r) => [formatDate(r.date), r.description, label(r.category), formatPlainMoney(r.amount)]) },
                    ])}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <StatCard label="Total spent" value={formatCurrency(d.total)} icon={TrendingDown} tone="red" />
                  <StatCard label="Transactions" value={String(d.count)} icon={Scale} tone="indigo" />
                  <StatCard label="Average" value={formatCurrency(d.average)} icon={Wallet} tone="amber" />
                </div>
                <div className="grid gap-6 lg:grid-cols-2">
                  <Card><CardHeader title="By category" /><div className="p-5"><CategoryPie data={toCatShares(d.byCategory)} /></div></Card>
                  <Card><CardHeader title="By family member" /><div className="p-5"><HorizontalBars data={d.byMember.map((m) => ({ name: m.key, value: m.amount }))} /></div></Card>
                </div>
                <Card><CardHeader title="Monthly total" /><div className="p-5"><SimpleBars data={d.monthly} dataKey="amount" name="Spent" color="#f43f5e" /></div></Card>
                <Card><CardHeader title="Transactions" subtitle={d.rows.length >= 2000 ? 'Showing the latest 2,000' : undefined} /><DataTable head={['Date', 'Description', 'Category', 'Payment', 'Member', 'Amount']} rows={d.rows.slice(0, 200).map((r) => [formatDate(r.date), r.description, label(r.category), label(r.paymentMethod), r.memberName ?? '-', formatCurrency(r.amount)])} /></Card>
              </>
            );
          })()}
        </Panel>
      )}

      {tab === 'income' && (
        <Panel state={income}>
          {income.data && (() => {
            const d = income.data;
            return (
              <>
                <div className="flex justify-end">
                  <ExportBar
                    disabled={!d.rows.length}
                    onCsv={() => exportCsv('income-report.csv', [
                      { header: 'Date', value: (r: IncomeRow) => r.date.slice(0, 10) }, { header: 'Source', value: (r) => r.source }, { header: 'Category', value: (r) => label(r.category) },
                      { header: 'Description', value: (r) => r.description ?? '' }, { header: 'Member', value: (r) => r.memberName ?? '' }, { header: 'Amount', value: (r) => r.amount },
                    ], d.rows)}
                    onPdf={() => exportPdf('income-report.pdf', 'Income Report', period, [['Total income', formatPlainMoney(d.total)], ['Records', String(d.count)], ['Average per record', formatPlainMoney(d.average)]], [
                      { title: 'By category', head: ['Category', 'Amount', 'Share'], body: d.byCategory.map((c) => [label(c.key), formatPlainMoney(c.amount), `${c.percent}%`]) },
                      { title: 'By member', head: ['Member', 'Amount', 'Share'], body: d.byMember.map((c) => [c.key, formatPlainMoney(c.amount), `${c.percent}%`]) },
                      { title: 'Records', head: ['Date', 'Source', 'Category', 'Amount'], body: d.rows.map((r) => [formatDate(r.date), r.source, label(r.category), formatPlainMoney(r.amount)]) },
                    ])}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <StatCard label="Total income" value={formatCurrency(d.total)} icon={TrendingUp} tone="green" />
                  <StatCard label="Records" value={String(d.count)} icon={Scale} tone="indigo" />
                  <StatCard label="Average" value={formatCurrency(d.average)} icon={Wallet} tone="amber" />
                </div>
                <div className="grid gap-6 lg:grid-cols-2">
                  <Card><CardHeader title="By category" /><div className="p-5"><CategoryPie data={toCatShares(d.byCategory)} /></div></Card>
                  <Card><CardHeader title="By family member" /><div className="p-5"><HorizontalBars data={d.byMember.map((m) => ({ name: m.key, value: m.amount }))} color="#10b981" /></div></Card>
                </div>
                <Card><CardHeader title="Monthly total" /><div className="p-5"><SimpleBars data={d.monthly} dataKey="amount" name="Income" color="#10b981" /></div></Card>
                <Card><CardHeader title="Records" /><DataTable head={['Date', 'Source', 'Category', 'Member', 'Amount']} rows={d.rows.slice(0, 200).map((r) => [formatDate(r.date), r.source, label(r.category), r.memberName ?? '-', formatCurrency(r.amount)])} /></Card>
              </>
            );
          })()}
        </Panel>
      )}

      {tab === 'budget' && (
        <Panel state={budget}>
          {budget.data && (() => {
            const d = budget.data;
            const b = d.budget;
            return (
              <>
                <div className="flex justify-end">
                  <ExportBar
                    disabled={!b}
                    onCsv={() => exportCsv(`budget-report-${monthInput}.csv`, [
                      { header: 'Category', value: (r: { category: string; amount: number; spent: number; remaining: number; percentUsed: number; status: string }) => label(r.category) },
                      { header: 'Budget', value: (r) => r.amount }, { header: 'Spent', value: (r) => r.spent }, { header: 'Remaining', value: (r) => r.remaining },
                      { header: 'Percent used', value: (r) => r.percentUsed }, { header: 'Status', value: (r) => label(r.status) },
                    ], b ? [{ category: 'OVERALL', ...b.total }, ...b.categories] : [])}
                    onPdf={() => b && exportPdf(`budget-report-${monthInput}.pdf`, 'Budget Report', period, [['Monthly budget', formatPlainMoney(b.total.amount)], ['Spent', formatPlainMoney(b.total.spent)], ['Remaining', formatPlainMoney(b.total.remaining)], ['Used', `${b.total.percentUsed}% (${label(b.total.status)})`]], [
                      { title: 'Category budgets', head: ['Category', 'Budget', 'Spent', 'Used', 'Status'], body: b.categories.map((c) => [label(c.category), formatPlainMoney(c.amount), formatPlainMoney(c.spent), `${c.percentUsed}%`, label(c.status)]) },
                      { title: 'Last 6 months', head: ['Month', 'Budget', 'Spent', 'Used'], body: d.history.map((h) => [h.label, formatPlainMoney(h.budget), formatPlainMoney(h.spent), `${h.percentUsed}%`]) },
                    ])}
                  />
                </div>
                {!b ? (
                  <Card><EmptyState title={`No budget for ${monthLabel(d.period.month, d.period.year)}`} message="Create one on the Budgets page to see this report." /></Card>
                ) : (
                  <>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <StatCard label="Budget" value={formatCurrency(b.total.amount)} icon={Wallet} tone="blue" />
                      <StatCard label="Spent" value={formatCurrency(b.total.spent)} icon={TrendingDown} tone={b.total.status === 'SAFE' ? 'green' : b.total.status === 'WARNING' ? 'amber' : 'red'} hint={<StatusBadge status={b.total.status} />} />
                      <StatCard label="Remaining" value={formatCurrency(b.total.remaining)} icon={Scale} tone={b.total.remaining < 0 ? 'red' : 'green'} hint={`${formatPercent(b.total.percentUsed, 1)} used`} />
                    </div>
                    <Card><CardHeader title="Budget vs actual" /><div className="p-5"><BudgetActualChart data={b.categories.map((c) => ({ category: c.category, budget: c.amount, actual: c.spent }))} /></div></Card>
                    <Card><CardHeader title="Category detail" /><DataTable head={['Category', 'Budget', 'Spent', 'Remaining', 'Used', 'Status']} rows={b.categories.map((c) => [label(c.category), formatCurrency(c.amount), formatCurrency(c.spent), formatCurrency(c.remaining), `${c.percentUsed.toFixed(0)}%`, <StatusBadge key={c.id} status={c.status} />])} empty="No category budgets" /></Card>
                  </>
                )}
                <Card><CardHeader title="Last 6 months" subtitle="Overall budget utilisation" /><DataTable head={['Month', 'Budget', 'Spent', 'Used', 'Status']} rows={d.history.map((h) => [h.label, formatCurrency(h.budget), formatCurrency(h.spent), h.budget ? `${h.percentUsed.toFixed(0)}%` : '-', h.status ? <StatusBadge key={h.label} status={h.status} /> : '-'])} /></Card>
              </>
            );
          })()}
        </Panel>
      )}

      {tab === 'savings' && (
        <Panel state={savings}>
          {savings.data && (() => {
            const d = savings.data;
            return (
              <>
                <div className="flex justify-end">
                  <ExportBar
                    disabled={!d.goals.length}
                    onCsv={() => exportCsv('savings-report.csv', [
                      { header: 'Goal', value: (r: SavingsReport['goals'][number]) => r.name }, { header: 'Saved', value: (r) => r.currentAmount }, { header: 'Target', value: (r) => r.targetAmount },
                      { header: 'Progress %', value: (r) => r.progressPercent }, { header: 'Remaining', value: (r) => r.remainingAmount }, { header: 'Required monthly saving', value: (r) => r.requiredMonthlySaving },
                      { header: 'Target date', value: (r) => r.targetDate.slice(0, 10) }, { header: 'Status', value: (r) => label(r.status) },
                    ], d.goals)}
                    onPdf={() => exportPdf('savings-report.pdf', 'Savings Report', period, [['Contributed in period', formatPlainMoney(d.totalContributed)], ['Goals', String(d.goals.length)]], [
                      { title: 'Goals', head: ['Goal', 'Saved', 'Target', 'Progress', 'Monthly needed', 'Status'], body: d.goals.map((g) => [g.name, formatPlainMoney(g.currentAmount), formatPlainMoney(g.targetAmount), `${g.progressPercent}%`, formatPlainMoney(g.requiredMonthlySaving), label(g.status)]) },
                      { title: 'Contributions', head: ['Date', 'Goal', 'By', 'Amount'], body: d.contributions.map((c) => [formatDate(c.date), c.goalName, c.userName, formatPlainMoney(c.amount)]) },
                    ])}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <StatCard label="Contributed in period" value={formatCurrency(d.totalContributed)} icon={PiggyBank} tone="green" />
                  <StatCard label="Total saved" value={formatCurrency(d.goals.reduce((s, g) => s + g.currentAmount, 0))} icon={Wallet} tone="indigo" />
                  <StatCard label="Goals" value={String(d.goals.length)} icon={Scale} tone="purple" />
                </div>
                <div className="grid gap-6 lg:grid-cols-2">
                  <Card><CardHeader title="Goal progress" /><div className="p-5"><HorizontalBars data={d.goals.map((g) => ({ name: g.name, value: g.progressPercent }))} valueFormat={(v) => `${Number(v).toFixed(0)}%`} color="#10b981" domain={[0, 100]} /></div></Card>
                  <Card><CardHeader title="Contributions per month" /><div className="p-5"><SimpleBars data={d.monthly} dataKey="amount" name="Contributed" color="#10b981" /></div></Card>
                </div>
                <Card><CardHeader title="Goals" /><DataTable head={['Goal', 'Saved', 'Target', 'Progress', 'Monthly needed', 'Status']} rows={d.goals.map((g) => [g.name, formatCurrency(g.currentAmount), formatCurrency(g.targetAmount), `${g.progressPercent.toFixed(0)}%`, formatCurrency(g.requiredMonthlySaving), <StatusBadge key={g.id} status={g.status} />])} empty="No savings goals" /></Card>
                <Card><CardHeader title="Contributions in period" /><DataTable head={['Date', 'Goal', 'By', 'Note', 'Amount']} rows={d.contributions.map((c) => [formatDate(c.date), c.goalName, c.userName, c.note ?? '-', formatCurrency(c.amount)])} empty="No contributions in this period" /></Card>
              </>
            );
          })()}
        </Panel>
      )}
    </>
  );
}
