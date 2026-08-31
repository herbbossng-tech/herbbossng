import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { PageHeader, Card, Badge, Input, Label, Select, Textarea, Button, LinkButton } from '@/components/ui';
import {
  updateLandingPageMeta,
  setLandingPageStatus,
  duplicateLandingPage,
  updateSectionData,
  toggleSection,
  moveSection,
  addSection,
  deleteSection,
} from '../actions';

const SECTION_TYPES = [
  'ANNOUNCEMENT_BAR', 'HERO', 'TRUST_BADGES', 'PROBLEM', 'FORMULA', 'HOW_IT_WORKS',
  'BENEFITS', 'COMPARISON', 'TESTIMONIALS', 'GUARANTEE', 'FAQ', 'ORDER', 'FOOTER', 'CUSTOM',
] as const;

export default async function LandingPageDetailPage({ params }: { params: { id: string } }) {
  const [page, offices] = await Promise.all([
    db.landingPage.findUnique({ where: { id: params.id }, include: { sections: { orderBy: { sortOrder: 'asc' } } } }),
    db.office.findMany({ orderBy: { sortOrder: 'asc' } }),
  ]);
  if (!page) notFound();

  const previewUrl = `/${page.slug}${page.officeId ? `?office=${(offices.find((o) => o.id === page.officeId)?.countryCode ?? '').toLowerCase()}` : ''}`;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <PageHeader
          title={page.title}
          description={`/${page.slug}`}
          action={
            <div className="flex flex-wrap gap-2">
              <LinkButton href={previewUrl} variant="secondary">Preview</LinkButton>
              <form action={duplicateLandingPage.bind(null, page.id)}>
                <Button type="submit" variant="secondary">Duplicate</Button>
              </form>
              {page.status !== 'PUBLISHED' ? (
                <form action={setLandingPageStatus.bind(null, page.id, 'PUBLISHED')}>
                  <Button type="submit">Publish</Button>
                </form>
              ) : (
                <form action={setLandingPageStatus.bind(null, page.id, 'DRAFT')}>
                  <Button type="submit" variant="secondary">Unpublish</Button>
                </form>
              )}
              <form action={setLandingPageStatus.bind(null, page.id, 'ARCHIVED')}>
                <Button type="submit" variant="danger">Archive</Button>
              </form>
            </div>
          }
        />
        <Card>
          <form action={updateLandingPageMeta.bind(null, page.id)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label required>Title</Label>
              <Input name="title" defaultValue={page.title} required />
            </div>
            <div>
              <Label required>Slug</Label>
              <Input name="slug" defaultValue={page.slug} required />
            </div>
            <div>
              <Label>Office</Label>
              <Select name="officeId" defaultValue={page.officeId ?? ''}>
                <option value="">All offices</option>
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </Select>
            </div>
            <div className="flex items-end">
              <Badge tone={page.status === 'PUBLISHED' ? 'success' : 'warning'}>{page.status}</Badge>
            </div>
            <div>
              <Label>SEO title</Label>
              <Input name="seoTitle" defaultValue={page.seoTitle ?? ''} />
            </div>
            <div>
              <Label>SEO description</Label>
              <Input name="seoDescription" defaultValue={page.seoDescription ?? ''} />
            </div>
            <div className="col-span-full">
              <Button type="submit" variant="secondary">Save page settings</Button>
            </div>
          </form>
        </Card>
      </div>

      <div>
        <PageHeader title="Sections" description="Enable/disable, reorder, and edit each section's content as structured JSON." />
        <div className="flex flex-col gap-4">
          {page.sections.map((section, i) => (
            <Card key={section.id}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-brand-dark">{section.type.replaceAll('_', ' ')}</p>
                  <Badge tone={section.isEnabled ? 'success' : 'neutral'}>{section.isEnabled ? 'Enabled' : 'Disabled'}</Badge>
                </div>
                <div className="flex gap-2 text-xs">
                  <form action={moveSection.bind(null, section.id, page.id, 'up')}>
                    <button disabled={i === 0} className="rounded border border-brand-dark/15 px-2 py-1 disabled:opacity-30">↑</button>
                  </form>
                  <form action={moveSection.bind(null, section.id, page.id, 'down')}>
                    <button disabled={i === page.sections.length - 1} className="rounded border border-brand-dark/15 px-2 py-1 disabled:opacity-30">↓</button>
                  </form>
                  <form action={toggleSection.bind(null, section.id, page.id, !section.isEnabled)}>
                    <button className="rounded border border-brand-dark/15 px-2 py-1">{section.isEnabled ? 'Disable' : 'Enable'}</button>
                  </form>
                  <form action={deleteSection.bind(null, section.id, page.id)}>
                    <button className="rounded border border-red-200 px-2 py-1 text-red-600">Delete</button>
                  </form>
                </div>
              </div>
              {section.type === 'ORDER' ? (
                <p className="text-xs text-brand-dark/50">
                  Product, offers and pricing are pulled live from this page&apos;s product — only the section title/subtitle/sticky CTA text are editable here.
                </p>
              ) : null}
              <form action={updateSectionData.bind(null, section.id)} className="mt-2 flex flex-col gap-2">
                <Textarea name="data" defaultValue={JSON.stringify(section.data, null, 2)} rows={8} className="font-mono text-xs" />
                <Button type="submit" variant="secondary" className="self-start">Save section</Button>
              </form>
            </Card>
          ))}
        </div>

        <Card className="mt-4">
          <form action={async (formData: FormData) => {
            'use server';
            const type = formData.get('type') as (typeof SECTION_TYPES)[number];
            await addSection(page.id, type);
          }} className="flex gap-2">
            <Select name="type" defaultValue="CUSTOM" className="max-w-xs">
              {SECTION_TYPES.map((t) => (
                <option key={t} value={t}>{t.replaceAll('_', ' ')}</option>
              ))}
            </Select>
            <Button type="submit" variant="secondary">Add section</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
