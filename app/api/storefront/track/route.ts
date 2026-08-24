import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

const schema = z.object({
  eventName: z.enum(["page_view", "view_content", "select_item", "begin_checkout"]),
  officeId: z.string().min(1),
  productId: z.string().optional(),
  landingPageSlug: z.string().optional(),
  utmSource: z.string().max(200).optional(),
  utmMedium: z.string().max(200).optional(),
  utmCampaign: z.string().max(200).optional(),
});

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rate = checkRateLimit(`track:${ip}`, 60, 60_000);
  if (!rate.allowed) return NextResponse.json({ ok: false }, { status: 429 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  await prisma.analyticsEvent.create({ data: parsed.data }).catch(() => {});
  return NextResponse.json({ ok: true });
}
