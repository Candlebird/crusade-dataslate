import { confirmAction } from '../components/ui';
import { href } from '../route';
import { useCloud } from './CloudSync';

const STATUS_TEXT = {
  loading: 'Connecting…',
  'signed-out': 'Not signed in',
  'not-member': 'Waiting to join the campaign',
  syncing: 'Syncing…',
  synced: 'Synced with the campaign',
  error: 'Not syncing',
};

/** Sign-in / account link for the top bar. */
export default function AccountButton() {
  const { status, email, name, isGm, signIn, signOut, requests } = useCloud();
  // Shown while the cloud is still connecting too: on a slow phone that can take a while, or never finish.
  if (!email) {
    return (
      <a href="#" title={status === 'loading' ? 'Connecting… Sign in with Google to share forces with the group' : 'Sign in with Google to share forces with the group'} onClick={(e) => { e.preventDefault(); signIn(); }}>
        Sign in
      </a>
    );
  }
  const who = name?.split(' ')[0] || email.split('@')[0];
  return (
    <>
    {isGm && requests.length > 0 && (
      <a className="join-badge" href={href.settings()} title="Join requests">
        {requests.length} to approve
      </a>
    )}
    <a
      href="#"
      className="account"
      title={`${STATUS_TEXT[status]} as ${email}${isGm ? ' (GM)' : ''}. Click to sign out.`}
      onClick={(e) => {
        e.preventDefault();
        if (confirmAction(`Sign out ${email}? Your data stays in this browser but stops syncing.`)) signOut();
      }}
    >
      <span className={`dot ${status}`} />
      {who}
      {isGm && ' (GM)'}
    </a>
    </>
  );
}
