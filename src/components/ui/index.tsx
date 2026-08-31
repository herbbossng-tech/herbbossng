import Link from 'next/link';

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl2 border border-brand-dark/10 bg-white p-5 shadow-card ${className}`}>{children}</div>;
}

export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <p className="text-xs font-medium uppercase tracking-wide text-brand-dark/50">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-brand-dark">{value}</p>
      {hint && <p className="mt-1 text-xs text-brand-dark/40">{hint}</p>}
    </Card>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'brand';
}) {
  const tones: Record<string, string> = {
    neutral: 'bg-brand-dark/10 text-brand-dark',
    success: 'bg-green-100 text-green-800',
    warning: 'bg-amber-100 text-amber-800',
    danger: 'bg-red-100 text-red-700',
    brand: 'bg-brand/10 text-brand',
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Button({
  children,
  variant = 'primary',
  className = '',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  const variants: Record<string, string> = {
    primary: 'bg-brand text-white hover:bg-brand-light',
    secondary: 'bg-white border border-brand-dark/15 text-brand-dark hover:bg-brand-dark/5',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  };
  return (
    <button
      className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  children,
  variant = 'primary',
}: {
  href: string;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
}) {
  const variants: Record<string, string> = {
    primary: 'bg-brand text-white hover:bg-brand-light',
    secondary: 'bg-white border border-brand-dark/15 text-brand-dark hover:bg-brand-dark/5',
  };
  return (
    <Link href={href} className={`inline-flex items-center rounded-lg px-4 py-2.5 text-sm font-semibold transition ${variants[variant]}`}>
      {children}
    </Link>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl2 border border-dashed border-brand-dark/20 p-12 text-center">
      <p className="font-medium text-brand-dark">{title}</p>
      {description && <p className="max-w-sm text-sm text-brand-dark/50">{description}</p>}
      {action}
    </div>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-brand-dark">{title}</h1>
        {description && <p className="text-sm text-brand-dark/50">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-brand-dark/15 px-3 py-2.5 text-sm outline-none focus:border-brand ${props.className ?? ''}`}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-lg border border-brand-dark/15 px-3 py-2.5 text-sm outline-none focus:border-brand ${props.className ?? ''}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-lg border border-brand-dark/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand ${props.className ?? ''}`}
    />
  );
}

export function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="mb-1 block text-sm font-medium text-brand-dark">
      {children} {required && <span className="text-red-500">*</span>}
    </label>
  );
}
