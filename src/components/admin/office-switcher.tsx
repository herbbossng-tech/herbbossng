'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { OFFICE_COOKIE } from '@/lib/office-cookie';

type OfficeOption = { id: string; name: string; countryCode: string };

export function OfficeSwitcher({ offices, activeId }: { offices: OfficeOption[]; activeId?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onChange(id: string) {
    document.cookie = `${OFFICE_COOKIE}=${id}; path=/; max-age=${60 * 60 * 24 * 365}`;
    startTransition(() => router.refresh());
  }

  return (
    <select
      className="rounded-lg border border-brand-dark/15 bg-white px-3 py-2 text-sm font-medium text-brand-dark disabled:opacity-60"
      value={activeId}
      disabled={isPending}
      onChange={(e) => onChange(e.target.value)}
    >
      {offices.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name} ({o.countryCode})
        </option>
      ))}
    </select>
  );
}
