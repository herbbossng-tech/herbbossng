import { ChevronLeft, Loader2, MessageSquare, Send, Truck, UserCheck, UserX, Wallet } from 'lucide-react'
import * as React from 'react'
import { Link, useParams } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ErrorState, LoadingState } from '@/components/ui/state'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/contexts/AuthContext'
import { PermissionGate, usePermission } from '@/contexts/PermissionsContext'
import { ContactCustomerDialog } from '@/features/communications/components/ContactCustomerDialog'
import { useDeliveryPartners } from '@/features/deliveryPartners/hooks'
import { OrderStatusBadge } from '@/features/orders/components/OrderStatusBadge'
import { useAssignableStaff } from '@/features/staff/hooks'
import { OrderStatusDialog } from '@/features/orders/components/OrderStatusDialog'
import {
  useAddOrderNote,
  useAssignOrder,
  useMarkOrderPacked,
  useOrder,
  useOrderDeliveryAttempts,
  useOrderItems,
  useOrderNotes,
  useOrderStatusTransitions,
  useOrderTimeline,
  useRecordCashCollection,
  useRecordDeliveryAttempt,
  useSetOrderTags,
} from '@/features/orders/hooks'
import { orderNextAction, orderSourceLabels, orderStatusLabels } from '@/features/orders/statusMeta'
import { useCreateOrderSettlement, useOrderSettlements } from '@/features/settlement/hooks'
import { LogInteractionDialog } from '@/features/support/components/LogInteractionDialog'
import { RescueCasePanel } from '@/features/support/components/RescueCasePanel'
import { StartRescueDialog } from '@/features/support/components/StartRescueDialog'
import { useOrderInteractions, useOrderRescueCase } from '@/features/support/hooks'
import { interactionOutcomeLabels, interactionTypeLabels } from '@/features/support/statusMeta'
import { useCreateOrderTask, useOrderTasks, useUpdateOrderTaskStatus } from '@/features/tasks/hooks'
import { useCreateWaybill, useOrderWaybills, useUpdateWaybillStatus } from '@/features/waybills/hooks'
import { formatCurrency } from '@/lib/currency'

const waybillNextStatus: Record<string, { status: string; label: string }[]> = {
  CREATED: [{ status: 'READY', label: 'Mark Ready' }],
  READY: [{ status: 'DISPATCHED', label: 'Dispatch' }],
  DISPATCHED: [{ status: 'IN_TRANSIT', label: 'In Transit' }],
  IN_TRANSIT: [{ status: 'OUT_FOR_DELIVERY', label: 'Out for Delivery' }],
  OUT_FOR_DELIVERY: [{ status: 'DELIVERED', label: 'Delivered' }],
}

const waybillStatusTone: Record<string, 'secondary' | 'info' | 'success' | 'destructive' | 'warning'> = {
  CREATED: 'secondary',
  READY: 'info',
  DISPATCHED: 'info',
  IN_TRANSIT: 'info',
  OUT_FOR_DELIVERY: 'warning',
  DELIVERED: 'success',
  FAILED: 'destructive',
  RETURNED: 'destructive',
  CANCELLED: 'secondary',
}

const taskStatusTone: Record<string, 'secondary' | 'info' | 'success' | 'destructive'> = {
  OPEN: 'secondary',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
  CANCELLED: 'destructive',
}

