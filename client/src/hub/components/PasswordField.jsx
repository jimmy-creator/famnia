import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

import { Input } from '@/hub/ui/input';
import { Label } from '@/hub/ui/label';
import { cn } from '@/lib/utils';

export const MIN_PASSWORD_LENGTH = 8;

export function passwordScore(value) {
  let score = 0;
  if (value.length >= MIN_PASSWORD_LENGTH) score += 1;
  if (value.length >= 12) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;
  return Math.min(score, 4);
}

export function passwordProblem(value) {
  if (value.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return 'Include at least one letter and one number.';
  return null;
}

const LABELS = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];
const TONES = ['bg-destructive', 'bg-destructive', 'bg-amber-500', 'bg-emerald-500', 'bg-emerald-600'];

export function PasswordStrength({ value }) {
  if (!value) return null;
  const score = passwordScore(value);
  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn('h-1.5 flex-1 rounded-full', i < score ? TONES[score] : 'bg-border')} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Password strength: <span className="font-medium text-foreground">{LABELS[score]}</span>
      </p>
    </div>
  );
}

export function PasswordField({ id, label, value, onChange, autoComplete, strength = false }) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          className="h-11 pr-12"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
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
      {strength && <PasswordStrength value={value} />}
    </div>
  );
}
