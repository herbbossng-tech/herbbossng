import { supabase } from '@/lib/supabase'
import type { CommunicationChannel, CommunicationLog, CommunicationTemplateChannel, EmailTemplate, RenderedCommunicationTemplate } from '@/types/database'

export async function fetchCommunicationTemplates(workspaceId: string, brandId?: string | null): Promise<EmailTemplate[]> {
  const { data, error } = await supabase.rpc('list_communication_templates', { p_workspace_id: workspaceId, p_brand_id: brandId ?? null })
  if (error) throw error
  return (data ?? []) as EmailTemplate[]
}

export interface UpsertCommunicationTemplateInput {
  workspaceId: string
  brandId: string | null
  key: string
  name: string
  channel: CommunicationTemplateChannel
  subject: string | null
  htmlBody: string
  variables: string[]
}

export async function upsertCommunicationTemplate(input: UpsertCommunicationTemplateInput): Promise<EmailTemplate> {
  const { data, error } = await supabase
    .rpc('upsert_communication_template', {
      p_workspace_id: input.workspaceId,
      p_brand_id: input.brandId,
      p_key: input.key,
      p_name: input.name,
      p_channel: input.channel,
      p_subject: input.subject,
      p_html_body: input.htmlBody,
      p_variables: input.variables,
    })
    .single()
  if (error) throw error
  return data as EmailTemplate
}

export async function setCommunicationTemplateActive(id: string, active: boolean): Promise<EmailTemplate> {
  const { data, error } = await supabase.rpc('set_communication_template_active', { p_id: id, p_active: active }).single()
  if (error) throw error
  return data as EmailTemplate
}

export async function previewCommunicationTemplate(
  workspaceId: string,
  brandId: string | null,
  key: string,
  channel: CommunicationTemplateChannel,
  variables: Record<string, string>,
): Promise<RenderedCommunicationTemplate> {
  const { data, error } = await supabase
    .rpc('preview_communication_template', { p_workspace_id: workspaceId, p_brand_id: brandId, p_key: key, p_channel: channel, p_variables: variables })
    .single()
  if (error) throw error
  return data as RenderedCommunicationTemplate
}

export async function sendManualCommunication(input: {
  orderId: string
  channel: CommunicationChannel
  templateKey?: string | null
  subject?: string | null
  body?: string | null
}): Promise<CommunicationLog> {
  const { data, error } = await supabase
    .rpc('send_manual_communication', {
      p_order_id: input.orderId,
      p_channel: input.channel,
      p_template_key: input.templateKey ?? null,
      p_subject: input.subject ?? null,
      p_body: input.body ?? null,
    })
    .single()
  if (error) throw error
  return data as CommunicationLog
}

export async function testCommunicationProvider(brandId: string, channel: CommunicationChannel, testRecipient: string): Promise<CommunicationLog> {
  const { data, error } = await supabase
    .rpc('test_communication_provider', { p_brand_id: brandId, p_channel: channel, p_test_recipient: testRecipient })
    .single()
  if (error) throw error
  return data as CommunicationLog
}
