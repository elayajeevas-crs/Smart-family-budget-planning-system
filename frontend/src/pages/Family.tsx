import { useState, type FormEvent } from 'react';
import { Crown, Home, Pencil, PiggyBank, Plus, Trash2, TrendingDown, TrendingUp, UserPlus, Users, Wallet } from 'lucide-react';
import { ROLES, label } from '@shared/constants';
import { Alert, Badge, Button, Card, CardHeader, ConfirmDialog, ErrorState, Field, Modal, PageHeader, Select, SkeletonCards, SkeletonRows, StatCard, TableWrap, toOptions, trClass } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useFetch } from '@/hooks/useFetch';
import { api, errorMessage, fieldErrors, get } from '@/lib/api';
import { formatCurrency, formatDate, formatPercent, monthLabel } from '@/lib/format';
import type { FamilyFinancials, FamilyInfo, Member } from '@/types';

function CreateFamily() {
  const { refresh } = useAuth();
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setErrors({ name: 'Family name is required' });
    setBusy(true);
    try {
      await api.post('/family', { name: name.trim(), description: description.trim() || null });
      toast.success('Family created. You are the admin.');
      await refresh();
    } catch (err) {
      const fe = fieldErrors(err);
      setErrors(fe);
      if (!Object.keys(fe).length) toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Set up your family" subtitle="Create a family to start tracking income, expenses and budgets together." />
      <Card className="mx-auto max-w-xl p-6">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40"><Home className="h-5 w-5" /></span>
          <p className="text-sm text-slate-600 dark:text-slate-300">You will become the family <strong>admin</strong>. You can add members afterwards.</p>
        </div>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Family name" required error={errors.name}>
            <input className={`input ${errors.name ? 'input-error' : ''}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. The Sharma Family" autoFocus />
          </Field>
          <Field label="Description (optional)" error={errors.description}>
            <textarea className="input min-h-[80px]" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this family budget for?" />
          </Field>
          <Button type="submit" loading={busy} className="w-full"><Plus className="h-4 w-4" /> Create family</Button>
        </form>
      </Card>
    </>
  );
}

export default function Family() {
  const { user, isAdmin, refresh } = useAuth();
  if (!user?.familyId) return <CreateFamily />;
  return <FamilyView isAdmin={isAdmin} onChanged={refresh} />;
}

function FamilyView({ isAdmin, onChanged }: { isAdmin: boolean; onChanged: () => Promise<unknown> }) {
  const toast = useToast();
  const info = useFetch(() => get<{ family: FamilyInfo | null; financials: FamilyFinancials }>('/family'), []);
  const members = useFetch(() => get<{ data: Member[] }>('/family/members'), []);

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', description: '' });
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ email: '', name: '', password: '', role: 'MEMBER' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);

  const reloadAll = () => {
    info.reload();
    members.reload();
    void onChanged();
  };

  async function saveFamily(e: FormEvent) {
    e.preventDefault();
    if (!editForm.name.trim()) return setErrors({ name: 'Family name is required' });
    setBusy(true);
    try {
      await api.put('/family', { name: editForm.name.trim(), description: editForm.description.trim() || null });
      toast.success('Family updated');
      setEditOpen(false);
      reloadAll();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function addMember(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!/^\S+@\S+\.\S+$/.test(addForm.email)) local.email = 'Enter a valid email address';
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    try {
      await api.post('/family/members', {
        email: addForm.email.trim(),
        role: addForm.role,
        ...(addForm.name.trim() ? { name: addForm.name.trim() } : {}),
        ...(addForm.password ? { password: addForm.password } : {}),
      });
      toast.success('Member added');
      setAddOpen(false);
      setAddForm({ email: '', name: '', password: '', role: 'MEMBER' });
      reloadAll();
    } catch (err) {
      const fe = fieldErrors(err);
      setErrors(fe);
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(m: Member, role: string) {
    try {
      await api.put(`/family/members/${m.id}`, { role });
      toast.success(`${m.name} is now ${label(role).toLowerCase()}`);
      reloadAll();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function removeMember() {
    if (!removing) return;
    setBusy(true);
    try {
      await api.delete(`/family/members/${removing.id}`);
      toast.success('Member removed');
      setRemoving(null);
      reloadAll();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (info.error) return <><PageHeader title="Family" /><Card><ErrorState message={info.error} onRetry={info.reload} /></Card></>;
  if (!info.data) return <><PageHeader title="Family" /><SkeletonCards /></>;

  const { family, financials: f } = info.data;
  if (!family) return <CreateFamily />;

  return (
    <>
      <PageHeader
        title={family.name}
        subtitle={family.description || 'Your family budget workspace'}
        actions={
          isAdmin && (
            <>
              <Button variant="secondary" onClick={() => { setEditForm({ name: family.name, description: family.description ?? '' }); setErrors({}); setEditOpen(true); }}>
                <Pencil className="h-4 w-4" /> Edit family
              </Button>
              <Button onClick={() => { setErrors({}); setAddOpen(true); }}>
                <UserPlus className="h-4 w-4" /> Add member
              </Button>
            </>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Family income" value={formatCurrency(f.income)} icon={TrendingUp} tone="green" hint={monthLabel(f.month, f.year)} />
        <StatCard label="Family expenses" value={formatCurrency(f.expenses)} icon={TrendingDown} tone="red" hint={monthLabel(f.month, f.year)} />
        <StatCard label="Balance" value={formatCurrency(f.balance)} icon={Wallet} tone={f.balance < 0 ? 'red' : 'indigo'} hint={`Savings rate ${formatPercent(f.savingsRate, 1)}`} />
        <StatCard label="Saved in goals" value={formatCurrency(f.goalsSaved)} icon={PiggyBank} tone="purple" hint={`of ${formatCurrency(f.goalsTarget)} target`} />
      </div>

      <Card className="mt-6">
        <CardHeader title="Members" subtitle={`${family.memberCount} member${family.memberCount === 1 ? '' : 's'} · contributions for ${monthLabel(f.month, f.year)}`} />
        {!isAdmin && (
          <div className="px-5 pt-4"><Alert tone="blue">Only family admins can add or remove members and change roles.</Alert></div>
        )}
        {members.error ? (
          <ErrorState message={members.error} onRetry={members.reload} />
        ) : !members.data ? (
          <SkeletonRows rows={3} />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <th className="th">Member</th>
                <th className="th">Role</th>
                <th className="th">Joined</th>
                <th className="th text-right">Income (month)</th>
                <th className="th text-right">Expenses (month)</th>
                {isAdmin && <th className="th text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {members.data.data.map((m) => (
                <tr key={m.id} className={trClass}>
                  <td className="td">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">{m.name.charAt(0).toUpperCase()}</span>
                      <div>
                        <p className="font-medium">{m.name} {m.isYou && <span className="text-xs text-slate-400">(you)</span>}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{m.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="td">
                    {isAdmin && !m.isYou ? (
                      <Select aria-label={`Role for ${m.name}`} className="w-32 py-1" value={m.role} onChange={(e) => changeRole(m, e.target.value)} options={toOptions(ROLES)} />
                    ) : (
                      <Badge tone={m.role === 'ADMIN' ? 'indigo' : 'slate'}>{m.role === 'ADMIN' && <Crown className="mr-1 h-3 w-3" />}{label(m.role)}</Badge>
                    )}
                  </td>
                  <td className="td whitespace-nowrap">{formatDate(m.joinedAt)}</td>
                  <td className="td text-right text-emerald-600 dark:text-emerald-400">{formatCurrency(m.monthIncome)}</td>
                  <td className="td text-right">{formatCurrency(m.monthExpenses)}</td>
                  {isAdmin && (
                    <td className="td text-right">
                      <Button variant="ghost" size="sm" onClick={() => setRemoving(m)} aria-label={`Remove ${m.name}`}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Modal open={editOpen} title="Edit family" onClose={() => setEditOpen(false)} footer={<><Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button><Button type="submit" form="family-form" loading={busy}>Save</Button></>}>
        <form id="family-form" onSubmit={saveFamily} className="space-y-4" noValidate>
          <Field label="Family name" required error={errors.name}>
            <input className={`input ${errors.name ? 'input-error' : ''}`} value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Description" error={errors.description}>
            <textarea className="input min-h-[80px]" value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} />
          </Field>
        </form>
      </Modal>

      <Modal open={addOpen} title="Add family member" onClose={() => setAddOpen(false)} footer={<><Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button><Button type="submit" form="member-form" loading={busy}><Users className="h-4 w-4" /> Add member</Button></>}>
        <form id="member-form" onSubmit={addMember} className="space-y-4" noValidate>
          <Alert tone="blue">If this email already has an account (and no family), they are simply added. Otherwise a new account is created, so also enter their name and an initial password to share with them.</Alert>
          <Field label="Email" required error={errors.email}>
            <input className={`input ${errors.email ? 'input-error' : ''}`} type="email" value={addForm.email} onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name (new accounts)" error={errors.name}>
              <input className={`input ${errors.name ? 'input-error' : ''}`} value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} />
            </Field>
            <Field label="Initial password (new accounts)" error={errors.password} hint="8+ chars, upper, lower, number">
              <input className={`input ${errors.password ? 'input-error' : ''}`} type="password" autoComplete="new-password" value={addForm.password} onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))} />
            </Field>
          </div>
          <Field label="Role">
            <Select value={addForm.role} onChange={(e) => setAddForm((f) => ({ ...f, role: e.target.value }))} options={toOptions(ROLES)} />
          </Field>
        </form>
      </Modal>

      <ConfirmDialog open={Boolean(removing)} title="Remove member?" message={removing ? `${removing.name} will lose access to this family. Their past records stay in the family history.` : ''} confirmLabel="Remove" loading={busy} onConfirm={removeMember} onCancel={() => setRemoving(null)} />
    </>
  );
}
