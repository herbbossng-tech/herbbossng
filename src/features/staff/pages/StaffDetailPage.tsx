import { ArrowLeft, Lock, Plus, ShieldOff, Trash2, UserX } from 'lucide-react'
import * as React from 'react'
import { Link, useParams } from 'react-router-dom'

import { AlertDialog, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { usePermission } from '@/contexts/PermissionsContext'
import { useBrandsList } from '@/features/brands/hooks'
import { useRoles } from '@/features/roles/hooks'
import { useAssignRole, useRemoveRole, useStaff, useStaffRoles, useUpdateStaffStatus } from '@/features/staff/hooks'

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')
}

export function StaffDetailPage() {
  const canView = usePermission('staff.view')
  if (!canView) {
    return (
      <Card className="p-8">
        <EmptyState icon={Lock} title="Staff is hidden" description="You don't have permission to view staff details." />
      </Card>
    )
  }
  return <StaffDetailContent />
}

function StaffDetailContent() {
  const { id } = useParams<{ id: string }>()
  const { data: staff, isLoading, isError, refetch } = useStaff()
  const { data: userRoles } = useStaffRoles(id)
  const { data: roles } = useRoles()
  const { data: brands } = useBrandsList()
  const canManage = usePermission('staff.manage')
  const updateStatus = useUpdateStaffStatus()
  const assignRole = useAssignRole()
  const removeRole = useRemoveRole()

  const [addRoleId, setAddRoleId] = React.useState('')
  const [addRoleBrandId, setAddRoleBrandId] = React.useState('all')
  const [confirmTarget, setConfirmTarget] = React.useState<'inactive' | 'suspended' | null>(null)
  const [confirmError, setConfirmError] = React.useState<string | null>(null)

  const member = staff?.find((s) => s.user_id === id)

  if (isLoading) return <LoadingState label="Loading staff member…" />
  if (isError) return <ErrorState message="Couldn't load staff." onRetry={() => refetch()} />
  if (!member) return <ErrorState title="Staff member not found" message="They may no longer be part of this workspace." />

  const displayName = [member.first_name, member.last_name].filter(Boolean).join(' ') || member.email
  const assignedRoleIds = new Set((userRoles ?? []).map((ur) => ur.role_id))
  const availableRoles = (roles ?? []).filter((r) => !assignedRoleIds.has(r.id))

  async function handleConfirmStatusChange() {
    if (!confirmTarget) return
    setConfirmError(null)
    try {
      await updateStatus.mutateAsync({ userId: member!.user_id, status: confirmTarget })
      setConfirmTarget(null)
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : 'Failed to update status')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="sm" asChild className="w-fit">
        <Link to="/staff">
          <ArrowLeft className="h-4 w-4" />
          Staff
        </Link>
      </Button>

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14">
            <AvatarFallback className="text-lg">{initials(displayName)}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{displayName}</h1>
            <p className="text-sm text-muted-foreground">{member.email}</p>
          </div>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            {member.status === 'active' ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setConfirmTarget('suspended')} disabled={updateStatus.isPending}>
                  <ShieldOff className="h-4 w-4" />
                  Suspend
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setConfirmTarget('inactive')}
                  disabled={updateStatus.isPending}
                >
                  <UserX className="h-4 w-4" />
                  Deactivate
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateStatus.mutate({ userId: member.user_id, status: 'active' })}
                disabled={updateStatus.isPending}
              >
                <UserX className="h-4 w-4" />
                Activate
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
          <Badge variant={member.status === 'active' ? 'success' : member.status === 'suspended' ? 'warning' : 'secondary'} className="mt-2 capitalize">
            {member.status}
          </Badge>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Phone</p>
          <p className="mt-2 text-sm font-medium">{member.phone ?? '—'}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Department</p>
          <p className="mt-2 text-sm font-medium">{member.department ?? '—'}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Joined</p>
          <p className="mt-2 text-sm font-medium">{new Date(member.created_at).toLocaleDateString()}</p>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Roles &amp; Brand Access</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {(userRoles ?? []).map((ur) => (
            <div key={ur.id} className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="font-medium">{ur.role.name}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {ur.role.is_system_role && <Badge variant="secondary">System</Badge>}
                  <Badge variant="outline">{ur.brand?.name ?? 'All brands'}</Badge>
                </div>
              </div>
              {canManage && (userRoles?.length ?? 0) > 1 && (
                <Button variant="ghost" size="sm" onClick={() => removeRole.mutate(ur.id)} disabled={removeRole.isPending}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          ))}
          {(userRoles?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">No roles assigned.</p>}

          {canManage && availableRoles.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Select value={addRoleId} onValueChange={setAddRoleId}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Add another role…" />
                </SelectTrigger>
                <SelectContent>
                  {availableRoles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={addRoleBrandId} onValueChange={setAddRoleBrandId}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All brands</SelectItem>
                  {brands?.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                disabled={!addRoleId || assignRole.isPending}
                onClick={() => {
                  if (addRoleId) {
                    assignRole.mutate({ userId: member!.user_id, roleId: addRoleId, brandId: addRoleBrandId === 'all' ? null : addRoleBrandId })
                    setAddRoleId('')
                    setAddRoleBrandId('all')
                  }
                }}
              >
                <Plus className="h-4 w-4" />
                Add Role
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmTarget !== null} onOpenChange={(open) => !open && setConfirmTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmTarget === 'suspended' ? 'Suspend' : 'Deactivate'} {displayName}?</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2 px-6 text-sm text-muted-foreground">
            <p>
              {confirmTarget === 'suspended'
                ? 'They will lose access to GCOS until reactivated. Use this for a temporary hold — historical records are unaffected.'
                : 'They will lose access to GCOS immediately. Their historical order/audit records remain intact and unaffected.'}
            </p>
            {confirmError && <p className="text-destructive">{confirmError}</p>}
          </div>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setConfirmTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmStatusChange} disabled={updateStatus.isPending}>
              {updateStatus.isPending ? 'Saving…' : confirmTarget === 'suspended' ? 'Suspend' : 'Deactivate'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
