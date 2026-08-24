"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { assertSuperAdmin } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth";

const createSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "ORDER_MANAGER", "INVENTORY_MANAGER", "MARKETING_MANAGER", "SUPPORT_STAFF"]),
});

export async function createUser(formData: FormData) {
  const session = await requireSession();
  assertSuperAdmin(session);
  const data = createSchema.parse(Object.fromEntries(formData.entries()));

  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email.toLowerCase(),
      passwordHash: await hashPassword(data.password),
      role: data.role,
    },
  });

  await recordAudit({ userId: session.userId, action: "user.create", resource: "User", resourceId: user.id, after: { email: user.email, role: user.role } });
  revalidatePath("/admin/users");
  redirect("/admin/users");
}

export async function toggleUserActive(userId: string, active: boolean) {
  const session = await requireSession();
  assertSuperAdmin(session);
  await prisma.user.update({ where: { id: userId }, data: { active } });
  await recordAudit({ userId: session.userId, action: "user.toggle_active", resource: "User", resourceId: userId, after: { active } });
  revalidatePath("/admin/users");
}
