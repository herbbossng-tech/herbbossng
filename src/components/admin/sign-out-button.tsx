'use client';

import { signOut } from 'next-auth/react';

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/admin/login' })}
      className="text-sm text-brand-dark/60 hover:text-brand"
    >
      Sign out
    </button>
  );
}
