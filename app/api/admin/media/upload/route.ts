import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { assertAccess } from "@/lib/rbac";
import { saveUpload } from "@/lib/storage";
import { prisma } from "@/lib/prisma";

const MAX_SIZE = 8 * 1024 * 1024; // 8MB
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"]);

export async function POST(request: Request) {
  let session;
  try {
    session = await requireSession();
    assertAccess(session, "products");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large (max 8MB)" }, { status: 400 });
  }

  const saved = await saveUpload(file);
  const media = await prisma.media.create({
    data: {
      url: saved.url,
      filename: saved.filename,
      mimeType: saved.mimeType,
      size: saved.size,
      altText: (formData.get("altText") as string) || null,
    },
  });

  return NextResponse.json({ media });
}
