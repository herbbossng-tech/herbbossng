export interface StaffMember {
  user_id: string
  email: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  avatar_url: string | null
  department: string | null
  status: 'active' | 'inactive' | 'suspended' | 'invited'
  last_login_at: string | null
  created_at: string
  role_names: string[]
  role_slugs: string[]
  /** Assignment capacity/availability (0038) — defaults applied server-side when no explicit settings row exists. */
  is_available_for_assignment: boolean
  auto_assignment_enabled: boolean
  max_active_orders: number | null
  active_order_count: number
}

export interface StaffFilters {
  search?: string
  roleSlug?: string | 'all'
  status?: string | 'all'
}

export interface StaffInvitation {
  id: string
  workspace_id: string
  brand_id: string | null
  email: string
  role_id: string
  status: 'pending' | 'accepted' | 'expired' | 'revoked'
  expires_at: string
  accepted_at: string | null
  invited_by: string | null
  created_at: string
  role: { name: string } | null
}
