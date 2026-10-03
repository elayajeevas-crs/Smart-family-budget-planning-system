import { useState } from 'react';
import { AlertOctagon, AlertTriangle, Bell, BellOff, CheckCheck, Info } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Pagination, SkeletonRows, cx } from '@/components/ui';
import { useToast } from '@/context/ToastContext';
import { useFetch } from '@/hooks/useFetch';
import { api, errorMessage, get } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import type { NotificationItem, Paged } from '@/types';

type Resp = Paged<NotificationItem> & { unreadCount: number };

const severity = {
  CRITICAL: { icon: AlertOctagon, tone: 'red' as const, cls: 'bg-red-100 text-red-600 dark:bg-red-900/40' },
  WARNING: { icon: AlertTriangle, tone: 'amber' as const, cls: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40' },
  INFO: { icon: Info, tone: 'blue' as const, cls: 'bg-sky-100 text-sky-600 dark:bg-sky-900/40' },
};

export default function Notifications() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data, loading, error, reload } = useFetch(() => get<Resp>('/notifications', { page, limit: 10, unread: onlyUnread ? 'true' : undefined }), [page, onlyUnread]);

  const changed = () => window.dispatchEvent(new Event('sfb:notifications-changed'));

  async function markRead(n: NotificationItem) {
    if (n.isRead) return;
    try {
      await api.put(`/notifications/${n.id}/read`);
      reload();
      changed();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function markAll() {
    setBusy(true);
    try {
      await api.put('/notifications/read-all');
      toast.success('All notifications marked as read');
      reload();
      changed();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const rows = data?.data ?? [];
  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle={data ? `${data.unreadCount} unread` : 'Smart alerts about budgets, payments and goals'}
        actions={
          <>
            <Button variant={onlyUnread ? 'primary' : 'secondary'} onClick={() => { setOnlyUnread((v) => !v); setPage(1); }}>{onlyUnread ? 'Showing unread' : 'Show unread only'}</Button>
            <Button variant="secondary" onClick={markAll} loading={busy} disabled={!data?.unreadCount}><CheckCheck className="h-4 w-4" /> Mark all as read</Button>
          </>
        }
      />
      <Card>
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && !data ? (
          <SkeletonRows rows={5} />
        ) : rows.length === 0 ? (
          <EmptyState icon={onlyUnread ? BellOff : Bell} title={onlyUnread ? 'No unread notifications' : 'No notifications yet'} message="Alerts appear when a budget is nearly used, a payment is due, or a savings goal falls behind." />
        ) : (
          <div className={loading ? 'opacity-60 transition-opacity' : ''}>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((n) => {
                const s = severity[n.severity];
                const Icon = s.icon;
                return (
                  <li key={n.id} className={cx('flex items-start gap-4 px-5 py-4', !n.isRead && 'bg-indigo-50/50 dark:bg-indigo-950/20')}>
                    <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', s.cls)}><Icon className="h-5 w-5" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={cx('text-sm', n.isRead ? 'font-medium' : 'font-semibold')}>{n.title}</p>
                        <Badge tone={s.tone}>{n.severity.toLowerCase()}</Badge>
                        {!n.isRead && <span className="h-2 w-2 rounded-full bg-indigo-600" aria-label="Unread" />}
                      </div>
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{n.message}</p>
                      <p className="mt-1 text-xs text-slate-400">{timeAgo(n.createdAt)}</p>
                    </div>
                    {!n.isRead && <Button variant="ghost" size="sm" onClick={() => markRead(n)}>Mark read</Button>}
                  </li>
                );
              })}
            </ul>
            {data && <Pagination pagination={data.pagination} onPage={setPage} />}
          </div>
        )}
      </Card>
    </>
  );
}
