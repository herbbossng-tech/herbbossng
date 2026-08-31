import { Lock, Search, UserPlus, Users } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { PermissionGate, usePermission } from '@/contexts/PermissionsContext'
import { InviteStaffDialog } from '@/features/staff/components/InviteStaffDialog'
import { useRevokeInvitation, useStaff, useStaffInvitations } from '@/features/staff/hooks'

const statusToneMap: Record<string, 'success' | 'secondary' | 'destructive' | 'warning'> = {
  active: 'success',
  inactive: 'secondary',
  suspended: 'destructive',
  invited: 'warning',
}

export function StaffPage() {
  const canView = usePermission('staff.view')
  if (!canView) {
    return (
      <Card className="p-8">
        <EmptyState icon={Lock} title="Staff is hidden" description="You don't have permission to view the staff directory. Ask a workspace admin for the staff.view permission." />
      </Card>
    )
  }
  return <StaffContent />
}

function StaffContent() {
  const { data: staff, isLoading, isError, refetch } = useStaff()
  const canCreateStaff = usePermission('staff.create')
  const canManageStaff = usePermission('staff.manage')
  const canInvite = canCreateStaff || canManageStaff
  const [search, setSearch] = React.useState('')
  const [roleFilter, setRoleFilter] = React.useState('all')
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [inviteOpen, setInviteOpen] = React.useState(false)

  const allRoleSlugs = React.useMemo(() => {
    const set = new Set<string>()
    for (const s of staff ?? []) for (const slug of s.role_slugs) set.add(slug)
    return Array.from(set).sort()
  }, [staff])

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase()
    return (staff ?? []).filter((s) => {
      if (roleFilter !== 'all' && !s.role_slugs.includes(roleFilter)) return false
      if (statusFilter !== 'all' && s.status !== statusFilter) return false
      if (term) {
        const name = `${s.first_name ?? ''} ${s.last_name ?? ''}`.toLowerCase()
        if (!name.includes(term) && !s.email.toLowerCase().includes(term)) return false
      }
      return true
    })
  }, [staff, search, roleFilter, statusFilter])

  if (isError) return <ErrorState message="Couldn't load staff." onRetry={() => refetch()} />

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Staff</h1>
          <p className="mt-1 text-sm text-muted-foreground">Everyone with access to this workspace.</p>
        </div>
        {canInvite && (
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-4 w-4" />
            Invite Staff
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search name or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {allRoleSlugs.map((slug) => (
              <SelectItem key={slug} value={slug}>
                {slug.replace(/-/g, ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="px-5 py-8">
              <LoadingState label="Loading staff…" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-8">
              <EmptyState
                icon={Users}
                title={(staff?.length ?? 0) === 0 ? 'No staff members yet' : 'No matching staff'}
                description={(staff?.length ?? 0) === 0 ? 'Invite your first teammate to get started.' : 'Try a different search or filter.'}
                action={
                  canInvite && (staff?.length ?? 0) === 0 ? (
                    <Button size="sm" onClick={() => setInviteOpen(true)}>
                      <UserPlus className="h-4 w-4" />
                      Invite Staff
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 font-semibold">Name</th>
                    <th className="px-5 py-3 font-semibold">Email</th>
                    <th className="px-5 py-3 font-semibold">Role(s)</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.user_id} className="border-t border-border/60 hover:bg-accent/40">
                      <td className="px-5 py-3">
                        <Link to={`/staff/${s.user_id}`} className="font-medium hover:text-primary">
                          {[s.first_name, s.last_name].filter(Boolean).join(' ') || s.email}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{s.email}</td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1">
                          {s.role_names.map((name) => (
                            <Badge key={name} variant="outline">
                              {name}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={statusToneMap[s.status] ?? 'secondary'} className="capitalize">
                          {s.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <PermissionGate anyOf={['staff.create', 'staff.manage']}>
        <PendingInvitationsCard />
      </PermissionGate>

      <InviteStaffDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  )
}

function PendingInvitationsCard() {
  const { data: invitations, isLoading } = useStaffInvitations()
  const revoke = useRevokeInvitation()
  const pending = (invitations ?? []).filter((i) => i.status === 'pending')

  if (isLoading || pending.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pending Invitations</CardTitle>
        <CardDescription>No email is sent automatically — share each invite link with the person directly.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {pending.map((invite) => (
          <div key={invite.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
            <div>
              <p className="font-medium">{invite.email}</p>
              <p className="text-xs text-muted-foreground">
                {invite.role?.name ?? 'Role'} · expires {new Date(invite.expires_at).toLocaleDateString()}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => revoke.mutate(invite.id)} disabled={revoke.isPending}>
              Revoke
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
