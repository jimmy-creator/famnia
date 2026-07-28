import { Truck } from 'lucide-react';

/**
 * Estimated-delivery widget shown on the product detail page.
 *
 * Renders today + minDays … today + maxDays as a localised
 * "Get it by DD MMM – DD MMM" line. Skips Fridays for stores that
 * pass `skipFriday` (Kuwait sector); otherwise uses calendar days.
 *
 * Pure presentational: no API call, no inputs. The shipping policy
 * page carries the formal SLA; this is the conversion-helping
 * "Arrives Tuesday" line.
 */
function addBusinessDays(start, days, { skipFriday = false } = {}) {
  const d = new Date(start);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    if (skipFriday && d.getDay() === 5) continue;
    added++;
  }
  return d;
}

export default function EstimatedDelivery({
  minDays = 2,
  maxDays = 4,
  skipFriday = false,
  freeOverHint = '',
}) {
  const isAr = typeof document !== 'undefined' && document.documentElement.lang === 'ar';
  const locale = isAr ? 'ar-KW' : 'en-GB';

  const now = new Date();
  const from = addBusinessDays(now, minDays, { skipFriday });
  const to = addBusinessDays(now, maxDays, { skipFriday });
  const fmt = (d) => d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });

  const label = isAr ? 'استلامك المتوقع' : 'Get it by';
  const between = isAr ? `${fmt(to)} – ${fmt(from)}` : `${fmt(from)} – ${fmt(to)}`;

  return (
    <div className="rounded-lg border border-border bg-secondary/40 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-background text-primary" aria-hidden="true">
          <Truck className="size-4" />
        </span>
        <div className="flex flex-col leading-tight">
          <span className="text-xs text-muted-foreground">{label}</span>
          <strong className="text-sm font-semibold text-foreground">{between}</strong>
        </div>
      </div>
      {freeOverHint ? (
        <div className="mt-2 text-xs text-muted-foreground">{freeOverHint}</div>
      ) : null}
    </div>
  );
}
