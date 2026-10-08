import { cn } from '@/lib/utils';

export const FEMNIA_LOGO_URL = '/images/femnia-logo.webp';

export const BUSINESS = {
  name: 'FEMNIA',
  location: 'Al Thumama, Qatar',
  phone: '66543343',
  currency: import.meta.env.VITE_CURRENCY_CODE || 'QAR',
};

/** Exact uploaded logo, never recoloured or distorted. */
export function FemniaLogo({ className }) {
  return (
    <img
      src={FEMNIA_LOGO_URL}
      alt="FEMNIA"
      // p-[6%]: the artwork runs to its edges, so the rounded corners would
      // otherwise clip the wordmark.
      className={cn('size-10 rounded-xl bg-white object-contain p-[6%]', className)}
    />
  );
}

export function FemniaLockup({ subtitle, className, logoClassName }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <FemniaLogo className={logoClassName} />
      <div className="min-w-0">
        <p className="truncate text-lg font-semibold tracking-[0.28em] text-primary">FEMNIA</p>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}
