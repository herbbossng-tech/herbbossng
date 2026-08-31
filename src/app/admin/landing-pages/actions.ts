'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { requireSession, logAudit } from '@/lib/require-session';
import { SECTION_PLACEHOLDERS } from '@/types/landing-sections';
import type { LandingPageSectionType } from '@prisma/client';

const pageSchema = z.object({
  productId: z.string().min(1),
  officeId: z.string().optional(),
  slug: z.string().min(1).transform((s) => s.toLowerCase().replace(/[^a-z0-9-]+/g, '-')),
  title: z.string().min(1),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
});

export async function createLandingPage(formData: FormData) {
  const session = await requireSession('landing-pages');
  const data = pageSchema.parse(Object.fromEntries(formData.entries()));

  const page = await db.landingPage.create({
    data: {
      productId: data.productId,
      officeId: data.officeId || null,
      slug: data.slug,
      title: data.title,
      seoTitle: data.seoTitle || null,
      seoDescription: data.seoDescription || null,
      status: 'DRAFT',
      sections: {
        create: (
          ['ANNOUNCEMENT_BAR', 'HERO', 'TRUST_BADGES', 'PROBLEM', 'FORMULA', 'HOW_IT_WORKS', 'BENEFITS', 'COMPARISON', 'TESTIMONIALS', 'GUARANTEE', 'FAQ', 'ORDER', 'FOOTER'] as LandingPageSectionType[]
        ).map((type, i) => ({ type, sortOrder: i, data: SECTION_PLACEHOLDERS[type] as never })),
      },
    },
  });

  await logAudit({ userId: session.user.id, action: 'CREATE', resource: 'LandingPage', resourceId: page.id, after: data });
  revalidatePath('/admin/landing-pages');
  redirect(`/admin/landing-pages/${page.id}`);
}

export async function updateLandingPageMeta(pageId: string, formData: FormData) {
  const session = await requireSession('landing-pages');
  const data = pageSchema.omit({ productId: true }).partial({ officeId: true }).parse(Object.fromEntries(formData.entries()));
  await db.landingPage.update({
    where: { id: pageId },
    data: { slug: data.slug, title: data.title, seoTitle: data.seoTitle || null, seoDescription: data.seoDescription || null, officeId: data.officeId || null },
  });
  await logAudit({ userId: session.user.id, action: 'UPDATE', resource: 'LandingPage', resourceId: pageId, after: data });
  revalidatePath(`/admin/landing-pages/${pageId}`);
}

export async function setLandingPageStatus(pageId: string, status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED') {
  const session = await requireSession('landing-pages');
  await db.landingPage.update({ where: { id: pageId }, data: { status, publishedAt: status === 'PUBLISHED' ? new Date() : undefined } });
  await logAudit({ userId: session.user.id, action: status === 'PUBLISHED' ? 'PUBLISH' : 'UPDATE', resource: 'LandingPage', resourceId: pageId, after: { status } });
  revalidatePath('/admin/landing-pages');
  revalidatePath(`/admin/landing-pages/${pageId}`);
}

export async function duplicateLandingPage(pageId: string) {
  const session = await requireSession('landing-pages');
  const original = await db.landingPage.findUniqueOrThrow({ where: { id: pageId }, include: { sections: true } });
  const copy = await db.landingPage.create({
    data: {
      productId: original.productId,
      officeId: original.officeId,
      slug: `${original.slug}-copy-${Date.now().toString().slice(-4)}`,
      title: `${original.title} (Copy)`,
      status: 'DRAFT',
      seoTitle: original.seoTitle,
      seoDescription: original.seoDescription,
      sections: { create: original.sections.map((s) => ({ type: s.type, isEnabled: s.isEnabled, sortOrder: s.sortOrder, data: s.data as never })) },
    },
  });
  await logAudit({ userId: session.user.id, action: 'DUPLICATE', resource: 'LandingPage', resourceId: copy.id, before: { sourceId: pageId } });
  revalidatePath('/admin/landing-pages');
  redirect(`/admin/landing-pages/${copy.id}`);
}

export async function updateSectionData(sectionId: string, formData: FormData) {
  const session = await requireSession('landing-pages');
  const json = String(formData.get('data') ?? '{}');
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Invalid JSON in section data');
  }
  const section = await db.landingPageSection.update({ where: { id: sectionId }, data: { data: parsed as never } });
  await logAudit({ userId: session.user.id, action: 'UPDATE', resource: 'LandingPageSection', resourceId: sectionId, after: parsed });
  revalidatePath(`/admin/landing-pages/${section.landingPageId}`);
}

export async function toggleSection(sectionId: string, landingPageId: string, isEnabled: boolean) {
  const session = await requireSession('landing-pages');
  await db.landingPageSection.update({ where: { id: sectionId }, data: { isEnabled } });
  await logAudit({ userId: session.user.id, action: 'UPDATE', resource: 'LandingPageSection', resourceId: sectionId, after: { isEnabled } });
  revalidatePath(`/admin/landing-pages/${landingPageId}`);
}

export async function moveSection(sectionId: string, landingPageId: string, direction: 'up' | 'down') {
  const session = await requireSession('landing-pages');
  const sections = await db.landingPageSection.findMany({ where: { landingPageId }, orderBy: { sortOrder: 'asc' } });
  const idx = sections.findIndex((s) => s.id === sectionId);
  const swapWith = direction === 'up' ? idx - 1 : idx + 1;
  if (idx === -1 || swapWith < 0 || swapWith >= sections.length) return;

  const a = sections[idx];
  const b = sections[swapWith];
  await db.$transaction([
    db.landingPageSection.update({ where: { id: a.id }, data: { sortOrder: b.sortOrder } }),
    db.landingPageSection.update({ where: { id: b.id }, data: { sortOrder: a.sortOrder } }),
  ]);
  await logAudit({ userId: session.user.id, action: 'REORDER', resource: 'LandingPageSection', resourceId: sectionId });
  revalidatePath(`/admin/landing-pages/${landingPageId}`);
}

export async function addSection(landingPageId: string, type: LandingPageSectionType) {
  const session = await requireSession('landing-pages');
  const maxOrder = await db.landingPageSection.aggregate({ where: { landingPageId }, _max: { sortOrder: true } });
  const section = await db.landingPageSection.create({
    data: { landingPageId, type, sortOrder: (maxOrder._max.sortOrder ?? 0) + 1, data: SECTION_PLACEHOLDERS[type] as never },
  });
  await logAudit({ userId: session.user.id, action: 'CREATE', resource: 'LandingPageSection', resourceId: section.id, after: { type } });
  revalidatePath(`/admin/landing-pages/${landingPageId}`);
}

export async function deleteSection(sectionId: string, landingPageId: string) {
  const session = await requireSession('landing-pages');
  await db.landingPageSection.delete({ where: { id: sectionId } });
  await logAudit({ userId: session.user.id, action: 'DELETE', resource: 'LandingPageSection', resourceId: sectionId });
  revalidatePath(`/admin/landing-pages/${landingPageId}`);
}
