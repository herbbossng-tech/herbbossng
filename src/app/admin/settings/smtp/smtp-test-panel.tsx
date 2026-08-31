'use client';

import { useState } from 'react';
import { Button, Input } from '@/components/ui';
import { testConnection, sendTestEmail } from './actions';

export function SmtpTestPanel({ officeId }: { officeId: string }) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState('');
  const [sendTo, setSendTo] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState('');

  async function handleTest() {
    setTesting(true);
    setResult('');
    const res = await testConnection(officeId);
    setResult(res.ok ? '✅ Connection successful' : `❌ ${res.error}`);
    setTesting(false);
  }

  async function handleSend() {
    if (!sendTo) return;
    setSending(true);
    setSendResult('');
    const res = await sendTestEmail(officeId, sendTo);
    setSendResult(res.sent ? '✅ Test email sent' : `❌ ${res.reason}`);
    setSending(false);
  }

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-brand-dark/10 pt-4">
      <div className="flex items-center gap-3">
        <Button type="button" variant="secondary" onClick={handleTest} disabled={testing}>
          {testing ? 'Testing…' : 'Test SMTP Connection'}
        </Button>
        {result && <span className="text-sm">{result}</span>}
      </div>
      <div className="flex items-center gap-3">
        <Input placeholder="test@example.com" value={sendTo} onChange={(e) => setSendTo(e.target.value)} className="max-w-xs" />
        <Button type="button" variant="secondary" onClick={handleSend} disabled={sending || !sendTo}>
          {sending ? 'Sending…' : 'Send Test Email'}
        </Button>
        {sendResult && <span className="text-sm">{sendResult}</span>}
      </div>
    </div>
  );
}
