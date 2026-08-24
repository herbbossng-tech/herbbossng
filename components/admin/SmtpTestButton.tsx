"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { testSmtpConnection } from "@/app/admin/(protected)/settings/actions";

export function SmtpTestButton({ officeId }: { officeId: string }) {
  const [email, setEmail] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null);

  function run() {
    startTransition(async () => {
      const res = await testSmtpConnection(officeId, email);
      setResult(res);
    });
  }

  return (
    <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4">
      <p className="mb-2 text-sm font-medium text-zinc-800">Send a test email</p>
      <div className="flex gap-2">
        <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="recipient@example.com" type="email" />
        <Button type="button" variant="secondary" onClick={run} disabled={pending || !email}>
          {pending ? "Sending…" : "Send test"}
        </Button>
      </div>
      {result && (
        <p className={`mt-2 text-sm ${result.ok ? "text-brand-green-700" : "text-red-600"}`}>
          {result.ok ? "Test email sent successfully." : `Failed: ${result.error}`}
        </p>
      )}
    </div>
  );
}
