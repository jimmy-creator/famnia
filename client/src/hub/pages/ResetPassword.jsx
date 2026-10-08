import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { FemniaLogo } from '@/hub/components/Brand';
import { MIN_PASSWORD_LENGTH, PasswordField, passwordProblem } from '@/hub/components/PasswordField';
import { Button } from '@/hub/ui/button';
import { errorMessage, resetPasswordWithToken } from '@/hub/lib/api';
import { useHubTitle } from '@/hub/lib/useHubTitle';

export default function ResetPasswordPage() {
  useHubTitle('Set a New Password — FEMNIA Hub');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token');
  const email = params.get('email');
  const [linkValid, setLinkValid] = useState(Boolean(token && email));
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    if (password !== confirm) return setError('The two passwords do not match.');
    setBusy(true);
    try {
      await resetPasswordWithToken({ email, token, password });
      setDone(true);
      toast.success('Password updated — you can sign in now');
      setTimeout(() => navigate('/hub/login', { replace: true }), 1200);
    } catch (err) {
      const message = errorMessage(err, 'The password could not be updated.');
      // The token is only checked on submit; an invalid one flips to the
      // "invalid or expired" state rather than a field error.
      if (/invalid or expired|expired/i.test(message)) setLinkValid(false);
      else setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen w-full items-center justify-center overflow-x-hidden bg-secondary/40 px-4 py-10">
      <div className="card-surface w-full max-w-md p-6 sm:p-8">
        <div className="text-center">
          <FemniaLogo className="mx-auto size-16 rounded-2xl" />
          <h1 className="mt-3 text-lg font-medium text-foreground">Set a new password</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a password of at least {MIN_PASSWORD_LENGTH} characters.
          </p>
        </div>
        {done ? (
          <p className="mt-8 rounded-xl bg-emerald-50 px-3 py-3 text-center text-sm text-emerald-800">
            Your password has been updated. Taking you to sign in…
          </p>
        ) : !linkValid ? (
          <div className="mt-8 space-y-4 text-center">
            <p className="rounded-xl bg-destructive/10 px-3 py-3 text-sm text-destructive">
              This reset link is invalid or has expired. Please request a new one from the sign-in page.
            </p>
            <Button className="h-11 w-full" onClick={() => navigate('/hub/login')}>
              Back to sign in
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-4">
            <PasswordField
              id="new-password"
              label="New password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              strength
            />
            <PasswordField
              id="confirm-password"
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
              {busy ? 'Saving…' : 'Update password'}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
