import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { createGleamPairing, changeGleamPairing, getGleamPairing, type GleamPairingOverview } from '@/services/gleamPairingGraphql';

export function GleamIntegration({organizationId}: {organizationId: number}) {
  const [overview, setOverview] = useState<GleamPairingOverview>();
  const [assignee, setAssignee] = useState(''); const [due, setDue] = useState('1440');
  const [code, setCode] = useState(''); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const [hasIntent, setHasIntent] = useState(false);
  const running = useRef(false); const active = useRef(true);
  const intent = useRef<{code: string; key: string; defaultAssigneeId: number; dueAfterMinutes: number} | null>(null);
  const changeIntent = useRef<{action: 'approveGleamPairing' | 'disconnectGleamConnection'; id: string; key: string} | null>(null);
  const apply = (value: GleamPairingOverview) => {
    if (active.current && value.organizationId === organizationId) setOverview(value);
  };
  useEffect(() => {
    active.current = true; const controller = new AbortController();
    void getGleamPairing(organizationId, controller.signal).then(value => {
      if (active.current && value.organizationId === organizationId) setOverview(value);
    }).catch(() => { if (active.current) setMessage('An organization administrator can review the Gleam connection. Refresh if you already have access.'); });
    return () => { active.current = false; controller.abort(); };
  }, [organizationId]);
  const run = async (action: () => Promise<void>) => {
    if (running.current) return; running.current = true; setBusy(true); setMessage('');
    try { await action(); } catch { if (active.current) setMessage('Could not confirm the change. Refresh status before trying again. Expired codes need to be replaced.'); }
    finally { running.current = false; if (active.current) setBusy(false); }
  };
  const pairing = overview?.pairing;
  const change = async (action: 'approveGleamPairing' | 'disconnectGleamConnection', id: string) => {
    if (changeIntent.current?.action !== action || changeIntent.current.id !== id) changeIntent.current = {action, id, key: crypto.randomUUID()};
    const result = await changeGleamPairing(organizationId, action, id, changeIntent.current.key);
    apply(result); if (active.current) changeIntent.current = null;
  };
  return <Card><CardHeader><h2 className="font-semibold">Gleam voice follow-ups</h2></CardHeader><CardContent className="space-y-4">
    <p>Receive assigned follow-up tasks and call summaries from your Gleam organization.</p>
    {overview && <p>Itemize organization: {overview.organizationName}</p>}
    {!overview ? <p>Connection status is unavailable.</p> : !overview.enabled && !pairing?.connection_id ? <p>Gleam pairing is not enabled for this organization yet.</p> : <>
      {pairing?.state === 'approved' ? <p>Approved for {pairing.source_name}. Finish connecting in Gleam to enable delivery.</p> : <>
        <label className="block" htmlFor={`gleam-assignee-${organizationId}`}>Assign new tasks to</label>
        <select id={`gleam-assignee-${organizationId}`} value={assignee} disabled={busy || hasIntent} onChange={event => setAssignee(event.target.value)} className="border rounded p-2">
          <option value="">Select a team member</option>{overview.assignees.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
        </select>
        <label className="block" htmlFor={`gleam-due-${organizationId}`}>Follow-up due within</label>
        <select id={`gleam-due-${organizationId}`} value={due} disabled={busy || hasIntent} onChange={event => setDue(event.target.value)} className="border rounded p-2">
          <option value="60">1 hour</option><option value="1440">1 day</option><option value="2880">2 days</option>
        </select>
        <Button disabled={busy || !assignee || !overview.enabled} onClick={() => void run(async () => {
          if (!intent.current) {
            const bytes = crypto.getRandomValues(new Uint8Array(32));
            intent.current = {code: [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join(''), key: crypto.randomUUID(), defaultAssigneeId: Number(assignee), dueAfterMinutes: Number(due)};
            setHasIntent(true);
          }
          const value = intent.current;
          const result = await createGleamPairing(organizationId, {code: value.code, defaultAssigneeId: value.defaultAssigneeId, dueAfterMinutes: value.dueAfterMinutes}, value.key);
          apply(result); if (active.current) {setCode(value.code); intent.current = null; setHasIntent(false);}
        })}>{hasIntent ? 'Retry creating code' : 'Create new pairing code'}</Button>
        {hasIntent && <Button variant="outline" disabled={busy} onClick={() => {intent.current = null; setHasIntent(false); setCode(''); setMessage('Choose the assignee and create a new code to replace the previous request.');}}>Start again</Button>}
        {code && pairing?.state === 'unused' && <div className="space-y-2"><p>Paste this code in Gleam → Settings → Integrations → Itemize. It expires after 10 minutes.</p>
          <input aria-label="Gleam pairing code" readOnly value={code} className="w-full border rounded p-2 font-mono" onFocus={event => event.target.select()} />
          <p>Expires: {new Date(pairing.expires_at).toLocaleString()}</p></div>}
        {pairing?.state === 'claimed' && <div className="space-y-2">
          <p>Verified Gleam organization: <strong>{pairing.source_name}</strong></p>
          <p>New tasks will be assigned to {overview.assignees.find(user => user.id === pairing.default_assignee_id)?.name || 'the selected team member'}, due within {pairing.due_after_minutes / 60} hours.</p>
          <Button disabled={busy || !overview.enabled} onClick={() => void run(async () => {
            await change('approveGleamPairing', pairing.id);
            if (active.current) setCode('');
          })}>Approve connection to {pairing.source_name}</Button>
        </div>}
      </>}
      {pairing?.connection_id && <Button variant="outline" disabled={busy} onClick={() => void run(async () => {
        await change('disconnectGleamConnection', pairing.connection_id!);
        if (active.current) {setCode(''); setMessage('Gleam access stopped in Itemize. Disconnect in Gleam to clear its connection too.');}
      })}>Disconnect in Itemize</Button>}
    </>}
    <Button variant="ghost" disabled={busy} onClick={() => void run(async () => apply(await getGleamPairing(organizationId)))}>Refresh status</Button>
    {message && <p role="status">{message}</p>}
  </CardContent></Card>;
}
