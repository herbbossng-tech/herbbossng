import { ArrowDown, ArrowUp, Copy, Layers, Loader2, Plus, Settings2, Trash2 } from 'lucide-react'
import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState, LoadingState } from '@/components/ui/state'
import { Switch } from '@/components/ui/switch'
import { SectionConfigEditor } from '@/features/landingPages/components/SectionConfigEditor'
import {
  useCreateSection,
  useDeleteSection,
  useDuplicateSection,
  useLandingPageSections,
  useReorderSections,
  useUpdateSection,
} from '@/features/landingPages/hooks'
import { sectionTypeLabels, singletonSectionTypes } from '@/features/landingPages/sectionTypes'
import type { LandingPageSection, LandingPageSectionType } from '@/types/database'

export function SectionsManager({ landingPageId }: { landingPageId: string }) {
  const { data: sections, isLoading } = useLandingPageSections(landingPageId)
  const createSection = useCreateSection(landingPageId)
  const updateSection = useUpdateSection(landingPageId)
  const deleteSection = useDeleteSection(landingPageId)
  const duplicateSection = useDuplicateSection(landingPageId)
  const reorderSections = useReorderSections(landingPageId)

  const [editingSection, setEditingSection] = React.useState<LandingPageSection | null>(null)
  const [draftConfig, setDraftConfig] = React.useState<Record<string, unknown>>({})
  const [addType, setAddType] = React.useState<string>('')

  const sortedSections = [...(sections ?? [])].sort((a, b) => a.position - b.position)
  const existingTypes = new Set(sortedSections.map((s) => s.type))
  const availableTypes = Object.keys(sectionTypeLabels).filter(
    (t) => !singletonSectionTypes.includes(t as LandingPageSectionType) || !existingTypes.has(t as LandingPageSectionType),
  ) as LandingPageSectionType[]

  function openEditor(section: LandingPageSection) {
    setEditingSection(section)
    setDraftConfig((section.config as Record<string, unknown>) ?? {})
  }

  async function saveEditor() {
    if (!editingSection) return
    await updateSection.mutateAsync({ id: editingSection.id, config: draftConfig })
    setEditingSection(null)
  }

  async function addSection() {
    if (!addType) return
    await createSection.mutateAsync({ type: addType as LandingPageSectionType, position: sortedSections.length })
    setAddType('')
  }

  async function move(section: LandingPageSection, direction: -1 | 1) {
    const index = sortedSections.findIndex((s) => s.id === section.id)
    const swapIndex = index + direction
    if (swapIndex < 0 || swapIndex >= sortedSections.length) return
    const other = sortedSections[swapIndex]
    await reorderSections.mutateAsync([
      { id: section.id, position: other.position },
      { id: other.id, position: section.position },
    ])
  }

  if (isLoading) return <LoadingState label="Loading sections…" />

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Select value={addType} onValueChange={setAddType}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Choose a section type…" />
          </SelectTrigger>
          <SelectContent>
            {availableTypes.map((t) => (
              <SelectItem key={t} value={t}>
                {sectionTypeLabels[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" size="sm" disabled={!addType || createSection.isPending} onClick={addSection}>
          {createSection.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Add Section
        </Button>
      </div>

      {sortedSections.length === 0 && (
        <EmptyState icon={Layers} title="No sections yet" description="Add your first section above to start building the page." />
      )}

      <div className="flex flex-col gap-2">
        {sortedSections.map((section, index) => (
          <Card key={section.id} className={!section.enabled ? 'opacity-60' : undefined}>
            <CardContent className="flex items-center gap-3 p-3">
              <div className="flex flex-col gap-0.5">
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6" disabled={index === 0} onClick={() => move(section, -1)}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  disabled={index === sortedSections.length - 1}
                  onClick={() => move(section, 1)}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Badge variant="secondary" className="shrink-0">
                {sectionTypeLabels[section.type]}
              </Badge>
              <div className="flex-1" />
              <Switch checked={section.enabled} onCheckedChange={(checked) => updateSection.mutate({ id: section.id, enabled: checked })} />
              <Button type="button" variant="ghost" size="icon" onClick={() => openEditor(section)}>
                <Settings2 className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" onClick={() => duplicateSection.mutate(section)}>
                <Copy className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" onClick={() => deleteSection.mutate(section.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!editingSection} onOpenChange={(open) => !open && setEditingSection(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit {editingSection && sectionTypeLabels[editingSection.type]}</DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-6">
            {editingSection && (
              <SectionConfigEditor landingPageId={landingPageId} type={editingSection.type} config={draftConfig} onChange={setDraftConfig} />
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditingSection(null)}>
                Cancel
              </Button>
              <Button type="button" onClick={saveEditor} disabled={updateSection.isPending}>
                {updateSection.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
