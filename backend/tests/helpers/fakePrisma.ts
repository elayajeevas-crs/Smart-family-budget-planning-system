/**
 * A tiny in-memory stand-in for PrismaClient so API tests run without PostgreSQL.
 * It supports only the query features used by the controllers under test.
 */
import { randomUUID } from 'node:crypto';

type Row = Record<string, any>;

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (cond === undefined) return true;
    if (key === 'AND') return (cond as Row[]).every((c) => matches(row, c));
    if (key === 'OR') return (cond as Row[]).some((c) => matches(row, c));
    if (key === 'NOT') return !matches(row, cond);
    // compound unique selectors, e.g. familyId_year_month: { familyId, year, month }
    if (/^[a-zA-Z]+(_[a-zA-Z]+)+$/.test(key) && cond && typeof cond === 'object' && !(cond instanceof Date)) {
      return matches(row, cond);
    }
    const val = row[key];
    if (cond instanceof Date) return val instanceof Date && val.getTime() === cond.getTime();
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
      return Object.entries(cond).every(([op, arg]: [string, any]) => {
        switch (op) {
          case 'gte':
            return val >= arg;
          case 'gt':
            return val > arg;
          case 'lte':
            return val <= arg;
          case 'lt':
            return val < arg;
          case 'equals':
            return val === arg;
          case 'not':
            return val !== arg;
          case 'in':
            return (arg as any[]).includes(val);
          case 'contains':
            return String(val ?? '').toLowerCase().includes(String(arg).toLowerCase());
          default:
            return true;
        }
      });
    }
    return val === cond;
  });
}

function sortRows(rows: Row[], orderBy?: Row | Row[]): Row[] {
  if (!orderBy) return rows;
  const rules = (Array.isArray(orderBy) ? orderBy : [orderBy]).flatMap((o) => Object.entries(o));
  return [...rows].sort((a, b) => {
    for (const [field, dir] of rules) {
      const av = a[field];
      const bv = b[field];
      if (av === bv) continue;
      const cmp = av > bv ? 1 : -1;
      return dir === 'desc' ? -cmp : cmp;
    }
    return 0;
  });
}

const clean = (data: Row): Row => Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));

class Table {
  rows: Row[] = [];
  constructor(
    private defaults: () => Row = () => ({}),
    private afterRead: (row: Row) => Row = (r) => r,
  ) {}

  private out(row: Row | undefined, select?: Row) {
    if (!row) return null;
    if (select) return Object.fromEntries(Object.keys(select).map((k) => [k, row[k]]));
    return this.afterRead({ ...row });
  }

  async create({ data }: { data: Row }) {
    const row = { id: randomUUID(), createdAt: new Date(), updatedAt: new Date(), ...this.defaults(), ...clean(data) };
    this.rows.push(row);
    return this.out(row);
  }
  async createMany({ data }: { data: Row[] }) {
    for (const d of data) await this.create({ data: d });
    return { count: data.length };
  }
  async findUnique({ where, select }: { where: Row; select?: Row }) {
    return this.out(this.rows.find((r) => matches(r, where)), select);
  }
  async findFirst({ where, orderBy, select }: { where?: Row; orderBy?: Row | Row[]; select?: Row } = {}) {
    return this.out(sortRows(this.rows.filter((r) => matches(r, where)), orderBy)[0], select);
  }
  async findMany({ where, orderBy, skip = 0, take, select }: { where?: Row; orderBy?: Row | Row[]; skip?: number; take?: number; select?: Row } = {}) {
    const sorted = sortRows(this.rows.filter((r) => matches(r, where)), orderBy);
    const page = sorted.slice(skip, take === undefined ? undefined : skip + take);
    return page.map((r) => this.out(r, select));
  }
  async count({ where }: { where?: Row } = {}) {
    return this.rows.filter((r) => matches(r, where)).length;
  }
  async update({ where, data }: { where: Row; data: Row }) {
    const row = this.rows.find((r) => matches(r, where));
    if (!row) throw new Error('Record to update not found');
    for (const [k, v] of Object.entries(clean(data))) {
      if (v && typeof v === 'object' && !(v instanceof Date) && 'increment' in v) row[k] = Number(row[k] ?? 0) + Number((v as Row).increment);
      else row[k] = v;
    }
    row.updatedAt = new Date();
    return this.out(row);
  }
  async updateMany({ where, data }: { where?: Row; data: Row }) {
    const hit = this.rows.filter((r) => matches(r, where));
    hit.forEach((r) => Object.assign(r, clean(data), { updatedAt: new Date() }));
    return { count: hit.length };
  }
  async delete({ where }: { where: Row }) {
    const idx = this.rows.findIndex((r) => matches(r, where));
    if (idx === -1) throw new Error('Record to delete not found');
    return this.out(this.rows.splice(idx, 1)[0]);
  }
  async deleteMany({ where }: { where?: Row } = {}) {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !matches(r, where));
    return { count: before - this.rows.length };
  }
}

export function createFakePrisma() {
  const familyMember = new Table();
  const family = new Table();
  const user = new Table(
    () => ({ role: 'MEMBER' }),
    (row) => {
      const m = familyMember.rows.find((x) => x.userId === row.id);
      return { ...row, membership: m ? { ...m, family: family.rows.find((f) => f.id === m.familyId) ?? null } : null };
    },
  );

  const db: Record<string, Table> = {
    user,
    family,
    familyMember,
    income: new Table(() => ({ isRecurring: false, frequency: null, description: null })),
    expense: new Table(() => ({ isRecurring: false, notes: null, paymentMethod: 'UPI' })),
    budget: new Table(),
    budgetCategory: new Table(),
    savingsGoal: new Table(() => ({ currentAmount: 0 })),
    savingsContribution: new Table(),
    recurringExpense: new Table(),
    payment: new Table(() => ({ status: 'PENDING' })),
    notification: new Table(() => ({ isRead: false })),
  };

  const client: any = {
    ...db,
    $transaction: async (arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(client)),
    $disconnect: async () => undefined,
    __reset() {
      Object.values(db).forEach((t) => {
        t.rows = [];
      });
    },
    __db: db,
  };
  return client;
}

export type FakePrisma = ReturnType<typeof createFakePrisma>;
