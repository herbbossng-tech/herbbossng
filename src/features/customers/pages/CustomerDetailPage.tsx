import { ChevronLeft, Loader2, Pencil, Send } from 'lucide-react'
import * as React from 'react'
import { Link, useParams } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ErrorState, LoadingState } from '@/components/ui/state'
import { Textarea } from '@/components/ui/textarea'
import { PermissionGate, usePermission } from '@/contexts/PermissionsContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { CustomerEditDialog } from '@/features/customers/components/CustomerEditDialog'
import { CustomerStatusBadge } from '@/features/customers/components/CustomerStatusBadge'
import { useAddCustomerNote, useCustomer, useCustomerNotes, useCustomerOrders, useCustomerTimeline, useUpdateCustomer } from '@/features/customers/hooks'
import { customerClassificationLabel, customerStatusLabels, customerStatuses } from '@/features/customers/statusMeta'
import { OrderStatusBadge } from '@/features/orders/components/OrderStatusBadge'
import { orderSourceLabels } from '@/features/orders/statusMeta'
import { formatCurrency } from '@/lib/currency'
import type { CustomerStatus } from '@/types/database'

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { activeWorkspace } = useWorkspace()
  const [editOpen, setEditOpen] = React.useState(false)
  const [noteBody, setNoteBody] = React.useState('')

  const { data: customer, isLoading, isError, refetch } = useCustomer(id)
  const { data: orders } = useCustomerOrders(id)
  const { data: notes } = useCustomerNotes(id)
  const { data: timeline } = useCustomerTimeline(id)

  const updateStatus = useUpdateCustomer(id ?? '')
  const addNote = useAddCustomerNote(id ?? '')

  const canUpdate = usePermission('customers.update')
  const canDelete = usePermission('customers.delete')
  const canChangeStatus = canUpdate || canDelete

  if (isLoading) return <LoadingState label="Loading customer…" />
  if (isError || !customer) {
    return <ErrorState message="We couldn't load this customer." onRetry={() => refetch()} />
  }

  async function submitNote() {
    const body = noteBody.trim()
    if (!body) return
    await addNote.mutateAsync(body)
    setNoteBody('')
  }

  async function changeStatus(status: string) {
    await updateStatus.mutateAsync({ status })
  }

  const currency = activeWorkspace.currency_code

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <Link to="/customers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" />
            Back to Customers
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{customer.full_name}</h1>
            <CustomerStatusBadge status={customer.status} />
            {customer.is_repeat_customer && <Badge variant="info">{customerClassificationLabel(true)}</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Customer since {new Date(customer.created_at).toLocaleDateString()}
            {customer.last_order_at && ` · Last order ${new Date(customer.last_order_at).toLocaleDateString()}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canChangeStatus && (
            <Select value={customer.status} onValueChange={(v) => changeStatus(v)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {customerStatuses.map((s: CustomerStatus) => (
                  <SelectItem key={s} value={s}>
                    {customerStatusLabels[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <PermissionGate permission="customers.update">
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          </PermissionGate>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profile</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">Phone</p>
                <a href={`tel:${customer.phone}`} className="font-medium text-foreground hover:text-primary">
                  {customer.phone}
                </a>
              </div>
              {customer.alternate_phone && (
                <div>
                  <p className="text-xs text-muted-foreground">Alternate phone</p>
                  <a href={`tel:${customer.alternate_phone}`} className="font-medium text-foreground hover:text-primary">
                    {customer.alternate_phone}
                  </a>
                </div>
              )}
              {customer.email && (
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="font-medium text-foreground">{customer.email}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">Acquisition source</p>
                <p className="font-medium text-foreground">
                  {customer.acquisition_source ? (orderSourceLabels[customer.acquisition_source] ?? customer.acquisition_source) : '—'}
                </p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground">Address</p>
                <p className="font-medium text-foreground">
                  {[customer.address, customer.address_2, customer.landmark, customer.city, customer.state, customer.postal_code]
                    .filter(Boolean)
                    .join(', ') || '—'}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Order History</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {(orders ?? []).length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground">No orders yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-2.5 font-semibold">Order</th>
                        <th className="px-4 py-2.5 font-semibold">Date</th>
                        <th className="px-4 py-2.5 font-semibold">Source</th>
                        <th className="px-4 py-2.5 font-semibold">Amount</th>
                        <th className="px-4 py-2.5 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(orders ?? []).map((order) => (
                        <tr key={order.id} className="border-b border-border/60 last:border-0 hover:bg-accent/40">
                          <td className="px-4 py-2.5">
                            <Link to={`/orders/${order.id}`} className="font-mono text-xs text-muted-foreground hover:text-primary">
                              {order.order_number}
                            </Link>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{new Date(order.created_at).toLocaleDateString()}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{orderSourceLabels[order.source] ?? order.source}</td>
                          <td className="px-4 py-2.5 font-semibold">{formatCurrency(order.total_amount, order.currency_code)}</td>
                          <td className="px-4 py-2.5">
                            <OrderStatusBadge status={order.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {canUpdate && (
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Add an internal note (e.g. delivery preferences)…"
                    rows={2}
                    value={noteBody}
                    onChange={(e) => setNoteBody(e.target.value)}
                  />
                  <Button type="button" size="icon" disabled={!noteBody.trim() || addNote.isPending} onClick={submitNote}>
                    {addNote.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              )}
              <div className="flex flex-col gap-3">
                {(notes ?? []).length === 0 && <p className="text-sm text-muted-foreground">No notes yet.</p>}
                {(notes ?? []).map((note) => (
                  <div key={note.id} className="rounded-lg border border-border p-3 text-sm">
                    <p className="text-foreground">{note.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{new Date(note.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4">
                {(timeline ?? []).length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
                {(timeline ?? []).map((event) => (
                  <div key={`${event.kind}-${event.id}`} className="flex gap-3">
                    <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{event.description}</p>
                      <p className="text-xs text-muted-foreground">{new Date(event.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Total orders</span>
                <span className="font-semibold text-foreground">{customer.total_orders}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Delivered</span>
                <span className="font-semibold text-success">{customer.delivered_count}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Pending</span>
                <span className="font-semibold text-warning">{customer.pending_count}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Returned</span>
                <span className="font-semibold text-destructive">{customer.returned_count}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Cancelled</span>
                <span className="font-semibold text-muted-foreground">{customer.cancelled_count}</span>
              </div>
              <div className="mt-2 border-t border-border pt-2" />
              <div className="flex justify-between text-muted-foreground">
                <span>Total order value</span>
                <span className="font-semibold text-foreground">{formatCurrency(customer.total_order_value, currency)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Delivered value</span>
                <span className="font-semibold text-success">{formatCurrency(customer.delivered_value, currency)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Pending value</span>
                <span className="font-semibold text-warning">{formatCurrency(customer.pending_value, currency)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Returned value</span>
                <span className="font-semibold text-destructive">{formatCurrency(customer.returned_value, currency)}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Same COD revenue definitions as Orders/Dashboard — delivered value counts only collected, delivered orders.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <CustomerEditDialog customer={customer} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  )
}
