import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { saveUpload } from '@/lib/storage';

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Only image uploads are supported' }, { status: 400 });
  }
  if (file.size > 8 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 8MB)' }, { status: 400 });
  }

  const saved = await saveUpload(file);
  const asset = await db.mediaAsset.create({
    data: { url: saved.url, filename: saved.filename, mimeType: saved.mimeType, size: saved.size },
  });

  return NextResponse.json({ id: asset.id, url: asset.url });
}
