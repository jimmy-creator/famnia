import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { PageHeader } from '@/hub/components/shared';
import { MIN_PASSWORD_LENGTH, PasswordField, passwordProblem } from '@/hub/components/PasswordField';
import { Button } from '@/hub/ui/button';
import { accessQuery, changePassword, errorMessage } from '@/hub/lib/api';
import { useHubTitle } from '@/hub/lib/useHubTitle';

export default function ProfilePage() {
  useHubTitle('My Profile — FEMNIA Hub');
  const access = useQuery(accessQuery).data ?? null;
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setSuccess(null);
    const problem = passwordProblem(next);
    if (problem) return setError(problem);
    if (next !== confirm) return setError('The two new passwords do not match.');
    if (next === current) return setError('Your new password must be different from the current one.');
    setBusy(true);
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      setSuccess('Your password has been changed. Other devices have been signed out.');
      toast.success('Password changed');
    } catch (err) {
      setError(errorMessage(err, 'The password could not be changed.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="My Profile" subtitle="Your account details and password" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card-surface p-5">
          <h2 className="section-title text-base font-semibold text-foreground">Account</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Name</dt>
              <dd className="text-foreground">{access?.fullName ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Email</dt>
              <dd className="text-foreground">{access?.email ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Role</dt>
              <dd className="text-foreground">{access?.isAdmin ? 'Admin' : 'Staff'}</dd>
            </div>
          </dl>
        </div>
        <div className="card-surface p-5">
          <h2 className="section-title text-base font-semibold text-foreground">Change password</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            At least {MIN_PASSWORD_LENGTH} characters, including a letter and a number.
          </p>
          <form onSubmit={submit} className="mt-4 space-y-4">
            <PasswordField
              id="current-password"
              label="Current password"
              value={current}
              onChange={setCurrent}
              autoComplete="current-password"
            />
            <PasswordField
              id="new-password"
              label="New password"
              value={next}
              onChange={setNext}
              autoComplete="new-password"
              strength
            />
            <PasswordField
              id="confirm-new-password"
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
            {success && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{success}</p>}
            <Button type="submit" className="h-11 w-full" disabled={busy}>
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
              {busy ? 'Saving…' : 'Change password'}
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}
