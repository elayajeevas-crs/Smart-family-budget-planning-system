import type { ReactElement } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { categoryColor, label } from '@shared/constants';
import { formatCompact, formatCurrency } from '@/lib/format';

const AXIS = { fill: 'currentColor', fontSize: 12 };
const tooltipStyle = {
  backgroundColor: 'var(--tooltip-bg)',
  color: 'var(--tooltip-fg)',
  border: '1px solid var(--tooltip-border)',
  borderRadius: 12,
  fontSize: 12,
};
const money = (v: unknown) => formatCurrency(Number(v));
const INCOME = '#10b981';
const EXPENSE = '#f43f5e';
const PRIMARY = '#6366f1';

function Frame({ height = 280, children }: { height?: number; children: ReactElement }) {
  return (
    <div className="w-full text-slate-500 dark:text-slate-400" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

const grid = <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" vertical={false} />;
const yAxis = <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => formatCompact(Number(v))} width={52} />;

export function IncomeExpenseChart({ data }: { data: { label: string; income: number; expenses: number }[] }) {
  return (
    <Frame>
      <BarChart data={data} barGap={4}>
        {grid}
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
        {yAxis}
        <Tooltip formatter={money} contentStyle={tooltipStyle} cursor={{ fill: 'rgba(99,102,241,0.08)' }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="income" name="Income" fill={INCOME} radius={[6, 6, 0, 0]} />
        <Bar dataKey="expenses" name="Expenses" fill={EXPENSE} radius={[6, 6, 0, 0]} />
      </BarChart>
    </Frame>
  );
}

export function CategoryPie({ data, height = 280 }: { data: { category: string; amount: number; percent: number }[]; height?: number }) {
  if (!data.length) return <NoChartData />;
  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row">
      <div className="w-full text-slate-500 sm:w-1/2" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="amount" nameKey="category" innerRadius="55%" outerRadius="85%" paddingAngle={2} stroke="none">
              {data.map((d) => (
                <Cell key={d.category} fill={categoryColor(d.category)} />
              ))}
            </Pie>
            <Tooltip formatter={money} labelFormatter={(l) => label(String(l))} contentStyle={tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="w-full space-y-1.5 text-sm sm:w-1/2">
        {data.slice(0, 8).map((d) => (
          <li key={d.category} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: categoryColor(d.category) }} />
              <span className="truncate">{label(d.category)}</span>
            </span>
            <span className="shrink-0 text-slate-500 dark:text-slate-400">
              {formatCurrency(d.amount)} <span className="text-xs">({d.percent}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TrendArea({ data, dataKey, name, color = PRIMARY }: { data: { label: string }[]; dataKey: string; name: string; color?: string }) {
  return (
    <Frame>
      <AreaChart data={data}>
        <defs>
          <linearGradient id={`g-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.35} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {grid}
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
        {yAxis}
        <Tooltip formatter={money} contentStyle={tooltipStyle} />
        <Area type="monotone" dataKey={dataKey} name={name} stroke={color} strokeWidth={2.5} fill={`url(#g-${dataKey})`} />
      </AreaChart>
    </Frame>
  );
}

export function SimpleBars({
  data,
  dataKey,
  name,
  color = PRIMARY,
  negativeColor = EXPENSE,
}: {
  data: { label: string }[];
  dataKey: string;
  name: string;
  color?: string;
  negativeColor?: string;
}) {
  return (
    <Frame>
      <BarChart data={data}>
        {grid}
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
        {yAxis}
        <Tooltip formatter={money} contentStyle={tooltipStyle} cursor={{ fill: 'rgba(99,102,241,0.08)' }} />
        <Bar dataKey={dataKey} name={name} radius={[6, 6, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={Number((d as Record<string, unknown>)[dataKey]) < 0 ? negativeColor : color} />
          ))}
        </Bar>
      </BarChart>
    </Frame>
  );
}

export function BudgetActualChart({ data }: { data: { category: string; budget: number; actual: number }[] }) {
  if (!data.length) return <NoChartData message="Create a budget to compare it with actual spending." />;
  const rows = data.map((d) => ({ ...d, name: label(d.category) }));
  return (
    <Frame height={Math.max(280, rows.length * 34)}>
      <BarChart data={rows} layout="vertical" margin={{ left: 12 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" horizontal={false} />
        <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => formatCompact(Number(v))} />
        <YAxis type="category" dataKey="name" tick={AXIS} tickLine={false} axisLine={false} width={96} />
        <Tooltip formatter={money} contentStyle={tooltipStyle} cursor={{ fill: 'rgba(99,102,241,0.08)' }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="budget" name="Budget" fill="#a5b4fc" radius={[0, 6, 6, 0]} />
        <Bar dataKey="actual" name="Actual" fill={PRIMARY} radius={[0, 6, 6, 0]} />
      </BarChart>
    </Frame>
  );
}

export function HorizontalBars({
  data,
  valueFormat = money,
  color = PRIMARY,
  domain,
}: {
  data: { name: string; value: number }[];
  valueFormat?: (v: unknown) => string;
  color?: string;
  domain?: [number, number];
}) {
  if (!data.length) return <NoChartData />;
  return (
    <Frame height={Math.max(220, data.length * 40)}>
      <BarChart data={data} layout="vertical" margin={{ left: 12 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" horizontal={false} />
        <XAxis type="number" domain={domain} tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => (domain ? `${v}%` : formatCompact(Number(v)))} />
        <YAxis type="category" dataKey="name" tick={AXIS} tickLine={false} axisLine={false} width={110} />
        <Tooltip formatter={valueFormat} contentStyle={tooltipStyle} cursor={{ fill: 'rgba(99,102,241,0.08)' }} />
        <Bar dataKey="value" name="Value" fill={color} radius={[0, 6, 6, 0]} />
      </BarChart>
    </Frame>
  );
}

export function CashflowChart({ data }: { data: { label: string; inflow: number; outflow: number; cumulative: number }[] }) {
  return (
    <Frame>
      <ComposedChart data={data}>
        {grid}
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
        {yAxis}
        <Tooltip formatter={money} contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="inflow" name="Inflow" fill={INCOME} radius={[6, 6, 0, 0]} />
        <Bar dataKey="outflow" name="Outflow" fill={EXPENSE} radius={[6, 6, 0, 0]} />
        <Line type="monotone" dataKey="cumulative" name="Cumulative net" stroke={PRIMARY} strokeWidth={2.5} dot={{ r: 3 }} />
      </ComposedChart>
    </Frame>
  );
}

export function SimpleLine({ data, dataKey, name }: { data: { label: string }[]; dataKey: string; name: string }) {
  return (
    <Frame>
      <LineChart data={data}>
        {grid}
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
        {yAxis}
        <Tooltip formatter={money} contentStyle={tooltipStyle} />
        <Line type="monotone" dataKey={dataKey} name={name} stroke={PRIMARY} strokeWidth={2.5} dot={{ r: 3 }} />
      </LineChart>
    </Frame>
  );
}

export function NoChartData({ message = 'No data for this period yet.' }: { message?: string }) {
  return <div className="flex h-40 items-center justify-center text-center text-sm text-slate-500 dark:text-slate-400">{message}</div>;
}
