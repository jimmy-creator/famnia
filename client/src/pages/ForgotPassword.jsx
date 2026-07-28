import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
      toast.success('Reset link sent! Check your email.');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-4 py-12">
      <Card>
        {sent ? (
          <>
            <CardHeader className="text-center">
              <CardTitle className="font-serif text-2xl">Check your email</CardTitle>
              <CardDescription>
                We&apos;ve sent a password reset link to <strong className="text-foreground">{email}</strong>.
                Check your inbox and click the link to reset your password.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center text-sm text-muted-foreground">
              Didn&apos;t receive it? Check your spam folder or{' '}
              <button onClick={() => setSent(false)} className="font-medium text-primary hover:underline">
                try again
              </button>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader className="text-center">
              <CardTitle className="font-serif text-2xl">Forgot password</CardTitle>
              <CardDescription>Enter your email and we&apos;ll send you a link to reset your password.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="Enter your registered email"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Sending…' : 'Send reset link'}
                </Button>
              </form>
            </CardContent>
          </>
        )}
        <CardFooter className="justify-center">
          <Link to="/login" className="text-sm font-medium text-primary hover:underline">Back to login</Link>
        </CardFooter>
      </Card>
    </div>
  );
}
