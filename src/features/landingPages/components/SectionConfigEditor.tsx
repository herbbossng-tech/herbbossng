import { Plus, Trash2 } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { LandingPageImageField } from '@/features/landingPages/components/LandingPageImageField'
import type {
  BenefitItem,
  BenefitsConfig,
  ComparisonConfig,
  ComparisonRow,
  CtaBannerConfig,
  FaqConfig,
  FaqItem,
  GuaranteeConfig,
  HeroConfig,
  HowItWorksConfig,
  HowItWorksStep,
  ImageTextConfig,
  IngredientItem,
  IngredientsConfig,
  ProblemAwarenessConfig,
  TestimonialsConfig,
  TextConfig,
  Testimonial,
  TrustBadge,
  TrustStripConfig,
} from '@/features/landingPages/sectionTypes'
import type { LandingPageSectionType } from '@/types/database'

interface SectionConfigEditorProps {
  landingPageId: string
  type: LandingPageSectionType
  config: Record<string, unknown>
  onChange: (config: Record<string, unknown>) => void
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function ListEditor<T>({
  items,
  onChange,
  newItem,
  renderItem,
  addLabel,
}: {
  items: T[]
  onChange: (items: T[]) => void
  newItem: T
  renderItem: (item: T, update: (patch: Partial<T>) => void, index: number) => React.ReactNode
  addLabel: string
}) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((item, index) => (
        <div key={index} className="flex items-start gap-2 rounded-lg border border-border p-3">
          <div className="flex-1">{renderItem(item, (patch) => onChange(items.map((it, i) => (i === index ? { ...it, ...patch } : it))), index)}</div>
          <Button type="button" variant="ghost" size="icon" onClick={() => onChange(items.filter((_, i) => i !== index))}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, newItem])} className="self-start">
        <Plus className="h-3.5 w-3.5" />
        {addLabel}
      </Button>
    </div>
  )
}

