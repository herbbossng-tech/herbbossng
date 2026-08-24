import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveOffices, getCurrentAdminOffice } from "@/lib/office-context";
import { AdminShell } from "@/components/admin/AdminShell";
import { getAllowedSections } from "@/lib/rbac";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/admin/login");

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || !user.active) redirect("/admin/login");

  const [offices, currentOffice] = await Promise.all([getActiveOffices(), getCurrentAdminOffice()]);

  return (
    <AdminShell
      userName={user.name}
      userRole={user.role}
      allowedSections={getAllowedSections(user.role)}
      offices={offices.map((o) => ({ id: o.id, name: o.name, countryCode: o.countryCode }))}
      currentOfficeId={currentOffice?.id ?? null}
    >
      {children}
    </AdminShell>
  );
}
