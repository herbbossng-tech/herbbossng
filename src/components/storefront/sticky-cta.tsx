'use client';

export function StickyCta({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-brand-dark/10 bg-white/95 p-3 backdrop-blur sm:hidden">
      <button
        onClick={onClick}
        className="w-full rounded-full bg-brand py-3.5 text-center text-sm font-bold uppercase tracking-wide text-white shadow-cardSelected"
      >
        {label}
      </button>
    </div>
  );
}
