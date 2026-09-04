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
