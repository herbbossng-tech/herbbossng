import { ArrowLeft, Lock, Trash2 } from 'lucide-react'
import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { AlertDialog, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { usePermission } from '@/contexts/PermissionsContext'
import { actionLabels, actionOrder, moduleLabels, moduleOrder } from '@/features/roles/moduleMeta'
import { useArchiveRole, usePermissionsCatalogue, useRole, useRolePermissionSlugs, useSetRolePermission, useUpdateRole } from '@/features/roles/hooks'

export function RoleDetailPage() {
  const canView = usePermission('roles_permissions.view')

  if (!canView) {
    return (
      <Card className="p-8">
        <EmptyState icon={Lock} title="Roles is hidden" description="You don't have permission to view roles in this workspace." />
      </Card>
    )
  }

  return <RoleDetailContent />
}

function RoleDetailContent() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const canManage = usePermission('roles_permissions.manage')

  const { data: role, isLoading, isError, refetch } = useRole(id)
  const { data: catalogue } = usePermissionsCatalogue()
  const { data: grantedSlugs } = useRolePermissionSlugs(id)
  const setRolePermission = useSetRolePermission(id ?? '')
  const updateRole = useUpdateRole(id ?? '')
  const archiveRole = useArchiveRole()

  const [description, setDescription] = React.useState('')
  const [descriptionDirty, setDescriptionDirty] = React.useState(false)
  const [confirmArchive, setConfirmArchive] = React.useState(false)

  React.useEffect(() => {
    if (role && !descriptionDirty) setDescription(role.description ?? '')
  }, [role, descriptionDirty])

  if (isLoading) return <LoadingState label="Loading role…" />
  if (isError || !role) return <ErrorState message="Couldn't load this role." onRetry={() => refetch()} />

  const editable = canManage && !role.is_system_role
  const permissionsByModule = new Map<string, { id: string; slug: string; action: string }[]>()
  for (const p of catalogue ?? []) {
    if (!permissionsByModule.has(p.module)) permissionsByModule.set(p.module, [])
    permissionsByModule.get(p.module)!.push({ id: p.id, slug: p.slug, action: p.action })
  }

  async function handleSaveDescription() {
    await updateRole.mutateAsync({ description: description || null })
    setDescriptionDirty(false)
  }

  async function handleArchive() {
    await archiveRole.mutateAsync(role!.id)
    setConfirmArchive(false)
    navigate('/roles')
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/roles">
            <ArrowLeft className="h-4 w-4" />
            Roles
          </Link>
        </Button>
      </div>

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight">{role.name}</h1>
            <Badge variant={role.is_system_role ? 'secondary' : 'outline'}>{role.is_system_role ? 'System' : 'Custom'}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {role.is_system_role
              ? 'System role templates cannot be renamed, archived, or have their permissions edited — duplicate this role to create a customizable copy.'
              : 'Custom role for this workspace.'}
          </p>
        </div>
        {editable && (
          <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmArchive(true)}>
            <Trash2 className="h-4 w-4" />
            Archive Role
          </Button>
        )}
      </div>

      {!role.is_system_role && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Description</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Label>Description</Label>
            <Textarea
              value={description}
              disabled={!editable}
              onChange={(e) => {
                setDescription(e.target.value)
                setDescriptionDirty(true)
              }}
              rows={2}
            />
            {editable && descriptionDirty && (
              <Button size="sm" className="self-start" onClick={handleSaveDescription} disabled={updateRole.isPending}>
                {updateRole.isPending ? 'Saving…' : 'Save'}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Permission Matrix</CardTitle>
          <CardDescription>{role.staff_count} staff member{role.staff_count === 1 ? '' : 's'} currently hold this role.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-t border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="sticky left-0 bg-card px-5 py-2.5 font-semibold">Module</th>
                  {actionOrder.map((action) => (
                    <th key={action} className="px-3 py-2.5 text-center font-semibold">
                      {actionLabels[action]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {moduleOrder
                  .filter((m) => permissionsByModule.has(m))
                  .map((moduleSlug) => {
                    const perms = permissionsByModule.get(moduleSlug)!
                    return (
                      <tr key={moduleSlug} className="border-t border-border/60">
                        <td className="sticky left-0 bg-card px-5 py-2.5 font-medium">{moduleLabels[moduleSlug]}</td>
                        {actionOrder.map((action) => {
                          const perm = perms.find((p) => p.action === action)
                          if (!perm) return <td key={action} className="px-3 py-2.5 text-center text-muted-foreground/30">—</td>
                          const granted = grantedSlugs?.has(perm.slug) ?? false
                          return (
                            <td key={action} className="px-3 py-2.5 text-center">
                              <Switch
                                checked={granted}
                                disabled={!editable}
                                onCheckedChange={(checked) => setRolePermission.mutate({ permissionId: perm.id, granted: checked })}
                              />
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive "{role.name}"?</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="px-6 text-sm text-muted-foreground">
            {role.staff_count > 0
              ? `This role is still assigned to ${role.staff_count} staff member${role.staff_count === 1 ? '' : 's'} — reassign them first before archiving.`
              : 'This role has no staff assigned. It will no longer be selectable for new assignments.'}
          </div>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setConfirmArchive(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleArchive} disabled={role.staff_count > 0 || archiveRole.isPending}>
              {archiveRole.isPending ? 'Archiving…' : 'Archive Role'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
