import { LoginForm } from './login-form';

export default function LoginPage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string; error?: string };
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-dark px-4">
      <div className="w-full max-w-sm rounded-xl2 bg-white p-8 shadow-cardSelected">
        <h1 className="mb-1 text-xl font-semibold text-brand">COD Commerce Admin</h1>
        <p className="mb-6 text-sm text-brand-dark/60">Sign in to manage your stores.</p>
        <LoginForm callbackUrl={searchParams.callbackUrl} error={searchParams.error} />
      </div>
    </main>
  );
}
