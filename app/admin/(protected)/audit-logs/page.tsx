import { prisma } from "@/lib/prisma";
import { Card, CardBody } from "@/components/ui/Card";

export default async function AuditLogsPage() {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: true },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-zinc-900">Audit Logs</h1>
      <Card>
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Resource</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-zinc-50">
                    <td className="px-4 py-2 text-xs text-zinc-500">{log.createdAt.toLocaleString()}</td>
                    <td className="px-4 py-2">{log.user?.name ?? "System"}</td>
                    <td className="px-4 py-2 font-mono text-xs">{log.action}</td>
                    <td className="px-4 py-2 text-xs text-zinc-500">
                      {log.resource}
                      {log.resourceId ? ` #${log.resourceId.slice(0, 8)}` : ""}
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                      No activity yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
