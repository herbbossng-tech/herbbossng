import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Storage abstraction: writes to local disk under /public/uploads today.
// Swap this single module for an S3-compatible driver before production —
// nothing else in the app needs to change (callers only see `saveUpload`).

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

export async function saveUpload(file: File): Promise<{ url: string; filename: string; size: number; mimeType: string }> {
  await mkdir(UPLOAD_DIR, { recursive: true });

  const ext = path.extname(file.name) || "";
  const safeName = `${randomUUID()}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(UPLOAD_DIR, safeName), buffer);

  return {
    url: `/uploads/${safeName}`,
    filename: file.name,
    size: buffer.byteLength,
    mimeType: file.type || "application/octet-stream",
  };
}