export function SectionConfigEditor({ landingPageId, type, config, onChange }: SectionConfigEditorProps) {
  const set = (patch: Record<string, unknown>) => onChange({ ...config, ...patch })

  switch (type) {
    case 'HERO': {
      const c = config as unknown as HeroConfig
      return (
        <div className="flex flex-col gap-4">
          <Field label="Headline">
            <Input value={c.headline ?? ''} onChange={(e) => set({ headline: e.target.value })} />
          </Field>
          <Field label="Subheadline">
            <Textarea rows={2} value={c.subheadline ?? ''} onChange={(e) => set({ subheadline: e.target.value })} />
          </Field>
          <LandingPageImageField landingPageId={landingPageId} label="Hero image" value={c.imageUrl} onChange={(url) => set({ imageUrl: url })} />
          <Field label="CTA button label">
            <Input value={c.ctaLabel ?? ''} onChange={(e) => set({ ctaLabel: e.target.value })} />
          </Field>
        </div>
      )
    }
    case 'TRUST_STRIP': {
      const c = config as unknown as TrustStripConfig
      return (
        <ListEditor<TrustBadge>
          items={c.items ?? []}
          onChange={(items) => set({ items })}
          newItem={{ text: '' }}
          addLabel="Add trust badge"
          renderItem={(item, update) => (
            <div className="flex gap-2">
              <Input placeholder="Icon (emoji, optional)" className="w-24" value={item.icon ?? ''} onChange={(e) => update({ icon: e.target.value })} />
              <Input placeholder="e.g. Fast Delivery" value={item.text} onChange={(e) => update({ text: e.target.value })} />
            </div>
          )}
        />
      )
    }
    case 'TEXT': {
      const c = config as unknown as TextConfig
      return (
        <div className="flex flex-col gap-4">
          <Field label="Title (optional)">
            <Input value={c.title ?? ''} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <Field label="Body">
            <Textarea rows={5} value={c.body ?? ''} onChange={(e) => set({ body: e.target.value })} />
          </Field>
        </div>
      )
    }
    case 'IMAGE_TEXT': {
      const c = config as unknown as ImageTextConfig
      return (
        <div className="flex flex-col gap-4">
          <Field label="Title (optional)">
            <Input value={c.title ?? ''} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <Field label="Body">
            <Textarea rows={4} value={c.body ?? ''} onChange={(e) => set({ body: e.target.value })} />
          </Field>
          <LandingPageImageField landingPageId={landingPageId} label="Image" value={c.imageUrl} onChange={(url) => set({ imageUrl: url })} />
          <Field label="Image position">
            <Select value={c.imagePosition ?? 'left'} onValueChange={(v) => set({ imagePosition: v })}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Left</SelectItem>
                <SelectItem value="right">Right</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      )
    }
    case 'BENEFITS': {
      const c = config as unknown as BenefitsConfig
      return (
        <div className="flex flex-col gap-4">
          <Field label="Title">
            <Input value={c.title ?? ''} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <ListEditor<BenefitItem>
            items={c.items ?? []}
            onChange={(items) => set({ items })}
            newItem={{ title: '' }}
            addLabel="Add benefit"
            renderItem={(item, update) => (
              <div className="flex flex-col gap-2">
                <Input placeholder="Benefit title" value={item.title} onChange={(e) => update({ title: e.target.value })} />
                <Textarea rows={2} placeholder="Description (optional)" value={item.description ?? ''} onChange={(e) => update({ description: e.target.value })} />
              </div>
            )}
          />
        </div>
      )
    }
    case 'HOW_IT_WORKS': {
      const c = config as unknown as HowItWorksConfig
      return (
        <div className="flex flex-col gap-4">
          <Field label="Title">
            <Input value={c.title ?? ''} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <ListEditor<HowItWorksStep>
            items={c.steps ?? []}
            onChange={(steps) => set({ steps })}
            newItem={{ title: '' }}
            addLabel="Add step"
            renderItem={(item, update) => (
              <div className="flex flex-col gap-2">
                <Input placeholder="Step title" value={item.title} onChange={(e) => update({ title: e.target.value })} />
                <Textarea rows={2} placeholder="Description (optional)" value={item.description ?? ''} onChange={(e) => update({ description: e.target.value })} />
              </div>
            )}
          />
        </div>
      )
    }
    case 'TESTIMONIALS': {
      const c = config as unknown as TestimonialsConfig
      return (
        <div className="flex flex-col gap-4">
          <Field label="Title">
            <Input value={c.title ?? ''} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <ListEditor<Testimonial>
            items={c.items ?? []}
            onChange={(items) => set({ items })}
            newItem={{ name: '', quote: '' }}
            addLabel="Add testimonial"
            renderItem={(item, update) => (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <Input placeholder="Customer name" value={item.name} onChange={(e) => update({ name: e.target.value })} />
                  <Input placeholder="Location (optional)" value={item.location ?? ''} onChange={(e) => update({ location: e.target.value })} />
                </div>
                <Textarea rows={2} placeholder="Quote" value={item.quote} onChange={(e) => update({ quote: e.target.value })} />
              </div>
            )}
          />
        </div>
      )
    }
    case 'FAQ': {
      const c = config as unknown as FaqConfig
      return (
        <div className="flex flex-col gap-4">
          <Field label="Title">
            <Input value={c.title ?? ''} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <ListEditor<FaqItem>
            items={c.items ?? []}
            onChange={(items) => set({ items })}
            newItem={{ question: '', answer: '' }}
            addLabel="Add question"
            renderItem={(item, update) => (
              <div className="flex flex-col gap-2">
                <Input placeholder="Question" value={item.question} onChange={(e) => update({ question: e.target.value })} />
                <Textarea rows={2} placeholder="Answer" value={item.answer} onChange={(e) => update({ answer: e.target.value })} />
              </div>
            )}
          />
        </div>
      )
    }
    case 'CTA_BANNER': {
      const c = config as unknown as CtaBannerConfig
      return (
        <div className="flex flex-col gap-4">
          <Field label="Headline">
            <Input value={c.headline ?? ''} onChange={(e) => set({ headline: e.target.value })} />
          </Field>
          <Field label="Button label">
            <Input value={c.buttonLabel ?? ''} onChange={(e) => set({ buttonLabel: e.target.value })} />
          </Field>
        </div>
      )
    }
    case 'PACKAGE_SELECTOR':
      return (
        <div className="flex flex-col gap-4">
          <Field label="Title">
            <Input value={(config.title as string) ?? ''} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <Field label="Subtitle (optional)">
            <Input value={(config.subtitle as string) ?? ''} onChange={(e) => set({ subtitle: e.target.value })} />
          </Field>
          <p className="text-xs text-muted-foreground">Packages themselves are managed on the Packages tab.</p>
        </div>
      )
    case 'ORDER_FORM':
      return (
        <div className="flex flex-col gap-4">
          <Field label="Title">
            <Input value={(config.title as string) ?? ''} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <p className="text-xs text-muted-foreground">Which fields are collected is controlled on the Settings tab.</p>
        </div>
      )
    case 'PROBLEM_AWARENESS': {
      const c = config as unknown as ProblemAwarenessConfig
      return (
        <div className="flex flex-col gap-4">
          <Field label="Headline">
            <Input value={c.headline ?? ''} onChange={(e) => set({ headline: e.target.value })} />
          </Field>
          <Field label="Body">
            <Textarea rows={4} value={c.body ?? ''} onChange={(e) => set({ body: e.target.value })} />
          </Field>
        </div>
      )
    }
    case 'INGREDIENTS': {
      const c = config as unknown as IngredientsConfig
      return (
        <div className="flex flex-col gap-4">
          <Field label="Headline">
            <Input value={c.headline ?? ''} onChange={(e) => set({ headline: e.target.value })} />
          </Field>
          <ListEditor<IngredientItem>
            items={c.items ?? []}
            onChange={(items) => set({ items })}
            newItem={{ name: '' }}
            addLabel="Add ingredient"
            renderItem={(item, update) => (
              <div className="flex flex-col gap-2">
                <Input placeholder="Ingredient name" value={item.name} onChange={(e) => update({ name: e.target.value })} />
                <Textarea rows={2} placeholder="Role / description (optional)" value={item.description ?? ''} onChange={(e) => update({ description: e.target.value })} />
              </div>
            )}
          />
        </div>
      )
    }
    case 'COMPARISON': {
      const c = config as unknown as ComparisonConfig
      return (
        <div className="flex flex-col gap-4">
          <Field label="Headline">
            <Input value={c.headline ?? ''} onChange={(e) => set({ headline: e.target.value })} />
          </Field>
          <ListEditor<ComparisonRow>
            items={c.rows ?? []}
            onChange={(rows) => set({ rows })}
            newItem={{ label: '', us: '', them: '' }}
            addLabel="Add comparison row"
            renderItem={(item, update) => (
              <div className="flex flex-col gap-2">
                <Input placeholder="Row label (e.g. Ingredients)" value={item.label} onChange={(e) => update({ label: e.target.value })} />
                <div className="flex gap-2">
                  <Input placeholder="Us" value={item.us} onChange={(e) => update({ us: e.target.value })} />
                  <Input placeholder="Others" value={item.them} onChange={(e) => update({ them: e.target.value })} />
                </div>
              </div>
            )}
          />
        </div>
      )
    }
    case 'GUARANTEE': {
      const c = config as unknown as GuaranteeConfig
      return (
        <div className="flex flex-col gap-4">
          <Field label="Headline">
            <Input value={c.headline ?? ''} onChange={(e) => set({ headline: e.target.value })} />
          </Field>
          <Field label="Body">
            <Textarea rows={3} value={c.body ?? ''} onChange={(e) => set({ body: e.target.value })} />
          </Field>
        </div>
      )
    }
    default:
      return null
  }
}
