import type { PermissionAction, PermissionModule } from '@/types/database'

export const moduleOrder: PermissionModule[] = [
  'dashboard',
  'orders',
  'products',
  'categories',
  'landing_pages',
  'customers',
  'inventory',
  'finance',
  'analytics',
  'reports',
  'affiliates',
  'marketing',
  'staff',
  'roles_permissions',
  'notifications',
  'audit_logs',
  'brands',
  'workspace',
  'settings',
  'support',
]

export const moduleLabels: Record<PermissionModule, string> = {
  dashboard: 'Dashboard',
  orders: 'Orders',
  products: 'Products',
  categories: 'Categories',
  landing_pages: 'Landing Pages',
  customers: 'Customers',
  inventory: 'Inventory',
  finance: 'Finance',
  analytics: 'Analytics',
  reports: 'Reports',
  affiliates: 'Affiliates',
  marketing: 'Marketing',
  staff: 'Staff',
  roles_permissions: 'Roles & Permissions',
  notifications: 'Notifications',
  audit_logs: 'Audit Logs',
  brands: 'Brands',
  workspace: 'Workspace',
  settings: 'Settings',
  support: 'Support',
}

export const actionOrder: PermissionAction[] = ['view', 'create', 'update', 'delete', 'assign', 'approve', 'export', 'import', 'manage']

export const actionLabels: Record<PermissionAction, string> = {
  view: 'View',
  create: 'Create',
  update: 'Update',
  delete: 'Delete',
  assign: 'Assign',
  approve: 'Approve',
  export: 'Export',
  import: 'Import',
  manage: 'Manage',
}
