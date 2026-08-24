import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { createUser } from "../actions";

export default function NewUserPage() {
  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-xl font-semibold text-zinc-900">New user</h1>
      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <form action={createUser} className="space-y-4">
          <div>
            <Label htmlFor="name">Full name</Label>
            <Input id="name" name="name" required />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div>
            <Label htmlFor="password">Temporary password</Label>
            <Input id="password" name="password" type="password" minLength={8} required />
          </div>
          <div>
            <Label htmlFor="role">Role</Label>
            <Select id="role" name="role" defaultValue="SUPPORT_STAFF">
              <option value="SUPER_ADMIN">Super Admin</option>
              <option value="ADMIN">Admin</option>
              <option value="ORDER_MANAGER">Order Manager</option>
              <option value="INVENTORY_MANAGER">Inventory Manager</option>
              <option value="MARKETING_MANAGER">Marketing Manager</option>
              <option value="SUPPORT_STAFF">Support Staff</option>
            </Select>
          </div>
          <Button type="submit" size="lg">
            Create user
          </Button>
        </form>
      </div>
    </div>
  );
}
