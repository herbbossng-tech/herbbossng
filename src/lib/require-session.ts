import { auth } from '@/lib/auth';
import { assertAccess, type canAccess } from '@/lib/rbac';
import { db } from '@/lib/db';

export async function requireSession(resource?: Parameters<typeof canAccess>[1]) {
  const session = await auth();
  if (!session) throw new Error('Not authenticated');
  if (resource) assertAccess(session.user.role, resource);
  return session;
}

export async function logAudit(params: {
  userId: string;
  action: string;
  resource: string;
  resourceId?: string;
  before?: unknown;
  after?: unknown;
}) {
  await db.auditLog.create({
    data: {
      userId: params.userId,
      action: params.action,
      resource: params.resource,
      resourceId: params.resourceId,
      before: params.before as never,
      after: params.after as never,
    },
  });
}
