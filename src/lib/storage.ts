import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

/**
 * Local-disk storage adapter for the media library. Swapping this for an
 * S3-compatible adapter later is a one-file change — callers only depend on
 * `saveUpload()` returning a public URL.
 */
export async function saveUpload(file: File): Promise<{ url: string; filename: string; size: number; mimeType: string }> {
  await mkdir(UPLOAD_DIR, { recursive: true });

  const ext = path.extname(file.name) || '';
  const filename = `${crypto.randomUUID()}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(UPLOAD_DIR, filename), buffer);

  return {
    url: `/uploads/${filename}`,
    filename,
    size: buffer.length,
    mimeType: file.type || 'application/octet-stream',
  };
}
