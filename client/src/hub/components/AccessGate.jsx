import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { Clock, KeyRound, Loader2, ShieldOff } from 'lucide-react';
import { useEffect, useState } from 'react';

import { FemniaLockup } from '@/hub/components/Brand';
import { Button } from '@/hub/ui/button';
import { MIN_PASSWORD_LENGTH, PasswordField, passwordProblem } from '@/hub/components/PasswordField';
import { useAuth } from '@/context/AuthContext';
import { accessQuery, completeForcedPasswordChange, errorMessage } from '@/hub/lib/api';

/**
 * Blocks the hub for staff accounts that are not active. Approval, suspension
 * and deactivation are also enforced by the API (`protect`) — this screen just
 * explains the situation instead of showing empty pages.
 */
export function AccessGate({ children }) {
  const access = useQuery(accessQuery);
  const { logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pathname } = useLocation();
  const status = access.data?.status;
  const deliveryOnly =
    Boolean(access.data) && !access.data?.isAdmin && Boolean(access.data?.roles.includes('delivery'));

  // Delivery staff have one screen; the API refuses everything else anyway.
  useEffect(() => {
    if (!deliveryOnly) return;
    if (pathname === '/hub/my-deliveries' || pathname === '/hub/profile') return;
    navigate('/hub/my-deliveries', { replace: true });
  }, [deliveryOnly, pathname, navigate]);

  const leave = async () => {
    try {
      await logout();
    } finally {
      queryClient.clear();
      navigate('/hub/login', { replace: true });
    }
  };

  if (access.isPending || !access.data) return <>{children}</>;
  if (access.data.mustChangePassword) return <ForcedPasswordChange onSignOut={leave} />;
  if (status === 'active') return <>{children}</>;

  const pending = status === 'pending';

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/30 px-4">
      <div className="card-surface w-full max-w-md p-8 text-center">
        <div className="mb-6 flex justify-center">
          <FemniaLockup />
        </div>
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          {pending ? <Clock className="size-6" /> : <ShieldOff className="size-6" />}
        </div>
        <h1 className="text-lg font-semibold text-foreground">
          {pending ? 'Your account is awaiting approval' : 'Your access has been disabled'}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {pending
            ? 'An Admin needs to approve this account before you can use the FEMNIA Hub.'
            : 'Please contact a FEMNIA Admin if you believe this is a mistake.'}
        </p>
        <Button variant="outline" className="mt-6 h-11 w-full" onClick={leave}>
          Sign out
        </Button>
      </div>
    </div>
  );
}

/**
 * Mandatory password change for accounts created or reset by an Admin. The
 * API refuses every other call until the temporary password has been
 * replaced, so this screen is the only thing the account can reach.
 */
function ForcedPasswordChange({ onSignOut }) {
  const client = useQueryClient();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    if (password !== confirm) return setError('The two passwords do not match.');
    setBusy(true);
    try {
      // The server re-issues this device's session cookie with the change.
      await completeForcedPasswordChange(password);
      await client.invalidateQueries();
    } catch (err) {
      setError(errorMessage(err, 'The password could not be changed.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/30 px-4 py-10">
      <form onSubmit={submit} className="card-surface w-full max-w-md p-8">
        <div className="mb-6 flex justify-center">
          <FemniaLockup />
        </div>
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <KeyRound className="size-6" />
        </div>
        <h1 className="text-center text-lg font-semibold text-foreground">Choose your own password</h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          You signed in with a temporary password. Set a password of at least {MIN_PASSWORD_LENGTH} characters to
          continue.
        </p>

        <div className="mt-6 space-y-4">
          <PasswordField
            id="forced-new-password"
            label="New password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            strength
          />
          <PasswordField
            id="forced-confirm-password"
            label="Confirm new password"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
          />
          {error && (
            <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="h-11 w-full" disabled={busy}>
            {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
            {busy ? 'Saving…' : 'Save password and continue'}
          </Button>
          <Button type="button" variant="outline" className="h-11 w-full" onClick={() => onSignOut()}>
            Sign out
          </Button>
        </div>
      </form>
    </div>
  );
}
