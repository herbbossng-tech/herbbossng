import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { setAdminOfficeCookie } from "@/lib/office-context";

const schema = z.object({ officeId: z.string().min(1) });

export async function POST(request: Request) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid office" }, { status: 400 });
  await setAdminOfficeCookie(parsed.data.officeId);
  return NextResponse.json({ ok: true });
}
