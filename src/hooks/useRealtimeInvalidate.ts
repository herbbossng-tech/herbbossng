import { useQueryClient } from '@tanstack/react-query'
import * as React from 'react'

import { supabase } from '@/lib/supabase'

/**
 * Generic best-effort Realtime subscription: watches INSERT/UPDATE on
 * `table` for the given workspace and invalidates the given query keys
 * so a list/detail view updates without a manual refresh. Same pattern
 * as useNotificationsRealtime() (0023) — reused rather than
 * reinvented — extended here to the additional tables migration 0032
 * added to the supabase_realtime publication (orders, order_tasks,
 * delivery_attempts, waybills, order_settlements, automation_executions,
 * communication_log, tracking_dispatch_log).
 *
 * Security: Supabase's postgres_changes protocol enforces each
 * subscriber's own RLS SELECT policies — a user only ever receives
 * change events for rows they could already SELECT. The `filter` here
 * is a performance narrowing, not the security boundary; workspace/
 * brand isolation comes from the table's existing RLS, unchanged by
 * this hook.
 *
 * Whether events actually arrive can only be verified against a live
 * Supabase project (this sandbox cannot reach one) — if Realtime is
 * disabled or unreachable, normal query invalidation on mutations and
 * any polling the caller also uses keep data correct, just not instant.
 */
export function useRealtimeInvalidate(table: string, workspaceId: string | undefined, queryKeys: readonly (readonly unknown[])[]) {
  const queryClient = useQueryClient()

  React.useEffect(() => {
    if (!workspaceId) return

    const channel = supabase
      .channel(`${table}-${workspaceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `workspace_id=eq.${workspaceId}` },
        () => {
          for (const key of queryKeys) {
            queryClient.invalidateQueries({ queryKey: key as unknown[] })
          }
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, workspaceId])
}
