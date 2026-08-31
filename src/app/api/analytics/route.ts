import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';

const schema = z.object({
  officeId: z.string().min(1),
  sessionId: z.string().min(1),
  eventType: z.enum(['select_item', 'begin_checkout']),
  landingPageId: z.string().optional(),
  productId: z.string().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
});

export async function POST(req: Request) {
  const fwd = req.headers.get('x-forwarded-for');
  const ip = fwd?.split(',')[0]?.trim() || 'unknown';
  const rl = rateLimit(`analytics:${ip}`, 60, 60 * 1000);
  if (!rl.allowed) return NextResponse.json({ ok: false }, { status: 429 });

  try {
    const data = schema.parse(await req.json());
    await db.analyticsEvent.create({ data });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
