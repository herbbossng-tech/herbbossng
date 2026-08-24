import { cn } from "@/lib/utils";

const tones = {
  green: "bg-brand-green-50 text-brand-green-700 border-brand-green-100",
  gold: "bg-amber-50 text-brand-gold-600 border-amber-200",
  gray: "bg-zinc-100 text-zinc-700 border-zinc-200",
  red: "bg-red-50 text-red-700 border-red-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
} as const;

export function Badge({
  tone = "gray",
  className,
  children,
}: {
  tone?: keyof typeof tones;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, keyof typeof tones> = {
  NEW: "blue",
  PENDING_CONFIRMATION: "gold",
  CONFIRMED: "green",
  PROCESSING: "blue",
  PACKED: "blue",
  DISPATCHED: "gold",
  OUT_FOR_DELIVERY: "gold",
  DELIVERED: "green",
  CANCELLED: "red",
  RETURNED: "red",
  FAILED_DELIVERY: "red",
  COD_PENDING: "gold",
  COD_COLLECTED: "green",
  REFUNDED: "red",
  NOT_APPLICABLE: "gray",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={STATUS_TONE[status] ?? "gray"}>{status.replace(/_/g, " ")}</Badge>
  );
}
