/**
 * Sales per month for the last 12 months — the ERP overview chart.
 *
 * Reads /erp-reports/sales?groupBy=month, so it counts exactly what the Sales
 * report counts: paid, non-cancelled orders from every channel (web, POS,
 * aggregators). Months with no sales come back missing and are filled with 0
 * here so the axis never skips a month.
 */
import { useEffect, useState } from 'react';
import api from '../../api/axios';
import { CURRENCY } from '../../utils/currency';

const MONTHS = 12;
const pad = (n) => String(n).padStart(2, '0');
const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

function lastMonths() {
  const now = new Date();
  return Array.from({ length: MONTHS }, (_, i) => new Date(now.getFullYear(), now.getMonth() - (MONTHS - 1 - i), 1));
}

// Round the axis top up to 1/2/2.5/5 × 10ⁿ so gridlines land on clean numbers.
function niceMax(v) {
  if (v <= 0) return 1;
  const raw = v / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * mag >= raw) * mag;
  return step * 4;
}

const money = (n) => `${CURRENCY} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

export default function MonthlySalesChart() {
  const [rows, setRows] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const months = lastMonths();
    const from = `${monthKey(months[0])}-01`;
    api.get('/erp-reports/sales', { params: { groupBy: 'month', from } })
      .then(({ data }) => {
        const byKey = new Map(data.rows.map((r) => [r.key, r]));
        setRows(months.map((d) => {
          const r = byKey.get(monthKey(d));
          return { date: d, revenue: r?.revenue || 0, orders: r?.orders || 0 };
        }));
      })
      .catch(() => setFailed(true));
  }, []);

  // A staff member without `analytics` gets 403 — just leave the chart out.
  if (failed) return null;

  const max = niceMax(Math.max(0, ...(rows || []).map((r) => r.revenue)));
  const total = (rows || []).reduce((s, r) => s + r.revenue, 0);
  const current = rows?.[rows.length - 1];
  const previous = rows?.[rows.length - 2];
  const ticks = [4, 3, 2, 1, 0].map((i) => (max / 4) * i);

  return (
    <section className="rounded-[var(--erp-radius)] border border-[var(--erp-line-soft)] bg-[var(--erp-surface)] p-5 shadow-[var(--erp-shadow)]">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-[.09em] text-[var(--text-light)]">
            Sales per month
          </h2>
          <div className="mt-1.5 text-[1.375rem] font-semibold tabular-nums tracking-tight">
            {rows ? money(total) : '—'}
          </div>
          <div className="mt-0.5 text-xs text-[var(--text-light)]">
            Last 12 months · paid orders, all channels
          </div>
        </div>
        {current && (
          <div className="text-right">
            <div className="text-xs text-[var(--text-light)]">This month so far</div>
            <div className="font-semibold tabular-nums">{money(current.revenue)}</div>
            <div className="text-xs text-[var(--text-secondary)]">
              {current.orders} orders · last month {money(previous?.revenue)}
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 flex gap-2" style={{ height: 220 }}>
        {/* Y axis */}
        <div className="relative w-12 shrink-0 text-right text-[10px] tabular-nums text-[var(--text-light)]">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${100 - (t / max) * 100}%` }}>
              {compact.format(t)}
            </span>
          ))}
        </div>

        <div className="relative flex-1">
          {/* Gridlines — recessive, the baseline slightly stronger. */}
          {ticks.map((t) => (
            <div
              key={t}
              className="absolute inset-x-0 border-t"
              style={{
                top: `${100 - (t / max) * 100}%`,
                borderColor: t === 0 ? 'var(--erp-line)' : 'var(--erp-line-soft)',
              }}
            />
          ))}

          <div className="absolute inset-0 flex items-end gap-[2px]">
            {(rows || Array.from({ length: MONTHS }, () => null)).map((r, i) => {
              const isCurrent = i === MONTHS - 1;
              const pct = r ? (r.revenue / max) * 100 : 0;
              const name = r?.date.toLocaleString(undefined, { month: 'long', year: 'numeric' });
              return (
                // The whole column is the hover target, not just the bar, so
                // short months are as easy to point at as tall ones.
                <div
                  key={i}
                  tabIndex={r ? 0 : -1}
                  aria-label={r ? `${name}: ${money(r.revenue)}, ${r.orders} orders` : undefined}
                  className="group relative flex h-full flex-1 items-end justify-center outline-none"
                >
                  <div
                    className="w-full max-w-10 rounded-t-[4px] transition-opacity group-hover:opacity-80"
                    style={{
                      height: r ? `${Math.max(pct, r.revenue > 0 ? 1 : 0)}%` : '0%',
                      background: 'var(--copper)',
                      // The running month is incomplete — lighter so it isn't
                      // read as a slump.
                      opacity: isCurrent ? 0.5 : 1,
                    }}
                  />
                  {r && (
                    <div
                      className="pointer-events-none absolute z-10 hidden w-max rounded-lg border border-[var(--erp-line)] bg-[var(--erp-surface)] px-3 py-2 text-xs shadow-[var(--erp-shadow-lift)] group-hover:block group-focus-visible:block"
                      style={{
                        bottom: `calc(${pct}% + 8px)`,
                        // Centred over the bar, but pinned to the inner edge
                        // for the outer months so it stays inside the card.
                        ...(i < 2 ? { left: 0 }
                          : i > MONTHS - 3 ? { right: 0 }
                          : { left: '50%', transform: 'translateX(-50%)' }),
                      }}
                    >
                      <div className="font-semibold">{name}{isCurrent && ' (so far)'}</div>
                      <div className="mt-0.5 tabular-nums">{money(r.revenue)}</div>
                      <div className="text-[var(--text-secondary)]">{r.orders} orders</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* X axis — the year appears under January and the first month only. */}
      <div className="mt-2 flex gap-2">
        <div className="w-12 shrink-0" />
        <div className="flex flex-1 gap-[2px]">
          {lastMonths().map((d, i) => (
            <div key={i} className="flex-1 text-center text-[10px] leading-tight text-[var(--text-light)]">
              {d.toLocaleString(undefined, { month: 'short' })}
              {(i === 0 || d.getMonth() === 0) && <div>{d.getFullYear()}</div>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
