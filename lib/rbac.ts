import type { Role } from "@/app/generated/prisma/enums";
import type { SessionPayload } from "@/lib/auth";

// Sections of the admin app. Each role maps to the sections it may access.
// SUPER_ADMIN implicitly has every section (checked separately) so it is not
// listed below to avoid keeping two copies of the full section list in sync.
export type Section =
  | "dashboard"
  | "orders"
  | "customers"
  | "products"
  | "offers"
  | "inventory"
  | "landing_pages"
  | "analytics"
  | "marketing"
  | "email"
  | "offices"
  | "delivery"
  | "settings"
  | "users"
  | "audit_logs";

const ROLE_SECTIONS: Record<Exclude<Role, "SUPER_ADMIN">, Section[]> = {
  ADMIN: [
    "dashboard",
    "orders",
    "customers",
    "products",
    "offers",
    "inventory",
    "landing_pages",
    "analytics",
    "marketing",
    "email",
    "offices",
    "delivery",
    "settings",
  ],
  ORDER_MANAGER: ["dashboard", "orders", "customers", "analytics"],
  INVENTORY_MANAGER: ["dashboard", "inventory", "products", "analytics"],
  MARKETING_MANAGER: ["dashboard", "landing_pages", "analytics", "marketing", "products", "offers"],
  SUPPORT_STAFF: ["dashboard", "orders", "customers"],
};

const ALL_SECTIONS: Section[] = [
  "dashboard", "orders", "customers", "products", "offers", "inventory", "landing_pages",
  "analytics", "marketing", "email", "offices", "delivery", "settings", "users", "audit_logs",
];

export function canAccess(role: Role, section: Section): boolean {
  if (role === "SUPER_ADMIN") return true;
  return ROLE_SECTIONS[role]?.includes(section) ?? false;
}

export function getAllowedSections(role: Role): Section[] {
  return role === "SUPER_ADMIN" ? ALL_SECTIONS : ROLE_SECTIONS[role] ?? [];
}

export function assertAccess(session: SessionPayload, section: Section) {
  if (!canAccess(session.role, section)) {
    throw new Error("FORBIDDEN");
  }
}

// A small number of destructive/sensitive actions are restricted to SUPER_ADMIN
// regardless of section access (e.g. managing other users, SMTP credentials).
export function assertSuperAdmin(session: SessionPayload) {
  if (session.role !== "SUPER_ADMIN") {
    throw new Error("FORBIDDEN");
  }
}
