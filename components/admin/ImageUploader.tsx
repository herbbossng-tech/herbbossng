"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/Button";

export function ImageUploader({
  name,
  defaultValue,
  label,
}: {
  name: string;
  defaultValue?: string | null;
  label: string;
}) {
  const [url, setUrl] = useState(defaultValue ?? "");
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/media/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) setUrl(data.media.url);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-zinc-800">{label}</p>
      <div className="flex items-center gap-3">
        {url ? (
          <Image src={url} alt="" width={64} height={64} className="h-16 w-16 rounded-lg border border-zinc-200 object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-zinc-300 text-xs text-zinc-400">
            No image
          </div>
        )}
        <input type="hidden" name={name} value={url} />
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
        <Button type="button" variant="secondary" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? "Uploading…" : url ? "Replace" : "Upload"}
        </Button>
        {url && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setUrl("")}>
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}
