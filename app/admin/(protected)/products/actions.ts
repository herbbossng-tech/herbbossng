"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { assertAccess } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { linesToArray, linesToIngredients, linesToFaq } from "@/lib/list-format";

const productSchema = z.object({
  name: z.string().min(2),
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers and hyphens only"),
  sku: z.string().min(2),
  category: z.string().optional(),
  brand: z.string().optional(),
  shortDescription: z.string().optional(),
  longDescription: z.string().optional(),
  benefits: z.string().optional(),
  ingredients: z.string().optional(),
  faq: z.string().optional(),
  guarantee: z.string().optional(),
  deliveryInfo: z.string().optional(),
  disclaimer: z.string().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  ogImageUrl: z.string().optional(),
  heroImageUrl: z.string().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
});

function parse(formData: FormData) {
  const raw = Object.fromEntries(formData.entries()) as Record<string, string>;
  const data = productSchema.parse(raw);
  return {
    ...data,
    benefits: linesToArray(raw.benefits),
    ingredients: linesToIngredients(raw.ingredients),
    faq: linesToFaq(raw.faq),
  };
}

export async function createProduct(formData: FormData) {
  const session = await requireSession();
  assertAccess(session, "products");
  const data = parse(formData);

  const product = await prisma.product.create({ data });
  await recordAudit({ userId: session.userId, action: "product.create", resource: "Product", resourceId: product.id, after: product });

  revalidatePath("/admin/products");
  redirect(`/admin/products/${product.id}`);
}

export async function updateProduct(productId: string, formData: FormData) {
  const session = await requireSession();
  assertAccess(session, "products");
  const data = parse(formData);
  const before = await prisma.product.findUniqueOrThrow({ where: { id: productId } });

  const product = await prisma.product.update({ where: { id: productId }, data });
  await recordAudit({ userId: session.userId, action: "product.update", resource: "Product", resourceId: product.id, before, after: product });

  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${productId}`);
}

export async function archiveProduct(productId: string) {
  const session = await requireSession();
  assertAccess(session, "products");
  await prisma.product.update({ where: { id: productId }, data: { status: "ARCHIVED" } });
  await recordAudit({ userId: session.userId, action: "product.archive", resource: "Product", resourceId: productId });
  revalidatePath("/admin/products");
}

export async function duplicateProduct(productId: string) {
  const session = await requireSession();
  assertAccess(session, "products");
  const original = await prisma.product.findUniqueOrThrow({
    where: { id: productId },
    include: { offices: true, offers: { include: { officePricing: true } } },
  });

  const copy = await prisma.product.create({
    data: {
      name: `${original.name} (Copy)`,
      slug: `${original.slug}-copy-${Date.now().toString(36)}`,
      sku: `${original.sku}-COPY-${Date.now().toString(36)}`.toUpperCase(),
      category: original.category,
      brand: original.brand,
      shortDescription: original.shortDescription,
      longDescription: original.longDescription,
      benefits: original.benefits ?? undefined,
      ingredients: original.ingredients ?? undefined,
      faq: original.faq ?? undefined,
      guarantee: original.guarantee,
      deliveryInfo: original.deliveryInfo,
      disclaimer: original.disclaimer,
      seoTitle: original.seoTitle,
      seoDescription: original.seoDescription,
      ogImageUrl: original.ogImageUrl,
      heroImageUrl: original.heroImageUrl,
      galleryImageUrls: original.galleryImageUrls ?? undefined,
      status: "DRAFT",
      offices: {
        create: original.offices.map((po) => ({
          officeId: po.officeId,
          costPrice: po.costPrice,
          sellingPrice: po.sellingPrice,
          compareAtPrice: po.compareAtPrice,
          lowStockThreshold: po.lowStockThreshold,
          isActive: po.isActive,
        })),
      },
    },
  });

  await recordAudit({ userId: session.userId, action: "product.duplicate", resource: "Product", resourceId: copy.id, after: { from: productId } });
  revalidatePath("/admin/products");
  redirect(`/admin/products/${copy.id}`);
}

const officePriceSchema = z.object({
  officeId: z.string().min(1),
  costPrice: z.coerce.number().min(0),
  sellingPrice: z.coerce.number().min(0),
  compareAtPrice: z.coerce.number().min(0).optional().or(z.literal("")),
  lowStockThreshold: z.coerce.number().int().min(0),
  isActive: z.coerce.boolean().optional(),
  quantityOnHand: z.coerce.number().int().min(0),
});

export async function upsertProductOfficePricing(productId: string, formData: FormData) {
  const session = await requireSession();
  assertAccess(session, "products");
  const raw = Object.fromEntries(formData.entries());
  const data = officePriceSchema.parse({ ...raw, isActive: formData.get("isActive") === "on" });

  const productOffice = await prisma.productOffice.upsert({
    where: { productId_officeId: { productId, officeId: data.officeId } },
    update: {
      costPrice: data.costPrice,
      sellingPrice: data.sellingPrice,
      compareAtPrice: data.compareAtPrice === "" ? null : data.compareAtPrice,
      lowStockThreshold: data.lowStockThreshold,
      isActive: data.isActive ?? true,
    },
    create: {
      productId,
      officeId: data.officeId,
      costPrice: data.costPrice,
      sellingPrice: data.sellingPrice,
      compareAtPrice: data.compareAtPrice === "" ? null : data.compareAtPrice,
      lowStockThreshold: data.lowStockThreshold,
      isActive: data.isActive ?? true,
    },
  });

  const existingInventory = await prisma.inventory.findUnique({ where: { productOfficeId: productOffice.id } });
  if (existingInventory) {
    const delta = data.quantityOnHand - existingInventory.quantityOnHand;
    if (delta !== 0) {
      await prisma.inventory.update({
        where: { id: existingInventory.id },
        data: {
          quantityOnHand: data.quantityOnHand,
          movements: {
            create: {
              type: "MANUAL_ADJUSTMENT",
              quantity: delta,
              reason: "Set from product pricing form",
              createdByUserId: session.userId,
            },
          },
        },
      });
    }
  } else {
    await prisma.inventory.create({
      data: {
        productOfficeId: productOffice.id,
        quantityOnHand: data.quantityOnHand,
        movements: {
          create: {
            type: "STOCK_ADDITION",
            quantity: data.quantityOnHand,
            reason: "Initial stock",
            createdByUserId: session.userId,
          },
        },
      },
    });
  }

  await recordAudit({ userId: session.userId, action: "product_office.upsert", resource: "ProductOffice", resourceId: productOffice.id, after: data });
  revalidatePath(`/admin/products/${productId}`);
}
