import { Link } from 'react-router-dom';
import { AlertTriangle, Loader2, RefreshCw, Sparkles } from 'lucide-react';

import { Badge } from '@/hub/ui/badge';
import { Button } from '@/hub/ui/button';
import { Skeleton } from '@/hub/ui/skeleton';
import { cn } from '@/lib/utils';

export function PageHeader({ title, subtitle, onRefresh, refreshing, actions }) {
  return (
    <header className="no-print mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-foreground sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {actions}
        {onRefresh && (
          <Button variant="outline" size="sm" className="h-10" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw className={cn('mr-2 size-4', refreshing && 'animate-spin')} />
            Refresh
          </Button>
        )}
      </div>
    </header>
  );
}

export function StockBadge({ status }) {
  const cls =
    status === 'In Stock'
      ? 'tint-mint text-[var(--tint-mint-ink)]'
      : status === 'Low Stock'
        ? 'tint-peach text-[var(--tint-peach-ink)]'
        : 'tint-rose text-[var(--tint-rose-ink)]';
  return <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-xs font-medium', cls)}>{status}</span>;
}

const STATUS_TINTS = {
  Draft: 'bg-muted text-muted-foreground border-border',
  Confirmed: 'tint-lavender text-[var(--tint-lavender-ink)]',
  Pending: 'tint-peach text-[var(--tint-peach-ink)]',
  'Out for Delivery': 'tint-lavender text-[var(--tint-lavender-ink)]',
  Delivered: 'tint-mint text-[var(--tint-mint-ink)]',
  Returned: 'tint-rose text-[var(--tint-rose-ink)]',
  Cancelled: 'tint-rose text-[var(--tint-rose-ink)]',
  Paid: 'tint-mint text-[var(--tint-mint-ink)]',
  Refunded: 'tint-rose text-[var(--tint-rose-ink)]',
};

export function StatusBadge({ value }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full border px-2.5 py-1 text-xs font-medium',
        STATUS_TINTS[value] ?? 'tint-lavender text-[var(--tint-lavender-ink)]',
      )}
    >
      {value}
    </span>
  );
}

export function LoadingCards({ count = 8 }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-24 rounded-2xl" />
      ))}
    </div>
  );
}

export function LoadingRows({ count = 6 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-14 rounded-xl" />
      ))}
    </div>
  );
}

export function ErrorState({ section = 'Data', message, onRetry }) {
  const sessionExpired = /session has expired|sign in again|not authorized/i.test(message);
  return (
    <div className="card-surface flex flex-col items-center gap-3 p-8 text-center">
      <AlertTriangle className="size-6 text-destructive" />
      <p className="text-sm font-medium text-foreground">Could not load {section}</p>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      <Button
        onClick={() => {
          if (sessionExpired) {
            window.location.assign('/hub/login');
            return;
          }
          onRetry();
        }}
        className="h-10"
      >
        <RefreshCw className="mr-2 size-4" /> {sessionExpired ? 'Sign in again' : 'Try again'}
      </Button>
    </div>
  );
}

export function EmptyState({ title, hint }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> {label}
    </div>
  );
}

export function ProductThumb({ src, name, className }) {
  if (src) {
    return (
      <img src={src} alt={name} loading="lazy" className={cn('size-12 shrink-0 rounded-xl object-cover', className)} />
    );
  }
  return (
    <div
      aria-hidden
      className={cn(
        'flex size-12 shrink-0 items-center justify-center rounded-xl bg-secondary text-[10px] font-semibold tracking-[0.15em] text-primary',
        className,
      )}
    >
      FEM
    </div>
  );
}

export function ComingSoon({ title, note }) {
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={title} />
      <div className="card-surface flex flex-col items-center gap-3 p-8 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-secondary">
          <Sparkles className="size-5 text-primary" />
        </span>
        <p className="text-base font-medium text-foreground">Coming in the next stage</p>
        <p className="text-sm text-muted-foreground">{note}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Button asChild variant="outline" className="h-10">
            <Link to="/hub/dashboard">Back to Dashboard</Link>
          </Button>
          <Button asChild className="h-10">
            <a href="/admin">Open classic admin</a>
          </Button>
        </div>
      </div>
    </div>
  );
}

const KPI_TONES = {
  warn: { tint: 'tint-peach', ink: 'text-[var(--tint-peach-ink)]', dot: 'bg-[var(--tint-peach-border)]' },
  danger: { tint: 'tint-rose', ink: 'text-[var(--tint-rose-ink)]', dot: 'bg-[var(--tint-rose-border)]' },
  good: { tint: 'tint-mint', ink: 'text-[var(--tint-mint-ink)]', dot: 'bg-[var(--tint-mint-border)]' },
  default: { tint: 'tint-lavender', ink: 'text-[var(--tint-lavender-ink)]', dot: 'bg-[var(--tint-lavender-border)]' },
};

export function Kpi({ label, value, tone, to }) {
  const t = KPI_TONES[tone] ?? KPI_TONES.default;
  const body = (
    <div className={cn('kpi-card h-full p-4', t.tint)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <span aria-hidden className={cn('mt-0.5 size-2.5 shrink-0 rounded-full', t.dot)} />
      </div>
      <p className={cn('mt-2 text-xl font-semibold sm:text-2xl', t.ink)}>{value}</p>
    </div>
  );
  if (!to) return body;
  return (
    <Link to={to} className="block h-full">
      {body}
    </Link>
  );
}

export function Badges({ items }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((i) => (
        <Badge key={i.label} variant="secondary" className="rounded-full px-3 py-1">
          {i.label}: <span className="ml-1 font-semibold">{i.count}</span>
        </Badge>
      ))}
    </div>
  );
}
