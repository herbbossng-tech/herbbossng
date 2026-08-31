import type { Role } from '@prisma/client';

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  ORDER_MANAGER: 'Order Manager',
  INVENTORY_MANAGER: 'Inventory Manager',
  MARKETING_MANAGER: 'Marketing Manager',
  SUPPORT_STAFF: 'Support Staff',
};

// Coarse resource -> roles-allowed map. SUPER_ADMIN always passes (checked separately).
const ACCESS: Record<string, Role[]> = {
  orders: ['ADMIN', 'ORDER_MANAGER', 'SUPPORT_STAFF'],
  customers: ['ADMIN', 'ORDER_MANAGER', 'SUPPORT_STAFF'],
  inventory: ['ADMIN', 'INVENTORY_MANAGER'],
  products: ['ADMIN', 'INVENTORY_MANAGER', 'MARKETING_MANAGER'],
  offers: ['ADMIN', 'MARKETING_MANAGER'],
  'landing-pages': ['ADMIN', 'MARKETING_MANAGER'],
  tracking: ['ADMIN', 'MARKETING_MANAGER'],
  analytics: ['ADMIN', 'MARKETING_MANAGER'],
  offices: ['ADMIN'],
  settings: ['ADMIN'],
  users: [],
};

export function canAccess(role: Role, resource: keyof typeof ACCESS): boolean {
  if (role === 'SUPER_ADMIN') return true;
  return ACCESS[resource]?.includes(role) ?? false;
}

export class ForbiddenError extends Error {
  constructor(message = 'You do not have permission to perform this action') {
    super(message);
  }
}

export function assertAccess(role: Role, resource: keyof typeof ACCESS) {
  if (!canAccess(role, resource)) throw new ForbiddenError();
}
