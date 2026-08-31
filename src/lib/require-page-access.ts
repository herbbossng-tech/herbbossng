import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { canAccess } from '@/lib/rbac';

/** Server Component guard: redirects to /admin if the signed-in user's role can't view this resource. */
export async function requirePageAccess(resource: Parameters<typeof canAccess>[1]) {
  const session = await auth();
  if (!session) redirect('/admin/login');
  if (!canAccess(session.user.role, resource)) redirect('/admin');
  return session;
}
