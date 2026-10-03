import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CalendarClock,
  CheckCircle2,
  Info,
  Lightbulb,
  PiggyBank,
  Receipt,
  Scale,
  TrendingDown,
  TrendingUp,
  Wallet,
  XCircle,
} from 'lucide-react';
import { label } from '@shared/constants';
import { BudgetActualChart, CategoryPie, IncomeExpenseChart, NoChartData, SimpleBars, TrendArea } from '@/components/charts';
import { Badge, Card, CardHeader, EmptyState, ErrorState, PageHeader, ProgressBar, SkeletonCards, Skeleton, StatCard, StatusBadge, cx } from '@/components/ui';
import { useFetch } from '@/hooks/useFetch';
import { get } from '@/lib/api';
import { currentMonthInput, formatCurrency, formatDate, formatPercent, monthLabel, relativeDue, timeAgo } from '@/lib/format';
import type { DashboardData, Insight } from '@/types';

const insightStyle: Record<Insight['severity'], { icon: typeof Info; cls: string }> = {
  SUCCESS: { icon: CheckCircle2, cls: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400' },
  INFO: { icon: Info, cls: 'text-sky-600 bg-sky-50 dark:bg-sky-950/40 dark:text-sky-400' },
  WARNING: { icon: AlertTriangle, cls: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400' },
  CRITICAL: { icon: XCircle, cls: 'text-red-600 bg-red-50 dark:bg-red-950/40 dark:text-red-400' },
};

export default function Dashboard() {
  const [monthInput, setMonthInput] = useState(currentMonthInput());
  const [year, month] = monthInput.split('-').map(Number);
  const { data, loading, error, reload } = useFetch(() => get<DashboardData>('/analytics/dashboard', { month, year }), [month, year]);

  const header = (
    <PageHeader
      title="Dashboard"
      subtitle={`Financial overview for ${monthLabel(month, year)}`}
      actions={
        <input type="month" className="input w-44" value={monthInput} max={currentMonthInput()} onChange={(e) => e.target.value && setMonthInput(e.target.value)} aria-label="Select month" />
      }
    />
  );

  if (error) return <>{header}<Card><ErrorState message={error} onRetry={reload} /></Card></>;
  if (loading && !data) {
    return (
      <>
        {header}
        <SkeletonCards count={8} />
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card className="p-5"><Skeleton className="h-72 w-full" /></Card>
          <Card className="p-5"><Skeleton className="h-72 w-full" /></Card>
        </div>
      </>
    );
  }
  if (!data) return null;
  const { summary: s, charts } = data;
  const noData = s.totalIncome === 0 && s.totalExpenses === 0;

  return (
    <div className={cx(loading && 'opacity-70 transition-opacity')}>
      {header}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Income" value={formatCurrency(s.totalIncome)} icon={TrendingUp} tone="green" hint="Earned this month" />
        <StatCard label="Total Expenses" value={formatCurrency(s.totalExpenses)} icon={TrendingDown} tone="red" hint={`${formatPercent(s.expenseToIncomeRatio, 1)} of income`} />
        <StatCard
          label="Remaining Balance"
          value={formatCurrency(s.remainingBalance)}
          icon={Wallet}
          tone={s.remainingBalance < 0 ? 'red' : 'indigo'}
          hint={s.remainingBalance < 0 ? 'You have overspent this month' : 'Income minus expenses'}
        />
        <StatCard
          label="Total Savings"
          value={formatCurrency(s.totalSavings)}
          icon={PiggyBank}
          tone="purple"
          hint={`Savings rate ${formatPercent(s.savingsRate, 1)} · ${formatCurrency(s.goalsSaved)} in goals`}
        />
        <StatCard label="Monthly Budget" value={s.hasBudget ? formatCurrency(s.monthlyBudget) : 'Not set'} icon={Banknote} tone="blue" hint={s.hasBudget ? 'Planned spending limit' : <Link to="/budgets" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">Create a budget</Link>} />
        <StatCard label="Budget Used" value={formatCurrency(s.budgetUsed)} icon={Scale} tone={s.budgetStatus === 'EXCEEDED' || s.budgetStatus === 'CRITICAL' ? 'red' : s.budgetStatus === 'WARNING' ? 'amber' : 'green'} hint={s.hasBudget ? `${formatPercent(s.budgetUsedPercent, 0)} of budget` : 'Spent this month'}>
          {s.hasBudget && <ProgressBar className="mt-3" percent={s.budgetUsedPercent} status={s.budgetStatus ?? undefined} />}
        </StatCard>
        <StatCard label="Budget Remaining" value={s.hasBudget ? formatCurrency(s.budgetRemaining) : '-'} icon={ArrowDownRight} tone={s.budgetRemaining < 0 ? 'red' : 'green'} hint={s.budgetStatus ? <StatusBadge status={s.budgetStatus} /> : 'No budget for this month'} />
        <StatCard
          label="Pending Payments"
          value={formatCurrency(s.pendingPayments.amount)}
          icon={CalendarClock}
          tone={s.pendingPayments.overdueCount ? 'red' : 'amber'}
          hint={
            <Link to="/payments" className="hover:underline">
              {s.pendingPayments.count} unpaid{s.pendingPayments.overdueCount ? ` · ${s.pendingPayments.overdueCount} overdue` : ''}
            </Link>
          }
        />
      </div>

      {noData && (
        <Card className="mt-6">
          <EmptyState icon={Receipt} title="No transactions in this month" message="Add income and expenses to see charts and insights for this period." action={<div className="flex gap-2"><Link to="/income" className="btn-primary">Add income</Link><Link to="/expenses" className="btn-secondary">Add expense</Link></div>} />
        </Card>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Income vs Expenses" subtitle="Last 6 months" />
          <div className="p-5"><IncomeExpenseChart data={charts.incomeVsExpenses} /></div>
        </Card>
        <Card>
          <CardHeader title="Expense by Category" subtitle={monthLabel(month, year)} />
          <div className="p-5"><CategoryPie data={charts.expenseByCategory} /></div>
        </Card>
        <Card>
          <CardHeader title="Monthly Spending Trend" subtitle="Last 12 months" />
          <div className="p-5"><TrendArea data={charts.spendingTrend} dataKey="expenses" name="Expenses" color="#f43f5e" /></div>
        </Card>
        <Card>
          <CardHeader title="Savings Trend" subtitle="Income minus expenses, last 12 months" />
          <div className="p-5"><SimpleBars data={charts.savingsTrend} dataKey="savings" name="Savings" color="#10b981" /></div>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Budget vs Actual" subtitle="Category budgets against spending" action={<Link to="/budgets" className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">Manage budget</Link>} />
          <div className="p-5"><BudgetActualChart data={charts.budgetVsActual} /></div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Recent Transactions" action={<Link to="/transactions" className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">View all</Link>} />
          {data.recentTransactions.length === 0 ? (
            <EmptyState title="No transactions yet" message="Your latest income and expenses will appear here." />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.recentTransactions.map((t) => (
                <li key={`${t.type}-${t.id}`} className="flex items-center gap-3 px-5 py-3">
                  <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', t.type === 'INCOME' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40' : 'bg-rose-100 text-rose-600 dark:bg-rose-900/40')}>
                    {t.type === 'INCOME' ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.description}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{label(t.category)} · {formatDate(t.date)}{t.memberName ? ` · ${t.memberName}` : ''}</p>
                  </div>
                  <span className={cx('text-sm font-semibold', t.type === 'INCOME' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-slate-100')}>
                    {t.type === 'INCOME' ? '+' : '-'}{formatCurrency(t.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Upcoming Payments" action={<Link to="/payments" className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">All</Link>} />
          {data.upcomingPayments.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="All caught up" message="No unpaid bills right now." />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.upcomingPayments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className={cx('text-xs', p.dueState === 'OVERDUE' ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400')}>{relativeDue(p.daysUntilDue)} · {formatDate(p.dueDate)}</p>
                  </div>
                  <span className="text-sm font-semibold">{formatCurrency(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Smart Financial Insights" subtitle="Calculated from your real data" />
          <ul className="space-y-2 p-5">
            {data.insights.length === 0 && <NoChartData message="Insights will appear as you add data." />}
            {data.insights.map((i) => {
              const { icon: Icon, cls } = insightStyle[i.severity];
              return (
                <li key={i.id} className={cx('flex items-start gap-3 rounded-xl p-3 text-sm', cls)}>
                  {i.type === 'opportunity' ? <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" /> : <Icon className="mt-0.5 h-4 w-4 shrink-0" />}
                  <span className="text-slate-800 dark:text-slate-200">{i.message}</span>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Budget Alerts" subtitle="Unread notifications" action={<Link to="/notifications" className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">View all</Link>} />
          {data.alerts.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="No new alerts" message="You're all caught up." />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.alerts.map((a) => (
                <li key={a.id} className="flex items-start gap-3 px-5 py-3">
                  <AlertTriangle className={cx('mt-0.5 h-4 w-4 shrink-0', a.severity === 'CRITICAL' ? 'text-red-500' : a.severity === 'WARNING' ? 'text-amber-500' : 'text-sky-500')} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{a.title}</p>
                      <Badge tone={a.severity === 'CRITICAL' ? 'red' : a.severity === 'WARNING' ? 'amber' : 'blue'}>{a.severity.toLowerCase()}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{a.message}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">{timeAgo(a.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
