import { Landmark, Plus, Star, Trash2 } from 'lucide-react'
import * as React from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'

import { useCreateMyBankAccount, useDeleteMyBankAccount, useMyBankAccounts, useSetMyDefaultBankAccount } from '../hooks'

function AddBankAccountDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [bankName, setBankName] = React.useState('')
  const [accountNumber, setAccountNumber] = React.useState('')
  const [accountName, setAccountName] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const createMutation = useCreateMyBankAccount()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!bankName.trim() || !accountNumber.trim() || !accountName.trim()) {
      setError('All fields are required.')
      return
    }
    try {
      await createMutation.mutateAsync({ bankName: bankName.trim(), accountNumber: accountNumber.trim(), accountName: accountName.trim() })
      setBankName('')
      setAccountNumber('')
      setAccountName('')
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add this bank account')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Bank Account</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4 p-6 pt-2" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label>Bank name</Label>
            <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. GTBank" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Account number</Label>
            <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Account name</Label>
            <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Adding…' : 'Add Account'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function AffiliateSettingsPage() {
  const { data: accounts, isLoading, isError, refetch } = useMyBankAccounts()
  const deleteMutation = useDeleteMyBankAccount()
  const setDefaultMutation = useSetMyDefaultBankAccount()
  const [addOpen, setAddOpen] = React.useState(false)
  const [deleteId, setDeleteId] = React.useState<string | null>(null)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your account settings and preferences.</p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="text-base">Bank Accounts</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Manage your bank accounts for withdrawal payments.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{(accounts ?? []).length} of 5 accounts used</span>
            <Button size="sm" onClick={() => setAddOpen(true)} disabled={(accounts ?? []).length >= 5}>
              <Plus className="h-4 w-4" />
              Add Account
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingState label="Loading bank accounts…" />
          ) : isError ? (
            <ErrorState message="Couldn't load your bank accounts." onRetry={() => refetch()} />
          ) : (accounts ?? []).length === 0 ? (
            <EmptyState icon={Landmark} title="No bank accounts" description="Add a bank account to enable withdrawals." />
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {accounts?.map((account) => (
                <div key={account.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-2">
                    <Landmark className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {account.bank_name} {account.is_default && <span className="ml-1 text-xs text-primary">(Default)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {account.account_number} · {account.account_name}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {!account.is_default && (
                      <Button size="icon" variant="ghost" title="Set as default" onClick={() => setDefaultMutation.mutate(account.id)}>
                        <Star className="h-4 w-4" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => setDeleteId(account.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AddBankAccountDialog open={addOpen} onOpenChange={setAddOpen} />

      <AlertDialog open={Boolean(deleteId)} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this bank account?</AlertDialogTitle>
          </AlertDialogHeader>
          <p className="text-sm text-muted-foreground">This cannot be undone. Future withdrawal requests will need a different account.</p>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) deleteMutation.mutate(deleteId)
                setDeleteId(null)
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
