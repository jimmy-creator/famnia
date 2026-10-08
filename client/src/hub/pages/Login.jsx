import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/hub/ui/button';
import { FemniaLogo } from '@/hub/components/Brand';
import { PasswordStrength } from '@/hub/components/PasswordField';
import { Checkbox } from '@/hub/ui/checkbox';
import { Input } from '@/hub/ui/input';
import { Label } from '@/hub/ui/label';
import { useAuth } from '@/context/AuthContext';
import api from '@/api/axios';
import { accessQuery, errorMessage, hubSignUp, qk, sendPasswordReset } from '@/hub/lib/api';
import { useHubTitle } from '@/hub/lib/useHubTitle';

export default function LoginPage() {
  useHubTitle('FEMNIA Hub — Staff Sign In');
  const { login, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const session = useQuery(accessQuery);
  const [mode, setMode] = useState('signin');
  const [notice, setNotice] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (session.data) navigate('/hub/dashboard', { replace: true });
  }, [session.data, navigate]);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'forgot') {
        await sendPasswordReset(email.trim());
        setNotice(
          'If that email belongs to a FEMNIA staff account, a secure reset link is on its way. The link expires shortly.',
        );
        return;
      }
      if (mode === 'signin') {
        await login(email.trim(), password, remember);
      } else {
        await hubSignUp({ name: fullName.trim(), email: email.trim(), password });
      }
      // Customer and POS cashier accounts share the sign-in endpoint but
      // have no hub access — refuse them here rather than half-open the hub.
      let access;
      try {
        access = (await api.get('/hub/access')).data;
      } catch (err) {
        if (err?.response?.status === 403) {
          await logout().catch(() => {});
          throw new Error('This account does not have staff access to the FEMNIA Hub.');
        }
        throw err;
      }
      queryClient.setQueryData(qk.access, access);
      toast.success(mode === 'signin' ? 'Welcome back to FEMNIA Hub' : 'Account created — signing you in');
      navigate('/hub/dashboard', { replace: true });
    } catch (err) {
      const message = errorMessage(err, 'Sign in failed');
      setError(
        /invalid (login|email or password)/i.test(message)
          ? 'Incorrect username, email or password. Please try again.'
          : message,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen w-full items-center justify-center overflow-x-hidden bg-secondary/40 px-4 py-10">
      <div className="card-surface w-full max-w-md p-6 sm:p-8">
        <div className="text-center">
          <FemniaLogo className="mx-auto size-20 rounded-2xl" />
          <h1 className="mt-3 text-lg font-medium text-foreground">FEMNIA Hub</h1>

          <p className="mt-1 text-sm text-muted-foreground">Inventory &amp; Delivery Manager · Al Thumama, Qatar</p>
        </div>

        <form onSubmit={submit} className="mt-8 space-y-4">
          {mode === 'signup' && (
            <div className="space-y-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                className="h-11"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                minLength={2}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">{mode === 'signin' ? 'Username or email' : 'Email'}</Label>
            <Input
              id="email"
              type={mode === 'signin' ? 'text' : 'email'}
              inputMode={mode === 'signin' ? 'text' : 'email'}
              autoComplete={mode === 'signin' ? 'username' : 'email'}
              className="h-11"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            {mode === 'signin' && (
              <p className="text-xs text-muted-foreground">Staff accounts can sign in with just their username.</p>
            )}
          </div>

          {mode !== 'forgot' && (
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={show ? 'text' : 'password'}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  className="h-11 pr-12"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={mode === 'signup' ? 8 : 6}
                />
                <button
                  type="button"
                  aria-label={show ? 'Hide password' : 'Show password'}
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-1 top-1 inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary"
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {mode === 'signup' && <PasswordStrength value={password} />}
            </div>
          )}

          {mode === 'forgot' && (
            <p className="text-sm text-muted-foreground">
              Enter your staff email and we will send a secure link to set a new password.
            </p>
          )}

          {mode === 'signin' && (
            <div className="flex items-center justify-between gap-3 py-1">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox checked={remember} onCheckedChange={(v) => setRemember(Boolean(v))} />
                Remember me on this device
              </label>
              <button
                type="button"
                onClick={() => {
                  setMode('forgot');
                  setError(null);
                  setNotice(null);
                }}
                className="text-sm text-primary underline-offset-4 hover:underline"
              >
                Forgot password?
              </button>
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {notice && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}

          <Button type="submit" className="h-11 w-full" disabled={busy}>
            {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
            {busy
              ? 'Please wait…'
              : mode === 'signin'
                ? 'Sign in'
                : mode === 'signup'
                  ? 'Create staff account'
                  : 'Send reset link'}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin');
            setError(null);
            setNotice(null);
          }}
          className="mt-5 w-full text-center text-sm text-primary underline-offset-4 hover:underline"
        >
          {mode === 'signin'
            ? 'New staff member? Create an account'
            : mode === 'signup'
              ? 'Already have an account? Sign in'
              : 'Back to sign in'}
        </button>
      </div>
    </main>
  );
}
