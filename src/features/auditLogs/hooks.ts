import { useQuery } from '@tanstack/react-query'

import { useWorkspace } from '@/contexts/WorkspaceContext'

import { fetchAuditLogs, type AuditLogFilters } from './api'

export function useAuditLogs(filters: AuditLogFilters) {
  const { activeWorkspace } = useWorkspace()
  return useQuery({
    queryKey: ['audit-logs', activeWorkspace.id, filters],
    queryFn: () => fetchAuditLogs(activeWorkspace.id, filters),
    enabled: Boolean(activeWorkspace.id),
    placeholderData: (prev) => prev,
  })
}
