import { prisma } from "@/lib/prisma";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { toggleUserActive } from "./actions";

export default async function UsersPage() {
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">Users</h1>
        <LinkButton href="/admin/users/new">+ New user</LinkButton>
      </div>
      <div className="grid gap-3">
        {users.map((user) => (
          <Card key={user.id}>
            <CardBody className="flex items-center justify-between">
              <div>
                <p className="font-medium text-zinc-900">{user.name}</p>
                <p className="text-xs text-zinc-500">
                  {user.email} · {user.role.replace(/_/g, " ")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={user.active ? "green" : "gray"}>{user.active ? "Active" : "Disabled"}</Badge>
                <form action={toggleUserActive.bind(null, user.id, !user.active)}>
                  <button className="text-xs text-zinc-500 hover:underline">{user.active ? "Disable" : "Enable"}</button>
                </form>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
