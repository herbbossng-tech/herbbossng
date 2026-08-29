import { ChevronLeft, Loader2, Send, UserCheck, UserX } from 'lucide-react'
import * as React from 'react'
import { Link, useParams } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ErrorState, LoadingState } from '@/components/ui/state'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/contexts/AuthContext'
import { PermissionGate, usePermission } from '@/contexts/PermissionsContext'
import { OrderStatusBadge } from '@/features/orders/components/OrderStatusBadge'
import { OrderStatusDialog } from '@/features/orders/components/OrderStatusDialog'
import {
  useAddOrderNote,
  useAssignOrder,
  useOrder,
  useOrderItems,
  useOrderNotes,
  useOrderStatusTransitions,
  useOrderTimeline,
  useSetOrderTags,
} from '@/features/orders/hooks'
import { orderNextAction, orderSourceLabels, orderStatusLabels } from '@/features/orders/statusMeta'
import { formatCurrency } from '@/lib/currency'

const priorityVariant: Record<string, 'destructive' | 'warning' | 'secondary'> = {
  urgent: 'destructive',
  high: 'warning',
  normal: 'secondary',
}

const eventLabels: Record<string, string> = {
  ORDER_CREATED: 'Order created',
  STATUS_CHANGED: 'Status changed',
  ASSIGNED: 'Assignment changed',
  TAGS_UPDATED: 'Tags updated',
  CASH_COLLECTED: 'Cash collected',
  NOTE_ADDED: 'Note added',
}

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [statusDialogOpen, setStatusDialogOpen] = React.useState(false)
  const [noteBody, setNoteBody] = React.useState('')
  const [tagInput, setTagInput] = React.useState('')

  const { data: order, isLoading, isError, refetch } = useOrder(id)
  const { data: items } = useOrderItems(id)
  const { data: timeline } = useOrderTimeline(id)
  const { data: notes } = useOrderNotes(id)
  const { data: transitions } = useOrderStatusTransitions()

  const addNote = useAddOrderNote(id ?? '')
  const setTags = useSetOrderTags(id ?? '')
  const assignOrder = useAssignOrder(id ?? '')

  const canUpdate = usePermission('orders.update')
  const canAssign = usePermission('orders.assign')

  if (isLoading) return <LoadingState label="Loading order…" />
  if (isError || !order) {
    return <ErrorState message="We couldn't load this order." onRetry={() => refetch()} />
  }

  async function submitNote() {
    const body = noteBody.trim()
    if (!body) return
    await addNote.mutateAsync(body)
    setNoteBody('')
  }

  async function addTag() {
    const value = tagInput.trim()
    if (!value || order.tags.includes(value)) {
      setTagInput('')
      return
    }
    await setTags.mutateAsync([...order.tags, value])
    setTagInput('')
  }

  async function removeTag(tag: string) {
    await setTags.mutateAsync(order.tags.filter((t) => t !== tag))
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <Link to="/orders" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" />
            Back to Orders
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-2xl font-bold tracking-tight">{order.order_number}</h1>
            <OrderStatusBadge status={order.status} />
            {order.priority !== 'normal' && <Badge variant={priorityVariant[order.priority]}>{order.priority}</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Next action: {orderNextAction[order.status]}</p>
        </div>
        <PermissionGate permission="orders.update">
          <Button onClick={() => setStatusDialogOpen(true)}>Change Status</Button>
        </PermissionGate>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">Name</p>
                <p className="font-medium text-foreground">{order.customer_name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Phone</p>
                <a href={`tel:${order.customer_phone}`} className="font-medium text-foreground hover:text-primary">
                  {order.customer_phone}
                </a>
              </div>
              {order.customer_email && (
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="font-medium text-foreground">{order.customer_email}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">Source</p>
                <p className="font-medium text-foreground">
                  {orderSourceLabels[order.source] ?? order.source}
                  {order.source_detail ? ` · ${order.source_detail}` : ''}
                </p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground">Delivery address</p>
                <p className="font-medium text-foreground">
                  {order.customer_address}
                  {order.customer_address_2 ? `, ${order.customer_address_2}` : ''}
                  {order.customer_city ? `, ${order.customer_city}` : ''}
                  {order.customer_state ? `, ${order.customer_state}` : ''}
                  {order.customer_postal_code ? ` ${order.customer_postal_code}` : ''}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2.5 font-semibold">Product</th>
                      <th className="px-4 py-2.5 font-semibold">Qty</th>
                      <th className="px-4 py-2.5 font-semibold">Unit price</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(items ?? []).map((item) => (
                      <tr key={item.id} className="border-b border-border/60 last:border-0">
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-foreground">{item.product_name}</p>
                          {item.sku && <p className="text-xs text-muted-foreground">SKU: {item.sku}</p>}
                        </td>
                        <td className="px-4 py-2.5">{item.quantity}</td>
                        <td className="px-4 py-2.5">{formatCurrency(item.unit_price, order.currency_code)}</td>
                        <td className="px-4 py-2.5 text-right font-semibold">
                          {formatCurrency(item.total_amount, order.currency_code)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {canUpdate && (
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Add an internal note…"
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
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4">
                {(timeline ?? []).length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
                {(timeline ?? []).map((event) => (
                  <div key={event.id} className="flex gap-3">
                    <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{eventLabels[event.event_type] ?? event.event_type}</p>
                      <p className="text-sm text-muted-foreground">{event.description}</p>
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
              <CardTitle>Financials</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{formatCurrency(order.subtotal, order.currency_code)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Shipping</span>
                <span>{formatCurrency(order.shipping_fee, order.currency_code)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Discount</span>
                <span>-{formatCurrency(order.discount_amount, order.currency_code)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-2 text-base font-bold text-foreground">
                <span>Total</span>
                <span>{formatCurrency(order.total_amount, order.currency_code)}</span>
              </div>
              <div className="mt-2 flex justify-between text-muted-foreground">
                <span>Cash collection</span>
                <span className="font-medium text-foreground capitalize">{order.cash_collection_status}</span>
              </div>
              {order.cash_collected_amount !== null && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Collected</span>
                  <span>{formatCurrency(order.cash_collected_amount, order.currency_code)}</span>
                </div>
              )}
              {order.status === 'DELIVERED' && order.cash_collection_status === 'collected' && (
                <p className="mt-1 text-xs text-success">Counted in Delivered Revenue.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Assignment</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Assigned to</p>
                <p className="font-medium text-foreground">{order.assigned_to_email ?? 'Unassigned'}</p>
              </div>
              {canAssign && (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={assignOrder.isPending || !user}
                    onClick={() => user && assignOrder.mutate(user.id)}
                  >
                    <UserCheck className="h-3.5 w-3.5" />
                    Assign to me
                  </Button>
                  {order.assigned_to && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={assignOrder.isPending}
                      onClick={() => assignOrder.mutate(null)}
                    >
                      <UserX className="h-3.5 w-3.5" />
                      Unassign
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tags</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-1.5">
                {order.tags.length === 0 && <p className="text-sm text-muted-foreground">No tags.</p>}
                {order.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    {canUpdate && (
                      <button type="button" onClick={() => removeTag(tag)} className="ml-0.5 hover:text-destructive">
                        ×
                      </button>
                    )}
                  </Badge>
                ))}
              </div>
              {canUpdate && (
                <div className="flex gap-2">
                  <input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addTag()
                      }
                    }}
                    placeholder="Add a tag, e.g. repeated-order"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <Button type="button" size="sm" variant="outline" onClick={addTag}>
                    Add
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Status</span>
                <span className="text-foreground">{orderStatusLabels[order.status]}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Created</span>
                <span className="text-foreground">{new Date(order.created_at).toLocaleString()}</span>
              </div>
              {order.scheduled_at && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Scheduled</span>
                  <span className="text-foreground">{new Date(order.scheduled_at).toLocaleString()}</span>
                </div>
              )}
              {order.delivered_at && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Delivered</span>
                  <span className="text-foreground">{new Date(order.delivered_at).toLocaleString()}</span>
                </div>
              )}
              {order.cancelled_at && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Cancelled</span>
                  <span className="text-foreground">{new Date(order.cancelled_at).toLocaleString()}</span>
                </div>
              )}
              {order.returned_at && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Returned</span>
                  <span className="text-foreground">{new Date(order.returned_at).toLocaleString()}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <OrderStatusDialog
        order={order}
        transitions={transitions ?? []}
        open={statusDialogOpen}
        onOpenChange={(open) => {
          setStatusDialogOpen(open)
          if (!open) refetch()
        }}
      />
    </div>
  )
}
