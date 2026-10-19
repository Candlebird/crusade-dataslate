import { useState } from 'react';
import { toast } from '../components/ui';
import { GM_EMAIL } from './config';
import { useCloud } from './CloudSync';

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Runs a cloud action, reporting failures as a toast. */
function useAction() {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>, done?: string) => {
    setBusy(true);
    try {
      await fn();
      if (done) toast(done);
    } catch (err) {
      toast(errorText(err), 'error');
    } finally {
      setBusy(false);
    }
  };
  return [busy, run] as const;
}

/** Shown to a signed-in account the GM hasn't let into the campaign yet. */
export function JoinPanel() {
  const cloud = useCloud();
  const [busy, run] = useAction();
  if (cloud.status !== 'not-member') return null;
  return (
    <div className="panel notice">
      {cloud.requested ? (
        <div className="row">
          <span>You've asked to join the campaign as <b>{cloud.email}</b>. Once the GM accepts, your forces start syncing.</span>
          <span className="spacer" />
          <button disabled={busy} onClick={() => run(cloud.withdrawRequest)}>Cancel request</button>
        </div>
      ) : (
        <div className="row">
          <span><b>{cloud.email}</b> isn't in the campaign yet. Ask to join, and the GM can let you in.</span>
          <span className="spacer" />
          <button className="primary" disabled={busy} onClick={() => run(cloud.requestJoin, 'Request sent to the GM.')}>Request to join</button>
          <button className="ghost" onClick={cloud.signOut}>Sign out</button>
        </div>
      )}
    </div>
  );
}

/** GM only: accept or deny join requests, and add or remove players. */
export function PlayersPanel() {
  const cloud = useCloud();
  const [busy, run] = useAction();
  const [email, setEmail] = useState('');
  if (!cloud.isGm) return null;
  const add = () => run(async () => {
    await cloud.addPlayer(email);
    setEmail('');
  }, `${email.trim()} can now join the campaign.`);

  return (
    <div className="panel">
      <div className="panel-title"><h2>Players</h2></div>
      {cloud.requests.length > 0 && (
        <>
          <h4>Asking to join</h4>
          {cloud.requests.map((r) => (
            <div key={r.email} className="person">
              <span>{r.name && <b>{r.name} </b>}<span className="muted">{r.email}</span></span>
              <span className="spacer" />
              <button className="primary" disabled={busy} onClick={() => run(() => cloud.addPlayer(r.email, r.name), `${r.name || r.email} joined the campaign.`)}>Accept</button>
              <button className="danger" disabled={busy} onClick={() => run(() => cloud.denyRequest(r.email), `Turned down ${r.email}.`)}>Deny</button>
            </div>
          ))}
        </>
      )}
      <h4>In the campaign</h4>
      <div className="person"><span><b>{cloud.name ?? 'You'} </b><span className="muted">{GM_EMAIL}</span></span><span className="spacer" /><span className="muted small">GM</span></div>
      {cloud.members.filter((m) => m.email !== GM_EMAIL).map((m) => (
        <div key={m.email} className="person">
          <span>{m.name && <b>{m.name} </b>}<span className="muted">{m.email}</span></span>
          <span className="spacer" />
          <button
            className="ghost"
            disabled={busy}
            onClick={() => {
              if (window.confirm(`Remove ${m.email} from the campaign? Their forces stay, but they can't sync until you add them again.`))
                run(() => cloud.removePlayer(m.email), `Removed ${m.email}.`);
            }}
          >
            Remove
          </button>
        </div>
      ))}
      <div className="row" style={{ marginTop: '0.75rem' }}>
        <input placeholder="Add a player by Google email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && email.trim() && add()} style={{ flex: 1 }} />
        <button disabled={busy || !email.trim()} onClick={add}>Add</button>
      </div>
      <p className="muted small" style={{ marginTop: '0.5rem' }}>
        New players sign in with Google and press <b>Request to join</b>; their request shows up here.
      </p>
    </div>
  );
}
