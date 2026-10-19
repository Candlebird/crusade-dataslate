import { confirmAction } from '../components/ui';
import { useCloud } from './CloudSync';

const STATUS_TEXT = {
  loading: 'Connecting…',
  'signed-out': 'Not signed in',
  syncing: 'Syncing…',
  synced: 'Synced with the campaign',
  error: 'Not syncing',
};

/** Sign-in / account link for the top bar. */
export default function AccountButton() {
  const { status, email, name, isGm, signIn, signOut } = useCloud();
  if (status === 'loading' && !email) return null;
  if (!email) {
    return (
      <a href="#" title="Sign in with Google to share forces with the other players" onClick={(e) => { e.preventDefault(); signIn(); }}>
        Sign in
      </a>
    );
  }
  const who = name?.split(' ')[0] || email.split('@')[0];
  return (
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
  );
}
