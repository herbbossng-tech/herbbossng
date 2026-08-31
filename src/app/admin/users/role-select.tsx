'use client';

import { ROLE_LABELS } from '@/lib/rbac';
import type { Role } from '@prisma/client';

export function RoleSelect({ userId, role, action }: { userId: string; role: Role; action: (userId: string, formData: FormData) => void }) {
  return (
    <form action={(formData) => action(userId, formData)}>
      <select
        name="role"
        defaultValue={role}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded border border-brand-dark/15 px-2 py-1 text-xs"
      >
        {Object.entries(ROLE_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </form>
  );
}
