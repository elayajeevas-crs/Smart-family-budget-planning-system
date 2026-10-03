import { Select } from '@/components/ui';
import type { RangeKey } from '@/types';

export const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_3_months', label: 'Last 3 months' },
  { value: 'last_6_months', label: 'Last 6 months' },
  { value: 'this_year', label: 'This year' },
  { value: 'custom', label: 'Custom range' },
];

export interface RangeValue {
  range: RangeKey;
  from: string;
  to: string;
}

export const defaultRange: RangeValue = { range: 'last_6_months', from: '', to: '' };

/** Query params for the backend; custom ranges are only sent once both dates are set. */
export function rangeParams(v: RangeValue): Record<string, string> {
  if (v.range === 'custom') return v.from && v.to ? { range: 'custom', from: v.from, to: v.to } : { range: 'this_month' };
  return { range: v.range };
}

export function RangePicker({ value, onChange }: { value: RangeValue; onChange: (v: RangeValue) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select aria-label="Date range" className="w-44" value={value.range} onChange={(e) => onChange({ ...value, range: e.target.value as RangeKey })} options={RANGE_OPTIONS} />
      {value.range === 'custom' && (
        <>
          <input type="date" className="input w-40" aria-label="From date" value={value.from} max={value.to || undefined} onChange={(e) => onChange({ ...value, from: e.target.value })} />
          <span className="text-sm text-slate-500">to</span>
          <input type="date" className="input w-40" aria-label="To date" value={value.to} min={value.from || undefined} onChange={(e) => onChange({ ...value, to: e.target.value })} />
        </>
      )}
    </div>
  );
}
