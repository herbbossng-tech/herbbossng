'use server';

import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logAudit } from '@/lib/require-session';

const userSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().toLowerCase(),
  password: z.string().min(8),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'ORDER_MANAGER', 'INVENTORY_MANAGER', 'MARKETING_MANAGER', 'SUPPORT_STAFF']),
});

async function requireSuperAdmin() {
  const session = await auth();
  if (!session || session.user.role !== 'SUPER_ADMIN') throw new Error('Only Super Admins can manage users');
  return session;
}

export async function createUser(formData: FormData) {
  const session = await requireSuperAdmin();
  const data = userSchema.parse(Object.fromEntries(formData.entries()));
  const passwordHash = await bcrypt.hash(data.password, 10);
  const user = await db.user.create({ data: { name: data.name, email: data.email, role: data.role, passwordHash } });
  await logAudit({ userId: session.user.id, action: 'CREATE', resource: 'User', resourceId: user.id, after: { name: data.name, email: data.email, role: data.role } });
  revalidatePath('/admin/users');
}

export async function setUserActive(userId: string, isActive: boolean) {
  const session = await requireSuperAdmin();
  await db.user.update({ where: { id: userId }, data: { isActive } });
  await logAudit({ userId: session.user.id, action: 'UPDATE', resource: 'User', resourceId: userId, after: { isActive } });
  revalidatePath('/admin/users');
}

export async function changeUserRole(userId: string, formData: FormData) {
  const session = await requireSuperAdmin();
  const role = z
    .enum(['SUPER_ADMIN', 'ADMIN', 'ORDER_MANAGER', 'INVENTORY_MANAGER', 'MARKETING_MANAGER', 'SUPPORT_STAFF'])
    .parse(formData.get('role'));
  await db.user.update({ where: { id: userId }, data: { role } });
  await logAudit({ userId: session.user.id, action: 'UPDATE', resource: 'User', resourceId: userId, after: { role } });
  revalidatePath('/admin/users');
}
