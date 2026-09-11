import { Copy, Lock, Plus, Shield, ShieldCheck } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { PermissionGate, usePermission } from '@/contexts/PermissionsContext'
import { useCreateRole, useDuplicateRole, useRoles } from '@/features/roles/hooks'

export function RolesPage() {
  const canView = usePermission('roles_permissions.view')
  const canManage = usePermission('roles_permissions.manage')
  const { data: roles, isLoading, isError, refetch } = useRoles()
  const [createOpen, setCreateOpen] = React.useState(false)
  const [duplicateSource, setDuplicateSource] = React.useState<{ id: string; name: string } | null>(null)

  if (!canView) {
    return (
      <Card className="p-8">
        <EmptyState icon={Lock} title="Roles is hidden" description="You don't have permission to view roles in this workspace. Ask a workspace admin for the roles_permissions.view permission." />
      </Card>
    )
  }

  if (isError) return <ErrorState message="Couldn't load roles." onRetry={() => refetch()} />

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Roles &amp; Permissions</h1>
          <p className="mt-1 text-sm text-muted-foreground">System role templates and custom roles for this workspace.</p>
        </div>
        <PermissionGate permission="roles_permissions.manage">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            New Custom Role
          </Button>
        </PermissionGate>
      </div>

      {isLoading ? (
        <LoadingState label="Loading roles…" />
      ) : (roles?.length ?? 0) === 0 ? (
        <EmptyState icon={Shield} title="No roles yet" description="This shouldn't normally happen — system role templates are seeded automatically." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {roles?.map((role) => (
            <Card key={role.id} className="flex flex-col gap-3 p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    {role.is_system_role ? <ShieldCheck className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                  </span>
                  <div>
                    <p className="font-semibold">{role.name}</p>
                    <Badge variant={role.is_system_role ? 'secondary' : 'outline'} className="mt-0.5">
                      {role.is_system_role ? 'System' : 'Custom'}
                    </Badge>
                  </div>
                </div>
              </div>
              {role.description && <p className="text-sm text-muted-foreground">{role.description}</p>}
              <p className="text-xs text-muted-foreground">{role.staff_count} staff assigned</p>
              <div className="mt-auto flex items-center gap-2">
                <Button variant="outline" size="sm" asChild className="flex-1">
                  <Link to={`/roles/${role.id}`}>View permissions</Link>
                </Button>
                {canManage && (
                  <Button variant="ghost" size="sm" onClick={() => setDuplicateSource({ id: role.id, name: role.name })} title="Duplicate role">
                    <Copy className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <CreateRoleDialog open={createOpen} onOpenChange={setCreateOpen} />
      <DuplicateRoleDialog source={duplicateSource} onOpenChange={(open) => !open && setDuplicateSource(null)} />
    </div>
  )
}

function CreateRoleDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const createRole = useCreateRole()

  React.useEffect(() => {
    if (!open) {
      setName('')
      setDescription('')
      setError(null)
    }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError('Role name is required.')
      return
    }
    try {
      await createRole.mutateAsync({ name, description })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create role')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Custom Role</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6 pt-2">
          <div className="flex flex-col gap-1.5">
            <Label>Role name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Regional Supervisor" autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Description (optional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="What this role is for" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createRole.isPending}>
              {createRole.isPending ? 'Creating…' : 'Create Role'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DuplicateRoleDialog({ source, onOpenChange }: { source: { id: string; name: string } | null; onOpenChange: (open: boolean) => void }) {
  const [name, setName] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const duplicateRole = useDuplicateRole()

  React.useEffect(() => {
    if (source) {
      setName(`${source.name} (Copy)`)
      setError(null)
    }
  }, [source])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!source) return
    setError(null)
    if (!name.trim()) {
      setError('Role name is required.')
      return
    }
    try {
      await duplicateRole.mutateAsync({ sourceRoleId: source.id, newName: name })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to duplicate role')
    }
  }

  return (
    <Dialog open={Boolean(source)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Duplicate "{source?.name}"</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6 pt-2">
          <p className="text-sm text-muted-foreground">Creates a new custom role with the same permissions as "{source?.name}", which you can then customize independently.</p>
          <div className="flex flex-col gap-1.5">
            <Label>New role name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={duplicateRole.isPending}>
              {duplicateRole.isPending ? 'Duplicating…' : 'Duplicate'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
