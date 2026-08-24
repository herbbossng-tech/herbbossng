"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { assertAccess } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import type { EmailTemplateKey } from "@/app/generated/prisma/enums";

const schema = z.object({
  name: z.string().min(1),
  subject: z.string().min(1),
  previewText: z.string().optional(),
  brandName: z.string().min(1),
  logoUrl: z.string().optional(),
  headerColor: z.string().min(1),
  accentColor: z.string().min(1),
  bodyHtml: z.string().min(1),
  buttonText: z.string().optional(),
  buttonUrl: z.string().optional(),
  footerText: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
});

export async function saveEmailTemplate(key: EmailTemplateKey, formData: FormData) {
  const session = await requireSession();
  assertAccess(session, "email");
  const raw = Object.fromEntries(formData.entries());
  const data = schema.parse({ ...raw, isActive: formData.get("isActive") === "on" });

  await prisma.emailTemplate.upsert({
    where: { key },
    update: data,
    create: { key, ...data },
  });

  await recordAudit({ userId: session.userId, action: "email_template.save", resource: "EmailTemplate", resourceId: key, after: data });
  revalidatePath("/admin/email");
  revalidatePath(`/admin/email/${key}`);
}
