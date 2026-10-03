import { useState, type ReactNode } from 'react';
import { label } from '@shared/constants';
import { BudgetActualChart, CashflowChart, CategoryPie, HorizontalBars, NoChartData, SimpleBars } from '@/components/charts';
import { RangePicker, defaultRange, rangeParams, type RangeValue } from '@/components/RangePicker';
import { Card, CardHeader, ErrorState, PageHeader, Skeleton, StatCard } from '@/components/ui';
import { useFetch } from '@/hooks/useFetch';
import { get } from '@/lib/api';
import { formatCurrency, formatPercent } from '@/lib/format';
import { PiggyBank, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import type { CategoryShare, RecurringItem, SavingsGoal, SeriesPoint } from '@/types';

interface Monthly {
  data: SeriesPoint[];
  totals: { income: number; expenses: number; balance: number; savingsRate: number };
}
interface Categories {
  expenses: CategoryShare[];
  income: CategoryShare[];
  budgetVsActual: { category: string; budget: number; actual: number }[];
}
interface Cashflow {
  data: { label: string; inflow: number; outflow: number; net: number; cumulative: number }[];
}

function ChartCard({ title, subtitle, children, className }: { title: string; subtitle?: string; children: ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader title={title} subtitle={subtitle} />
      <div className="p-5">{children}</div>
    </Card>
  );
}

export default function Analytics() {
  const [value, setValue] = useState<RangeValue>({ ...defaultRange, range: 'last_6_months' });
  const params = rangeParams(value);
  const key = JSON.stringify(params);

  const monthly = useFetch(() => get<Monthly>('/analytics/monthly', params), [key]);
  const categories = useFetch(() => get<Categories>('/analytics/categories', params), [key]);
  const cashflow = useFetch(() => get<Cashflow>('/analytics/cashflow', params), [key]);
  const goals = useFetch(() => get<{ data: SavingsGoal[] }>('/savings-goals'), []);
  const recurring = useFetch(() => get<{ data: RecurringItem[] }>('/recurring'), []);

  const error = monthly.error ?? categories.error ?? cashflow.error;
  const header = <PageHeader title="Analytics" subtitle="Understand spending patterns and plan ahead." actions={<RangePicker value={value} onChange={setValue} />} />;

  if (error) return <>{header}<Card><ErrorState message={error} onRetry={() => { monthly.reload(); categories.reload(); cashflow.reload(); }} /></Card></>;
  if (!monthly.data || !categories.data || !cashflow.data) {
    return (
      <>
        {header}
        <div className="grid gap-6 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Card key={i} className="p-5"><Skeleton className="h-64 w-full" /></Card>)}
        </div>
      </>
    );
  }

  const t = monthly.data.totals;
  const series = monthly.data.data;
  const activeGoals = (goals.data?.data ?? []).map((g) => ({ name: g.name, value: g.progressPercent }));
  const recurringRows = (recurring.data?.data ?? []).filter((r) => r.isActive).sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent).slice(0, 10).map((r) => ({ name: r.name, value: r.monthlyEquivalent }));
  const loading = monthly.loading || categories.loading || cashflow.loading;

  return (
    <div className={loading ? 'opacity-70 transition-opacity' : ''}>
      {header}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Income" value={formatCurrency(t.income)} icon={TrendingUp} tone="green" />
        <StatCard label="Expenses" value={formatCurrency(t.expenses)} icon={TrendingDown} tone="red" />
        <StatCard label="Net savings" value={formatCurrency(t.balance)} icon={Wallet} tone={t.balance < 0 ? 'red' : 'indigo'} />
        <StatCard label="Savings rate" value={formatPercent(t.savingsRate, 1)} icon={PiggyBank} tone="purple" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ChartCard title="Monthly income"><SimpleBars data={series} dataKey="income" name="Income" color="#10b981" /></ChartCard>
        <ChartCard title="Monthly expenses"><SimpleBars data={series} dataKey="expenses" name="Expenses" color="#f43f5e" /></ChartCard>
        <ChartCard title="Monthly savings" subtitle="Income minus expenses (red = overspent)"><SimpleBars data={series} dataKey="savings" name="Savings" color="#6366f1" /></ChartCard>
        <ChartCard title="Expense category distribution"><CategoryPie data={categories.data.expenses} /></ChartCard>
        <ChartCard title="Cash flow" subtitle="Inflow, outflow and cumulative net" className="lg:col-span-2"><CashflowChart data={cashflow.data.data} /></ChartCard>
        <ChartCard title="Budget vs actual" subtitle="Planned category budgets against spending in this period" className="lg:col-span-2"><BudgetActualChart data={categories.data.budgetVsActual} /></ChartCard>
        <ChartCard title="Savings progress" subtitle="Percent of each goal funded">
          {goals.error ? <NoChartData message={goals.error} /> : <HorizontalBars data={activeGoals} valueFormat={(v) => `${Number(v).toFixed(0)}%`} color="#10b981" domain={[0, 100]} />}
        </ChartCard>
        <ChartCard title="Recurring expenses" subtitle="Monthly equivalent of active items">
          {recurring.error ? <NoChartData message={recurring.error} /> : <HorizontalBars data={recurringRows} color="#f59e0b" />}
        </ChartCard>
        <ChartCard title="Income sources" className="lg:col-span-2"><CategoryPie data={categories.data.income} height={240} /></ChartCard>
      </div>
      <p className="mt-6 text-center text-xs text-slate-400">Top expense category in range: {categories.data.expenses[0] ? `${label(categories.data.expenses[0].category)} (${formatCurrency(categories.data.expenses[0].amount)})` : 'none yet'}</p>
    </div>
  );
}
