import { auth } from '@/lib/auth';
import { listOffices, getActiveOffice } from '@/lib/office-context';
import { OfficeSwitcher } from '@/components/admin/office-switcher';
import { AdminNav } from '@/components/admin/nav';
import { SignOutButton } from '@/components/admin/sign-out-button';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) return <>{children}</>; // login page renders standalone

  const [offices, activeOffice] = await Promise.all([listOffices(), getActiveOffice()]);

  return (
    <div className="flex min-h-screen bg-cream">
      <aside className="hidden w-60 shrink-0 flex-col gap-6 border-r border-brand-dark/10 bg-white p-4 md:flex">
        <div className="px-2">
          <p className="text-lg font-semibold text-brand">COD Commerce</p>
          <p className="text-xs text-brand-dark/50">{session.user.role.replace('_', ' ')}</p>
        </div>
        <AdminNav role={session.user.role} />
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-brand-dark/10 bg-white px-6 py-3">
          <OfficeSwitcher
            offices={offices.map((o) => ({ id: o.id, name: o.name, countryCode: o.countryCode }))}
            activeId={activeOffice?.id}
          />
          <div className="flex items-center gap-4">
            <span className="text-sm text-brand-dark/70">{session.user.name}</span>
            <SignOutButton />
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
