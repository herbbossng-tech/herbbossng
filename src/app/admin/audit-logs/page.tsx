import { db } from '@/lib/db';
import { PageHeader, Card, Badge, EmptyState } from '@/components/ui';
import { requirePageAccess } from '@/lib/require-page-access';

export default async function AuditLogsPage() {
  await requirePageAccess('settings');
  const logs = await db.auditLog.findMany({
    include: { user: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return (
    <div>
      <PageHeader title="Audit Logs" description="Every admin mutation — who, what, when." />
      {logs.length === 0 ? (
        <EmptyState title="No activity yet" />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-brand-dark/10 text-xs uppercase text-brand-dark/40">
                <th className="p-3">When</th>
                <th>User</th>
                <th>Action</th>
                <th>Resource</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-brand-dark/5">
                  <td className="p-3 text-xs text-brand-dark/50">{log.createdAt.toLocaleString()}</td>
                  <td>{log.user?.name ?? 'System'}</td>
                  <td><Badge tone="brand">{log.action}</Badge></td>
                  <td className="text-brand-dark/70">{log.resource} {log.resourceId ? `· ${log.resourceId}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
