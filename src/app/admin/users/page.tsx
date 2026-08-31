import { db } from '@/lib/db';
import { PageHeader, Card, Badge, Input, Label, Select, Button } from '@/components/ui';
import { ROLE_LABELS } from '@/lib/rbac';
import { createUser, setUserActive, changeUserRole } from './actions';
import { RoleSelect } from './role-select';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

export default async function UsersPage() {
  const session = await auth();
  if (!session) redirect('/admin/login');
  if (session.user.role !== 'SUPER_ADMIN') redirect('/admin');
  const users = await db.user.findMany({ orderBy: { createdAt: 'asc' } });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <PageHeader title="Users" description="Super Admins can create staff accounts and assign roles." />
        <Card>
          <form action={createUser} className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div>
              <Label required>Name</Label>
              <Input name="name" required />
            </div>
            <div>
              <Label required>Email</Label>
              <Input type="email" name="email" required />
            </div>
            <div>
              <Label required>Password</Label>
              <Input type="password" name="password" minLength={8} required />
            </div>
            <div>
              <Label required>Role</Label>
              <Select name="role" defaultValue="SUPPORT_STAFF">
                {Object.entries(ROLE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </div>
            <div className="col-span-full">
              <Button type="submit">Add user</Button>
            </div>
          </form>
        </Card>
      </div>

      <Card>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-brand-dark/10 text-xs uppercase text-brand-dark/40">
              <th className="py-2">Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Last login</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-brand-dark/5">
                <td className="py-2">{u.name}</td>
                <td>{u.email}</td>
                <td>
                  <RoleSelect userId={u.id} role={u.role} action={changeUserRole} />
                </td>
                <td>
                  <Badge tone={u.isActive ? 'success' : 'neutral'}>{u.isActive ? 'Active' : 'Disabled'}</Badge>
                </td>
                <td className="text-xs text-brand-dark/40">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}</td>
                <td>
                  <form action={setUserActive.bind(null, u.id, !u.isActive)}>
                    <button className="text-xs text-brand underline">{u.isActive ? 'Disable' : 'Enable'}</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
