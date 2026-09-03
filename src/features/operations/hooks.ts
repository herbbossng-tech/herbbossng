import { useQuery } from '@tanstack/react-query'

import { useWorkspace } from '@/contexts/WorkspaceContext'

import { fetchOperationsSummary, fetchRescueBoard } from './api'

export function useOperationsSummary() {
  const { activeWorkspace, activeBrand } = useWorkspace()
  return useQuery({
    queryKey: ['operations-summary', activeWorkspace.id, activeBrand?.id ?? null],
    queryFn: () => fetchOperationsSummary(activeWorkspace.id, activeBrand?.id ?? null),
    enabled: Boolean(activeWorkspace.id),
  })
}

export function useRescueBoard() {
  const { activeWorkspace, activeBrand } = useWorkspace()
  return useQuery({
    queryKey: ['rescue-board', activeWorkspace.id, activeBrand?.id ?? null],
    queryFn: () => fetchRescueBoard(activeWorkspace.id, activeBrand?.id ?? null),
    enabled: Boolean(activeWorkspace.id),
  })
}
