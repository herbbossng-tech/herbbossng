"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { assertAccess } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { formValuesToContent, defaultContentFor } from "@/lib/section-content";
import type { SectionType } from "@/app/generated/prisma/enums";

const pageSchema = z.object({
  productId: z.string().min(1),
  officeId: z.string().optional(),
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/),
  title: z.string().min(2),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  ogImageUrl: z.string().optional(),
  stickyCtaText: z.string().optional(),
});

export async function createLandingPage(formData: FormData) {
  const session = await requireSession();
  assertAccess(session, "landing_pages");
  const raw = Object.fromEntries(formData.entries());
  const data = pageSchema.parse(raw);

  const page = await prisma.landingPage.create({
    data: {
      ...data,
      officeId: data.officeId || null,
      sections: {
        create: [
          { type: "HERO", sortOrder: 0, content: defaultContentFor("HERO") },
          { type: "ORDER", sortOrder: 1, content: { title: "Select your package" } },
        ],
      },
    },
  });

  await recordAudit({ userId: session.userId, action: "landing_page.create", resource: "LandingPage", resourceId: page.id, after: page });
  revalidatePath("/admin/landing-pages");
  redirect(`/admin/landing-pages/${page.id}`);
}

export async function updateLandingPageMeta(pageId: string, formData: FormData) {
  const session = await requireSession();
  assertAccess(session, "landing_pages");
  const raw = Object.fromEntries(formData.entries());
  const data = pageSchema.parse(raw);

  const page = await prisma.landingPage.update({
    where: { id: pageId },
    data: { ...data, officeId: data.officeId || null },
  });

  await recordAudit({ userId: session.userId, action: "landing_page.update", resource: "LandingPage", resourceId: pageId, after: page });
  revalidatePath(`/admin/landing-pages/${pageId}`);
  revalidatePath(`/${page.slug}`);
}

export async function setLandingPageStatus(pageId: string, status: "DRAFT" | "PUBLISHED" | "ARCHIVED") {
  const session = await requireSession();
  assertAccess(session, "landing_pages");
  const page = await prisma.landingPage.update({
    where: { id: pageId },
    data: { status, publishedAt: status === "PUBLISHED" ? new Date() : undefined },
  });
  await recordAudit({ userId: session.userId, action: `landing_page.${status.toLowerCase()}`, resource: "LandingPage", resourceId: pageId });
  revalidatePath(`/admin/landing-pages/${pageId}`);
  revalidatePath(`/${page.slug}`);
}

export async function duplicateLandingPage(pageId: string) {
  const session = await requireSession();
  assertAccess(session, "landing_pages");
  const original = await prisma.landingPage.findUniqueOrThrow({ where: { id: pageId }, include: { sections: true } });

  const copy = await prisma.landingPage.create({
    data: {
      productId: original.productId,
      officeId: original.officeId,
      slug: `${original.slug}-copy-${Date.now().toString(36)}`,
      title: `${original.title} (Copy)`,
      status: "DRAFT",
      seoTitle: original.seoTitle,
      seoDescription: original.seoDescription,
      ogImageUrl: original.ogImageUrl,
      stickyCtaText: original.stickyCtaText,
      sections: {
        create: original.sections.map((s) => ({
          type: s.type,
          sortOrder: s.sortOrder,
          isEnabled: s.isEnabled,
          content: s.content ?? {},
        })),
      },
    },
  });

  await recordAudit({ userId: session.userId, action: "landing_page.duplicate", resource: "LandingPage", resourceId: copy.id, after: { from: pageId } });
  revalidatePath("/admin/landing-pages");
  redirect(`/admin/landing-pages/${copy.id}`);
}

export async function addSection(pageId: string, formData: FormData) {
  const session = await requireSession();
  assertAccess(session, "landing_pages");
  const type = formData.get("type") as SectionType;
  const maxOrder = await prisma.landingPageSection.aggregate({ where: { landingPageId: pageId }, _max: { sortOrder: true } });

  const section = await prisma.landingPageSection.create({
    data: {
      landingPageId: pageId,
      type,
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      content: defaultContentFor(type),
    },
  });

  await recordAudit({ userId: session.userId, action: "landing_page_section.create", resource: "LandingPageSection", resourceId: section.id, after: section });
  revalidatePath(`/admin/landing-pages/${pageId}`);
}

export async function updateSectionContent(pageId: string, sectionId: string, sectionType: SectionType, formData: FormData) {
  const session = await requireSession();
  assertAccess(session, "landing_pages");
  const raw = Object.fromEntries(formData.entries()) as Record<string, string>;
  const content = formValuesToContent(sectionType, raw);

  await prisma.landingPageSection.update({ where: { id: sectionId }, data: { content } });
  await recordAudit({ userId: session.userId, action: "landing_page_section.update", resource: "LandingPageSection", resourceId: sectionId, after: content });
  revalidatePath(`/admin/landing-pages/${pageId}`);
  const page = await prisma.landingPage.findUnique({ where: { id: pageId } });
  if (page) revalidatePath(`/${page.slug}`);
}

export async function toggleSection(pageId: string, sectionId: string, isEnabled: boolean) {
  const session = await requireSession();
  assertAccess(session, "landing_pages");
  await prisma.landingPageSection.update({ where: { id: sectionId }, data: { isEnabled } });
  await recordAudit({ userId: session.userId, action: "landing_page_section.toggle", resource: "LandingPageSection", resourceId: sectionId, after: { isEnabled } });
  revalidatePath(`/admin/landing-pages/${pageId}`);
}

export async function deleteSection(pageId: string, sectionId: string) {
  const session = await requireSession();
  assertAccess(session, "landing_pages");
  await prisma.landingPageSection.delete({ where: { id: sectionId } });
  await recordAudit({ userId: session.userId, action: "landing_page_section.delete", resource: "LandingPageSection", resourceId: sectionId });
  revalidatePath(`/admin/landing-pages/${pageId}`);
}

export async function moveSection(pageId: string, sectionId: string, direction: "up" | "down") {
  const session = await requireSession();
  assertAccess(session, "landing_pages");
  const sections = await prisma.landingPageSection.findMany({ where: { landingPageId: pageId }, orderBy: { sortOrder: "asc" } });
  const index = sections.findIndex((s) => s.id === sectionId);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swapWith < 0 || swapWith >= sections.length) return;

  const a = sections[index];
  const b = sections[swapWith];
  await prisma.$transaction([
    prisma.landingPageSection.update({ where: { id: a.id }, data: { sortOrder: b.sortOrder } }),
    prisma.landingPageSection.update({ where: { id: b.id }, data: { sortOrder: a.sortOrder } }),
  ]);
  await recordAudit({ userId: session.userId, action: "landing_page_section.reorder", resource: "LandingPageSection", resourceId: sectionId });
  revalidatePath(`/admin/landing-pages/${pageId}`);
}
