import { supabase } from '@/lib/supabase'
import type {
  CommunicationLog,
  ExternalConnection,
  ExternalConnectionProvider,
  ExternalIngestionHealth,
  ExternalOrderIngestionLog,
  TrackingDispatchLog,
} from '@/types/database'

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
  /** 'resend' (default, third-party API) or 'smtp' (a workspace's own mail server/relay) — see brand_communication_secrets (0050). */
  emailProvider?: 'resend' | 'smtp' | null
  smtpHost?: string | null
  smtpPort?: number | null
  smtpUsername?: string | null
  smtpPassword?: string | null
  /** true = implicit TLS (typically port 465); false = STARTTLS (typically port 587). */
  smtpSecure?: boolean | null
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
    p_email_provider: input.emailProvider ?? null,
    p_smtp_host: input.smtpHost ?? null,
    p_smtp_port: input.smtpPort ?? null,
    p_smtp_username: input.smtpUsername ?? null,
    p_smtp_password: input.smtpPassword ?? null,
    p_smtp_secure: input.smtpSecure ?? null,
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

// ---------------------------------------------------------------------
// Omnichannel Order Ingestion (0053) — Shopify/WooCommerce/Google
// Sheets connections and the shared ingestion log. Connection secrets
// (access tokens, api secrets, consumer secret, refresh token) are
// write-only from this layer's point of view: get_external_connections()
// never returns them, and upsertExternalConnection()'s inputs are only
// ever sent, never read back.
// ---------------------------------------------------------------------

export async function fetchExternalConnections(brandId: string): Promise<ExternalConnection[]> {
  const { data, error } = await supabase.rpc('get_external_connections', { p_brand_id: brandId })
  if (error) throw error
  return (data ?? []) as ExternalConnection[]
}

export interface UpsertShopifyConnectionInput {
  provider: 'shopify'
  shopifyShopDomain?: string | null
  shopifyAccessToken?: string | null
  shopifyApiSecret?: string | null
}
export interface UpsertWooCommerceConnectionInput {
  provider: 'woocommerce'
  woocommerceStoreUrl?: string | null
  woocommerceConsumerKey?: string | null
  woocommerceConsumerSecret?: string | null
}
export interface UpsertGoogleSheetsConnectionInput {
  provider: 'google_sheets'
  googleSpreadsheetId?: string | null
  googleSheetName?: string | null
  googleColumnMapping?: Record<string, string> | null
  googleHeaderRow?: boolean | null
}
export type UpsertExternalConnectionInput = UpsertShopifyConnectionInput | UpsertWooCommerceConnectionInput | UpsertGoogleSheetsConnectionInput

export async function upsertExternalConnection(brandId: string, input: UpsertExternalConnectionInput): Promise<ExternalConnection> {
  const { data, error } = await supabase
    .rpc('upsert_external_connection', {
      p_brand_id: brandId,
      p_provider: input.provider,
      p_shopify_shop_domain: input.provider === 'shopify' ? (input.shopifyShopDomain ?? null) : null,
      p_shopify_access_token: input.provider === 'shopify' ? (input.shopifyAccessToken ?? null) : null,
      p_shopify_api_secret: input.provider === 'shopify' ? (input.shopifyApiSecret ?? null) : null,
      p_woocommerce_store_url: input.provider === 'woocommerce' ? (input.woocommerceStoreUrl ?? null) : null,
      p_woocommerce_consumer_key: input.provider === 'woocommerce' ? (input.woocommerceConsumerKey ?? null) : null,
      p_woocommerce_consumer_secret: input.provider === 'woocommerce' ? (input.woocommerceConsumerSecret ?? null) : null,
      p_google_spreadsheet_id: input.provider === 'google_sheets' ? (input.googleSpreadsheetId ?? null) : null,
      p_google_sheet_name: input.provider === 'google_sheets' ? (input.googleSheetName ?? null) : null,
      p_google_column_mapping: input.provider === 'google_sheets' ? (input.googleColumnMapping ?? null) : null,
      p_google_header_row: input.provider === 'google_sheets' ? (input.googleHeaderRow ?? null) : null,
    })
    .single()
  if (error) throw error
  return data as ExternalConnection
}

export async function disconnectExternalConnection(connectionId: string): Promise<void> {
  const { error } = await supabase.rpc('disconnect_external_connection', { p_connection_id: connectionId })
  if (error) throw error
}

export async function fetchExternalIngestionHealth(workspaceId: string): Promise<ExternalIngestionHealth> {
  const { data, error } = await supabase.rpc('get_external_ingestion_health', { p_workspace_id: workspaceId }).single()
  if (error) throw error
  return data as ExternalIngestionHealth
}

export async function fetchExternalIngestionLog(
  workspaceId: string,
  status?: string | null,
  limit = 50,
  offset = 0,
): Promise<ExternalOrderIngestionLog[]> {
  const { data, error } = await supabase.rpc('list_external_ingestion_log', {
    p_workspace_id: workspaceId,
    p_status: status ?? null,
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw error
  return (data ?? []) as ExternalOrderIngestionLog[]
}

export async function retryExternalOrderIngestion(logId: string): Promise<ExternalOrderIngestionLog> {
  const { data, error } = await supabase.rpc('retry_external_order_ingestion', { p_log_id: logId }).single()
  if (error) throw error
  return data as ExternalOrderIngestionLog
}

export async function upsertExternalProductMapping(input: {
  connectionId: string
  externalProductId?: string | null
  externalVariantId?: string | null
  externalSku?: string | null
  productId: string
}): Promise<void> {
  const { error } = await supabase.rpc('upsert_external_product_mapping', {
    p_connection_id: input.connectionId,
    p_external_product_id: input.externalProductId ?? null,
    p_external_variant_id: input.externalVariantId ?? null,
    p_external_sku: input.externalSku ?? null,
    p_product_id: input.productId,
  })
  if (error) throw error
}

export const externalConnectionProviderLabel: Record<ExternalConnectionProvider, string> = {
  shopify: 'Shopify',
  woocommerce: 'WooCommerce',
  google_sheets: 'Google Sheets',
}
