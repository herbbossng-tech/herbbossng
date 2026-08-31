import type { NextAuthConfig } from 'next-auth';

// Edge-safe config (no bcrypt/Prisma) — used by middleware. The Credentials
// provider itself is added in auth.ts (Node runtime only) to keep bcryptjs
// out of the Edge middleware bundle.
export const authConfig: NextAuthConfig = {
  session: { strategy: 'jwt' },
  pages: { signIn: '/admin/login' },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role;
        token.id = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as { role?: string }).role = token.role as string;
        (session.user as { id?: string }).id = token.id as string;
      }
      return session;
    },
  },
};
