import { supabase } from '@/lib/supabase'
import type { CommunicationLog, TrackingDispatchLog } from '@/types/database'

export async function fetchTrackingDispatchEvents(
  workspaceId: string,
  status?: string | null,
  limit = 50,
  offset = 0,
): Promise<TrackingDispatchLog[]> {
  const { data, error } = await supabase.rpc('list_tracking_dispatch_events', {
    p_workspace_id: workspaceId,
    p_status: status ?? null,
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw error
  return (data ?? []) as TrackingDispatchLog[]
}

export async function retryTrackingDispatchEvent(id: string): Promise<TrackingDispatchLog> {
  const { data, error } = await supabase.rpc('retry_tracking_dispatch_event', { p_id: id }).single()
  if (error) throw error
  return data as TrackingDispatchLog
}

export async function fetchCommunicationLog(workspaceId: string, status?: string | null, limit = 50, offset = 0): Promise<CommunicationLog[]> {
  const { data, error } = await supabase.rpc('list_communication_log', {
    p_workspace_id: workspaceId,
    p_status: status ?? null,
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw error
  return (data ?? []) as CommunicationLog[]
}

export async function retryCommunicationLogEntry(id: string): Promise<CommunicationLog> {
  const { data, error } = await supabase.rpc('retry_communication_log_entry', { p_id: id }).single()
  if (error) throw error
  return data as CommunicationLog
}

/**
 * Looks up the communication_log outcome(s) an automation SEND_EMAIL /
 * SEND_SMS / SEND_WHATSAPP action produced, via the existing
 * related_execution_action_id column (0028/0032/0034) — no new RPC or
 * link table needed. Subject to communication_log's own RLS
 * (communications.view OR integrations.view): a caller without either
 * permission gets back zero rows, never an error, which is why the
 * caller should only render this section for users who hold one of
 * those permissions.
 */
export async function fetchCommunicationLogByActionIds(actionIds: string[]): Promise<CommunicationLog[]> {
  if (actionIds.length === 0) return []
  const { data, error } = await supabase.from('communication_log').select('*').in('related_execution_action_id', actionIds)
  if (error) throw error
  return (data ?? []) as CommunicationLog[]
}

export interface CommunicationConfigStatus {
  email_configured: boolean
  email_provider: string | null
  sms_configured: boolean
  sms_provider: string | null
  whatsapp_configured: boolean
  whatsapp_provider: string | null
}

export async function fetchCommunicationConfigStatus(brandId: string): Promise<CommunicationConfigStatus> {
  const { data, error } = await supabase.rpc('get_communication_config_status', { p_brand_id: brandId }).single()
  if (error) throw error
  return data as CommunicationConfigStatus
}

export interface SetBrandCommunicationConfigInput {
  emailApiKey?: string | null
  smsProvider?: string | null
  smsApiKey?: string | null
  smsSenderId?: string | null
  whatsappProvider?: string | null
  whatsappApiKey?: string | null
  whatsappPhoneNumberId?: string | null
}

export async function setBrandCommunicationConfig(brandId: string, input: SetBrandCommunicationConfigInput): Promise<void> {
  const { error } = await supabase.rpc('set_brand_communication_config', {
    p_brand_id: brandId,
    p_email_api_key: input.emailApiKey ?? null,
    p_sms_provider: input.smsProvider ?? null,
    p_sms_api_key: input.smsApiKey ?? null,
    p_sms_sender_id: input.smsSenderId ?? null,
    p_whatsapp_provider: input.whatsappProvider ?? null,
    p_whatsapp_api_key: input.whatsappApiKey ?? null,
    p_whatsapp_phone_number_id: input.whatsappPhoneNumberId ?? null,
  })
  if (error) throw error
}

/** Lightweight client-side rollup — counts by status, computed from a recent page of rows rather than a dedicated aggregate RPC (kept deliberately simple per the "don't overbuild" integration-phase guidance). */
export function summarizeByStatus<T extends { status: string }>(rows: T[]): Record<string, number> {
  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1
    return acc
  }, {})
}

export interface QueueHealthRow {
  queue: 'tracking' | 'communication' | 'automation'
  pending: number
  processing: number
  retrying: number
  failed_recent: number
  succeeded_recent: number
  oldest_pending_at: string | null
  last_success_at: string | null
  last_failure_at: string | null
  health: 'healthy' | 'degraded' | 'failing' | 'not_configured' | 'no_data'
}

/** get_queue_health() (0035) — one efficient server-side rollup over the full tables (not just the loaded page), replacing client-side counting derived from a partial page of rows. Health is honestly derived from actual queue state; see the function's own comment for the exact thresholds. */
export async function fetchQueueHealth(workspaceId: string): Promise<QueueHealthRow[]> {
  const { data, error } = await supabase.rpc('get_queue_health', { p_workspace_id: workspaceId })
  if (error) throw error
  return (data ?? []) as QueueHealthRow[]
}