const settlementStatusTone: Record<string, 'secondary' | 'success' | 'destructive' | 'warning'> = {
  PENDING: 'secondary',
  PARTIALLY_SETTLED: 'warning',
  SETTLED: 'success',
  DISPUTED: 'destructive',
}

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
  const [createTaskOpen, setCreateTaskOpen] = React.useState(false)
  const [createWaybillOpen, setCreateWaybillOpen] = React.useState(false)
  const [recordAttemptOpen, setRecordAttemptOpen] = React.useState(false)
  const [cashCollectionOpen, setCashCollectionOpen] = React.useState(false)
  const [createSettlementOpen, setCreateSettlementOpen] = React.useState(false)

  const { data: order, isLoading, isError, refetch } = useOrder(id)
  const { data: items } = useOrderItems(id)
  const { data: timeline } = useOrderTimeline(id)
  const { data: notes } = useOrderNotes(id)
  const { data: transitions } = useOrderStatusTransitions()

  const addNote = useAddOrderNote(id ?? '')
  const setTags = useSetOrderTags(id ?? '')
  const assignOrder = useAssignOrder(id ?? '')
  const markPacked = useMarkOrderPacked(id ?? '')

  const canUpdate = usePermission('orders.update')
  const canAssign = usePermission('orders.assign')
  const { data: assignableStaff } = useAssignableStaff()

  const canViewTasks = usePermission('tasks.view')
  const hasTasksCreate = usePermission('tasks.create')
  const hasTasksUpdate = usePermission('tasks.update')
  const hasTasksManage = usePermission('tasks.manage')
  const canCreateTask = hasTasksCreate || hasTasksManage
  const canUpdateTask = hasTasksUpdate || hasTasksManage
  const { data: orderTasks } = useOrderTasks(canViewTasks ? id : undefined)
  const updateTaskStatus = useUpdateOrderTaskStatus()

  const canViewSupport = usePermission('support.view')
  const hasSupportCreate = usePermission('support.create')
  const hasSupportManage = usePermission('support.manage')
  const hasRescueCreate = usePermission('rescue.create')
  const hasRescueManage = usePermission('rescue.manage')
  const canCreateInteraction = hasSupportCreate || hasSupportManage
  const canCreateRescue = hasRescueCreate || hasRescueManage
  const { data: interactions } = useOrderInteractions(canViewSupport ? id : undefined)
  const { data: activeRescueCase } = useOrderRescueCase(canViewSupport ? id : undefined)
  const [logInteractionOpen, setLogInteractionOpen] = React.useState(false)
  const [startRescueOpen, setStartRescueOpen] = React.useState(false)
  const [contactCustomerOpen, setContactCustomerOpen] = React.useState(false)

  const canViewWaybills = usePermission('waybills.view')
  const hasWaybillsCreate = usePermission('waybills.create')
  const hasWaybillsUpdate = usePermission('waybills.update')
  const hasWaybillsManage = usePermission('waybills.manage')
  const hasFulfillmentManage = usePermission('fulfillment.manage')
  const hasOrdersManage = usePermission('orders.manage')
  const canCreateWaybill = hasWaybillsCreate || hasWaybillsManage
  const canUpdateWaybill = hasWaybillsUpdate || hasWaybillsManage
  const canManageFulfillment = hasFulfillmentManage || hasOrdersManage
  const { data: orderWaybills } = useOrderWaybills(canViewWaybills ? id : undefined)
  const updateWaybillStatus = useUpdateWaybillStatus()
  const activeWaybill = orderWaybills?.find((w) => !['DELIVERED', 'FAILED', 'RETURNED', 'CANCELLED'].includes(w.status))

  const { data: deliveryAttempts } = useOrderDeliveryAttempts(canViewWaybills ? id : undefined)
  const recordAttempt = useRecordDeliveryAttempt(id ?? '')
  const recordCashCollection = useRecordCashCollection(id ?? '')

  const canViewSettlement = usePermission('settlement.view')
  const canManageSettlement = usePermission('settlement.manage')
  const { data: orderSettlements } = useOrderSettlements(canViewSettlement ? id : undefined)
  const createSettlement = useCreateOrderSettlement()

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
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>Customer</CardTitle>
              <PermissionGate permission="communications.send">
                <Button size="sm" variant="outline" onClick={() => setContactCustomerOpen(true)}>
                  <MessageSquare className="h-3.5 w-3.5" />
                  Contact Customer
                </Button>
              </PermissionGate>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">Name</p>
                <div className="flex items-center gap-1.5">
                  <p className="font-medium text-foreground">{order.customer_name}</p>
                  {order.is_repeat_customer && <Badge variant="info">Repeat customer</Badge>}
                  {order.affiliate_id && (
                    <Link to={`/affiliates/${order.affiliate_id}`}>
                      <Badge variant="secondary">Affiliate: {order.affiliate_referral_code_used}</Badge>
                    </Link>
                  )}
                </div>
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

          {canViewWaybills && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Fulfillment &amp; Delivery</CardTitle>
                {canManageFulfillment && !order.packed_at && ['SCHEDULED', 'PROCESSING_FOR_DISPATCH'].includes(order.status) && (
                  <Button size="sm" variant="outline" disabled={markPacked.isPending} onClick={() => markPacked.mutate()}>
                    Mark Packed
                  </Button>
                )}
              </CardHeader>
              <CardContent className="flex flex-col gap-5 text-sm">
                {order.packed_at && (
                  <p className="text-xs text-muted-foreground">Packed {new Date(order.packed_at).toLocaleString()}</p>
                )}

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Waybill</p>
                    {canCreateWaybill && !activeWaybill && (
                      <Button size="sm" variant="outline" onClick={() => setCreateWaybillOpen(true)}>
                        <Truck className="h-3.5 w-3.5" />
                        Create Waybill
                      </Button>
                    )}
                  </div>
                  {!orderWaybills || orderWaybills.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No waybill created yet.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {orderWaybills.map((w) => (
                        <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
                          <div>
                            <p className="font-mono text-xs text-muted-foreground">{w.waybill_number}</p>
                            <p className="text-xs text-muted-foreground">{w.delivery_partner?.name ?? 'No partner assigned'}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={waybillStatusTone[w.status]}>{w.status.replace(/_/g, ' ')}</Badge>
                            {canUpdateWaybill &&
                              waybillNextStatus[w.status]?.map((n) => (
                                <Button
                                  key={n.status}
                                  size="sm"
                                  variant="outline"
                                  disabled={updateWaybillStatus.isPending}
                                  onClick={() => updateWaybillStatus.mutate({ waybillId: w.id, status: n.status })}
                                >
                                  {n.label}
                                </Button>
                              ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Delivery Attempts</p>
                    {canUpdate && (
                      <Button size="sm" variant="outline" onClick={() => setRecordAttemptOpen(true)}>
                        Record Attempt
                      </Button>
                    )}
                  </div>
                  {!deliveryAttempts || deliveryAttempts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No delivery attempts recorded yet.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {deliveryAttempts.map((a) => (
                        <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
                          <div>
                            <p className="font-medium text-foreground">
                              Attempt #{a.attempt_number}: {a.result.replace(/_/g, ' ')}
                            </p>
                            {a.failure_reason && <p className="text-xs text-muted-foreground">{a.failure_reason}</p>}
                            <p className="text-xs text-muted-foreground">{a.delivery_partner?.name ?? 'No partner'} · {new Date(a.attempted_at).toLocaleString()}</p>
                          </div>
                          <Badge variant={a.result === 'DELIVERED' ? 'success' : 'secondary'}>{a.result.replace(/_/g, ' ')}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {canViewTasks && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Follow-up Tasks</CardTitle>
                {canCreateTask && (
                  <Button size="sm" variant="outline" onClick={() => setCreateTaskOpen(true)}>
                    New Task
                  </Button>
                )}
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {!orderTasks || orderTasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No follow-up tasks yet.</p>
                ) : (
                  orderTasks.map((t) => (
                    <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{t.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.task_type.replace(/_/g, ' ')} · {t.priority}
                          {t.due_at ? ` · due ${new Date(t.due_at).toLocaleDateString()}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={taskStatusTone[t.status]}>{t.status.replace(/_/g, ' ')}</Badge>
                        {canUpdateTask && t.status === 'OPEN' && (
                          <Button size="sm" variant="outline" disabled={updateTaskStatus.isPending} onClick={() => updateTaskStatus.mutate({ taskId: t.id, status: 'IN_PROGRESS' })}>
                            Start
                          </Button>
                        )}
                        {canUpdateTask && t.status !== 'COMPLETED' && t.status !== 'CANCELLED' && (
                          <Button size="sm" disabled={updateTaskStatus.isPending} onClick={() => updateTaskStatus.mutate({ taskId: t.id, status: 'COMPLETED' })}>
                            Complete
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          )}

          {canViewSupport && (
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                <CardTitle>Support</CardTitle>
                <div className="flex flex-wrap gap-2">
                  {canCreateInteraction && (
                    <Button size="sm" variant="outline" onClick={() => setLogInteractionOpen(true)}>
                      Log Contact
                    </Button>
                  )}
                  {!activeRescueCase && canCreateRescue && (
                    <Button size="sm" onClick={() => setStartRescueOpen(true)}>
                      Start Rescue
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {activeRescueCase && <RescueCasePanel rescueCase={activeRescueCase} />}
                {!interactions || interactions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No support interactions logged yet.</p>
                ) : (
                  <ol className="flex flex-col gap-2">
                    {interactions.map((i) => (
                      <li key={i.id} className="rounded-lg border border-border p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-foreground">{interactionTypeLabels[i.interaction_type]}</span>
                          {i.outcome && <Badge variant="secondary">{interactionOutcomeLabels[i.outcome]}</Badge>}
                        </div>
                        <p className="mt-1 text-muted-foreground">{i.summary}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{new Date(i.created_at).toLocaleString()}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          )}

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
              {canUpdate && order.status === 'DELIVERED' && order.cash_collection_status !== 'collected' && (
                <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => setCashCollectionOpen(true)}>
                  <Wallet className="h-3.5 w-3.5" />
                  Record Cash Collection
                </Button>
              )}
            </CardContent>
          </Card>

          {canViewSettlement && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Settlement</CardTitle>
                {canManageSettlement &&
                  ['collected', 'partial'].includes(order.cash_collection_status) &&
                  !orderSettlements?.some((s) => s.status === 'SETTLED') && (
                    <Button size="sm" variant="outline" onClick={() => setCreateSettlementOpen(true)}>
                      Record
                    </Button>
                  )}
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                {!orderSettlements || orderSettlements.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No settlements recorded yet.</p>
                ) : (
                  orderSettlements.map((s) => (
                    <div key={s.id} className="rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Remitted</span>
                        <span className="font-medium text-foreground">{formatCurrency(s.remitted_amount, order.currency_code)}</span>
                      </div>
                      {s.discrepancy !== 0 && (
                        <div className="mt-1 flex items-center justify-between text-destructive">
                          <span>Discrepancy</span>
                          <span className="font-medium">{formatCurrency(s.discrepancy, order.currency_code)}</span>
                        </div>
                      )}
                      <div className="mt-2 flex items-center justify-between">
                        <Badge variant={settlementStatusTone[s.status]}>{s.status.replace(/_/g, ' ')}</Badge>
                        <span className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          )}

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
                <div className="flex flex-col gap-2">
                  <Select
                    value={order.assigned_to ?? 'unassigned'}
                    onValueChange={(value) => assignOrder.mutate(value === 'unassigned' ? null : value)}
                    disabled={assignOrder.isPending}
                  >
                    <SelectTrigger className="w-full sm:w-64">
                      <SelectValue placeholder="Assign staff…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {assignableStaff?.map((s) => (
                        <SelectItem key={s.user_id} value={s.user_id}>
                          {[s.first_name, s.last_name].filter(Boolean).join(' ') || s.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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

      <CreateTaskDialog orderId={order.id} open={createTaskOpen} onOpenChange={setCreateTaskOpen} />
      <CreateWaybillDialog orderId={order.id} open={createWaybillOpen} onOpenChange={setCreateWaybillOpen} />
      <LogInteractionDialog open={logInteractionOpen} onOpenChange={setLogInteractionOpen} orderId={order.id} customerId={order.customer_id} />
      <StartRescueDialog open={startRescueOpen} onOpenChange={setStartRescueOpen} orderId={order.id} />
      <ContactCustomerDialog
        open={contactCustomerOpen}
        onOpenChange={setContactCustomerOpen}
        orderId={order.id}
        customerName={order.customer_name}
        customerEmail={order.customer_email}
        customerPhone={order.customer_phone}
      />
      <RecordAttemptDialog
        open={recordAttemptOpen}
        onOpenChange={setRecordAttemptOpen}
        activeWaybillId={activeWaybill?.id ?? null}
        onSubmit={async (result, deliveryPartnerId, failureReason, notes) => {
          await recordAttempt.mutateAsync({ result, waybillId: activeWaybill?.id ?? null, deliveryPartnerId, failureReason, notes })
          setRecordAttemptOpen(false)
        }}
        isPending={recordAttempt.isPending}
      />
      <CashCollectionDialog
        open={cashCollectionOpen}
        onOpenChange={setCashCollectionOpen}
        totalAmount={order.total_amount}
        currencyCode={order.currency_code}
        onSubmit={async (amount, note) => {
          await recordCashCollection.mutateAsync({ amount, note })
          setCashCollectionOpen(false)
        }}
        isPending={recordCashCollection.isPending}
      />
      <CreateSettlementDialog
        open={createSettlementOpen}
        onOpenChange={setCreateSettlementOpen}
        collectedAmount={order.cash_collected_amount ?? 0}
        currencyCode={order.currency_code}
        onSubmit={async (remittedAmount, deliveryFee, note) => {
          await createSettlement.mutateAsync({ orderId: order.id, remittedAmount, deliveryFee, note })
          setCreateSettlementOpen(false)
        }}
        isPending={createSettlement.isPending}
      />
    </div>
  )
}

function CreateTaskDialog({ orderId, open, onOpenChange }: { orderId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const createTask = useCreateOrderTask()
  const [taskType, setTaskType] = React.useState('CALL_BACK')
  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      setTaskType('CALL_BACK')
      setTitle('')
      setDescription('')
      setError(null)
    }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setError('Title is required.')
      return
    }
    setError(null)
    try {
      await createTask.mutateAsync({ orderId, taskType: taskType as never, title, description: description || null })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Follow-up Task</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6 pt-2">
          <div className="flex flex-col gap-1.5">
            <Label>Task type</Label>
            <Select value={taskType} onValueChange={setTaskType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CONFIRM_ORDER">Confirm Order</SelectItem>
                <SelectItem value="CALL_BACK">Call Back</SelectItem>
                <SelectItem value="VERIFY_ADDRESS">Verify Address</SelectItem>
                <SelectItem value="DELIVERY_FOLLOW_UP">Delivery Follow-up</SelectItem>
                <SelectItem value="FAILED_DELIVERY">Failed Delivery</SelectItem>
                <SelectItem value="CUSTOMER_REQUEST">Customer Request</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Call to confirm order" autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Description (optional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createTask.isPending}>
              {createTask.isPending ? 'Creating…' : 'Create Task'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CreateWaybillDialog({ orderId, open, onOpenChange }: { orderId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const createWaybill = useCreateWaybill()
  const { data: partners } = useDeliveryPartners()
  const [partnerId, setPartnerId] = React.useState('none')
  const [notes, setNotes] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      setPartnerId('none')
      setNotes('')
      setError(null)
    }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await createWaybill.mutateAsync({ orderId, deliveryPartnerId: partnerId === 'none' ? null : partnerId, notes: notes || null })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create waybill')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Waybill</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6 pt-2">
          <div className="flex flex-col gap-1.5">
            <Label>Delivery partner (optional)</Label>
            <Select value={partnerId} onValueChange={setPartnerId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {partners?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createWaybill.isPending}>
              {createWaybill.isPending ? 'Creating…' : 'Create Waybill'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RecordAttemptDialog({
  open,
  onOpenChange,
  activeWaybillId,
  onSubmit,
  isPending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  activeWaybillId: string | null
  onSubmit: (result: string, deliveryPartnerId: string | null, failureReason: string | null, notes: string | null) => Promise<void>
  isPending: boolean
}) {
  const { data: partners } = useDeliveryPartners()
  const [result, setResult] = React.useState('DELIVERED')
  const [partnerId, setPartnerId] = React.useState('none')
  const [failureReason, setFailureReason] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      setResult('DELIVERED')
      setPartnerId('none')
      setFailureReason('')
      setNotes('')
      setError(null)
    }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await onSubmit(result, partnerId === 'none' ? null : partnerId, failureReason || null, notes || null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record delivery attempt')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Delivery Attempt</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6 pt-2">
          {!activeWaybillId && <p className="text-xs text-muted-foreground">No active waybill — this attempt will be recorded against the order directly.</p>}
          <div className="flex flex-col gap-1.5">
            <Label>Outcome</Label>
            <Select value={result} onValueChange={setResult}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DELIVERED">Delivered</SelectItem>
                <SelectItem value="CUSTOMER_UNAVAILABLE">Customer Unavailable</SelectItem>
                <SelectItem value="CUSTOMER_REFUSED">Customer Refused</SelectItem>
                <SelectItem value="WRONG_ADDRESS">Wrong Address</SelectItem>
                <SelectItem value="RESCHEDULED">Rescheduled</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Delivery partner (optional)</Label>
            <Select value={partnerId} onValueChange={setPartnerId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {partners?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {result !== 'DELIVERED' && (
            <div className="flex flex-col gap-1.5">
              <Label>Failure reason (optional)</Label>
              <Input value={failureReason} onChange={(e) => setFailureReason(e.target.value)} placeholder="e.g. Phone switched off" />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : 'Record Attempt'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CashCollectionDialog({
  open,
  onOpenChange,
  totalAmount,
  currencyCode,
  onSubmit,
  isPending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  totalAmount: number
  currencyCode: string
  onSubmit: (amount: number, note: string | null) => Promise<void>
  isPending: boolean
}) {
  const [amount, setAmount] = React.useState(totalAmount)
  const [note, setNote] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open) {
      setAmount(totalAmount)
      setNote('')
      setError(null)
    }
  }, [open, totalAmount])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (amount < 0 || amount > totalAmount) {
      setError(`Amount must be between 0 and ${formatCurrency(totalAmount, currencyCode)}.`)
      return
    }
    setError(null)
    try {
      await onSubmit(amount, note || null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record cash collection')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Cash Collection</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6 pt-2">
          <p className="text-xs text-muted-foreground">Order total: {formatCurrency(totalAmount, currencyCode)}</p>
          <div className="flex flex-col gap-1.5">
            <Label>Amount collected</Label>
            <Input type="number" step="0.01" min={0} max={totalAmount} value={amount} onChange={(e) => setAmount(Number(e.target.value))} autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Note (optional)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : 'Record Collection'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CreateSettlementDialog({
  open,
  onOpenChange,
  collectedAmount,
  currencyCode,
  onSubmit,
  isPending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  collectedAmount: number
  currencyCode: string
  onSubmit: (remittedAmount: number, deliveryFee: number, note: string | null) => Promise<void>
  isPending: boolean
}) {
  const [remittedAmount, setRemittedAmount] = React.useState(collectedAmount)
  const [deliveryFee, setDeliveryFee] = React.useState(0)
  const [note, setNote] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open) {
      setRemittedAmount(collectedAmount)
      setDeliveryFee(0)
      setNote('')
      setError(null)
    }
  }, [open, collectedAmount])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (remittedAmount < 0) {
      setError('Remitted amount must be zero or positive.')
      return
    }
    setError(null)
    try {
      await onSubmit(remittedAmount, deliveryFee, note || null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record settlement')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Settlement</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6 pt-2">
          <p className="text-xs text-muted-foreground">Cash collected: {formatCurrency(collectedAmount, currencyCode)}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Remitted amount</Label>
              <Input type="number" step="0.01" min={0} value={remittedAmount} onChange={(e) => setRemittedAmount(Number(e.target.value))} autoFocus />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Delivery fee</Label>
              <Input type="number" step="0.01" min={0} value={deliveryFee} onChange={(e) => setDeliveryFee(Number(e.target.value))} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Note (optional)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : 'Record Settlement'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
