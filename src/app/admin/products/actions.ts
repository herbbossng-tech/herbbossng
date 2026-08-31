'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { requireSession, logAudit } from '@/lib/require-session';

const productSchema = z.object({
  sku: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .transform((s) => s.toLowerCase().replace(/[^a-z0-9-]+/g, '-')),
  name: z.string().min(1),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']),
  shortDescription: z.string().optional(),
  longDescription: z.string().optional(),
  benefits: z.string().optional(), // newline separated
  ingredientsJson: z.string().optional(),
  faqJson: z.string().optional(),
  disclaimer: z.string().optional(),
  guaranteeText: z.string().optional(),
  deliveryInfo: z.string().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
});

function parseJsonSafe(value: string | undefined) {
  if (!value || !value.trim()) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error('Invalid JSON — please check the syntax.');
  }
}

function parseForm(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = productSchema.parse(raw);
  return {
    sku: parsed.sku,
    slug: parsed.slug,
    name: parsed.name,
    status: parsed.status,
    shortDescription: parsed.shortDescription || null,
    longDescription: parsed.longDescription || null,
    benefits: parsed.benefits ? parsed.benefits.split('\n').map((b) => b.trim()).filter(Boolean) : [],
    ingredients: parseJsonSafe(parsed.ingredientsJson) ?? [],
    faq: parseJsonSafe(parsed.faqJson) ?? [],
    disclaimer: parsed.disclaimer || null,
    guaranteeText: parsed.guaranteeText || null,
    deliveryInfo: parsed.deliveryInfo || null,
    seoTitle: parsed.seoTitle || null,
    seoDescription: parsed.seoDescription || null,
  };
}

export async function createProduct(formData: FormData) {
  const session = await requireSession('products');
  const data = parseForm(formData);
  const product = await db.product.create({ data });
  await logAudit({ userId: session.user.id, action: 'CREATE', resource: 'Product', resourceId: product.id, after: data });
  revalidatePath('/admin/products');
  redirect(`/admin/products/${product.id}`);
}

export async function updateProduct(productId: string, formData: FormData) {
  const session = await requireSession('products');
  const data = parseForm(formData);
  const before = await db.product.findUnique({ where: { id: productId } });
  await db.product.update({ where: { id: productId }, data });
  await logAudit({ userId: session.user.id, action: 'UPDATE', resource: 'Product', resourceId: productId, before, after: data });
  revalidatePath('/admin/products');
  revalidatePath(`/admin/products/${productId}`);
}

export async function duplicateProduct(productId: string) {
  const session = await requireSession('products');
  const original = await db.product.findUniqueOrThrow({
    where: { id: productId },
    include: { productOffices: true, images: true },
  });
  const copy = await db.product.create({
    data: {
      sku: `${original.sku}-COPY-${Date.now().toString().slice(-4)}`,
      slug: `${original.slug}-copy-${Date.now().toString().slice(-4)}`,
      name: `${original.name} (Copy)`,
      status: 'DRAFT',
      shortDescription: original.shortDescription,
      longDescription: original.longDescription,
      benefits: original.benefits as never,
      ingredients: original.ingredients as never,
      faq: original.faq as never,
      disclaimer: original.disclaimer,
      guaranteeText: original.guaranteeText,
      deliveryInfo: original.deliveryInfo,
      productOffices: {
        create: original.productOffices.map((po) => ({
          officeId: po.officeId,
          price: po.price,
          compareAtPrice: po.compareAtPrice,
          isActive: po.isActive,
          stockQuantity: 0,
          lowStockThreshold: po.lowStockThreshold,
          trackInventory: po.trackInventory,
        })),
      },
      images: { create: original.images.map((img) => ({ url: img.url, altText: img.altText, isPrimary: img.isPrimary, sortOrder: img.sortOrder })) },
    },
  });
  await logAudit({ userId: session.user.id, action: 'DUPLICATE', resource: 'Product', resourceId: copy.id, before: { sourceId: productId } });
  revalidatePath('/admin/products');
  redirect(`/admin/products/${copy.id}`);
}

export async function archiveProduct(productId: string) {
  const session = await requireSession('products');
  await db.product.update({ where: { id: productId }, data: { status: 'ARCHIVED' } });
  await logAudit({ userId: session.user.id, action: 'ARCHIVE', resource: 'Product', resourceId: productId });
  revalidatePath('/admin/products');
}

export async function upsertProductOffice(productId: string, officeId: string, formData: FormData) {
  const session = await requireSession('products');
  const price = Number(formData.get('price'));
  const compareAtPriceRaw = formData.get('compareAtPrice');
  const compareAtPrice = compareAtPriceRaw ? Number(compareAtPriceRaw) : null;
  const stockQuantity = Number(formData.get('stockQuantity') ?? 0);
  const lowStockThreshold = Number(formData.get('lowStockThreshold') ?? 10);
  const isActive = formData.get('isActive') === 'on';
  const trackInventory = formData.get('trackInventory') === 'on';

  const existing = await db.productOffice.findUnique({ where: { productId_officeId: { productId, officeId } } });

  const data = { price, compareAtPrice, isActive, lowStockThreshold, trackInventory };

  if (existing) {
    await db.productOffice.update({ where: { id: existing.id }, data });
  } else {
    await db.productOffice.create({ data: { productId, officeId, stockQuantity, ...data } });
  }

  await logAudit({
    userId: session.user.id,
    action: existing ? 'UPDATE' : 'CREATE',
    resource: 'ProductOffice',
    resourceId: existing?.id ?? `${productId}:${officeId}`,
    before: existing,
    after: data,
  });
  revalidatePath(`/admin/products/${productId}`);
}

export async function addProductImage(productId: string, url: string, altText?: string) {
  const session = await requireSession('products');
  const image = await db.productImage.create({ data: { productId, url, altText, isPrimary: false } });
  await logAudit({ userId: session.user.id, action: 'CREATE', resource: 'ProductImage', resourceId: image.id, after: { url } });
  revalidatePath(`/admin/products/${productId}`);
}

export async function removeProductImage(productId: string, imageId: string) {
  const session = await requireSession('products');
  await db.productImage.delete({ where: { id: imageId } });
  await logAudit({ userId: session.user.id, action: 'DELETE', resource: 'ProductImage', resourceId: imageId });
  revalidatePath(`/admin/products/${productId}`);
}

export async function setPrimaryImage(productId: string, imageId: string) {
  const session = await requireSession('products');
  await db.$transaction([
    db.productImage.updateMany({ where: { productId }, data: { isPrimary: false } }),
    db.productImage.update({ where: { id: imageId }, data: { isPrimary: true } }),
  ]);
  await logAudit({ userId: session.user.id, action: 'UPDATE', resource: 'ProductImage', resourceId: imageId, after: { isPrimary: true } });
  revalidatePath(`/admin/products/${productId}`);
}
