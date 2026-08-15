/**
 * Straight-line depreciation accrual.
 *
 * For each active asset, walks every complete month from its
 * depreciationStartMonth up to `throughMonth` and posts a
 * DepreciationEntry wherever one doesn't already exist.
 *
 * Three properties make this safe to call from anywhere:
 *
 *  1. IDEMPOTENT — the unique (fixedAssetId, period) index is the real
 *     guarantee; an in-memory set skips already-posted months on the
 *     normal path, and bulkCreate({ignoreDuplicates}) turns a lost race
 *     into a no-op rather than a 500 for a user who merely opened the P&L.
 *
 *  2. SELF-HEALING — the loop always starts at depreciationStartMonth,
 *     never at "last run", so downtime needs no catch-up logic. An asset
 *     entered today with an acquisition date six months back immediately
 *     gets its six entries, each dated to its own month, so historical
 *     P&Ls become correct retroactively.
 *
 *  3. NON-CASH — it never writes a CashTransaction. Cash balances, the
 *     daybook and daily-cash are untouched by construction.
 *
 * Month arithmetic is done on 'YYYY-MM' STRINGS, never Date objects.
 * 'YYYY-MM' compares correctly with < and >, and sidesteps the timezone
 * trap that bit the P&L expense filter (see finance.js).
 */
import { Op } from 'sequelize';
import { FixedAsset, DepreciationEntry } from '../models/index.js';

const INTERVAL_HOURS = parseInt(process.env.DEPRECIATION_CHECK_HOURS || '6', 10);

const num = (v) => parseFloat(v) || 0;
const round3 = (n) => +n.toFixed(3);
const pad = (n) => String(n).padStart(2, '0');

// Local-time month key. Never toISOString — on UTC+3 that shifts the 1st
// of a month back into the previous one.
export const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const monthOfDateOnly = (s) => String(s).slice(0, 7);      // DATEONLY is 'YYYY-MM-DD'

// Last calendar day of a 'YYYY-MM', as a local 'YYYY-MM-DD'.
function lastDayOf(period) {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m, 0);                              // day 0 of next month
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function nextMonth(period) {
  const [y, m] = period.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
}

/**
 * Post any missing depreciation entries.
 *
 * @param throughMonth 'YYYY-MM' — clamped to the current month so nobody
 *                     can pre-post future periods.
 * @param assetId      restrict to one asset (used by the disposal flow).
 * @param userId       stamped on the entries; null means the system job.
 */
export async function runDepreciation({ throughMonth, assetId = null, userId = null } = {}) {
  const currentMonth = monthKey(new Date());
  const through = (throughMonth && throughMonth < currentMonth) ? throughMonth : currentMonth;
  const runId = `dep-${Date.now().toString(36)}`;

  const where = assetId ? { id: assetId } : { status: 'active' };
  const assets = await FixedAsset.findAll({ where });

  let entriesCreated = 0;
  let totalPosted = 0;
  const summary = [];

  for (const asset of assets) {
    if (asset.status === 'disposed' || asset.status === 'written_off') continue;

    const cost = num(asset.cost);
    const depreciableBase = round3(Math.max(0, cost - num(asset.salvageValue)));
    const monthly = round3((depreciableBase * num(asset.depreciationRate)) / 100 / 12);
    if (depreciableBase <= 0 || monthly <= 0) continue;

    const existing = await DepreciationEntry.findAll({
      where: { fixedAssetId: asset.id },
      attributes: ['period', 'amount'],
    });
    const posted = new Set(existing.map((e) => e.period));
    let already = existing.reduce((s, e) => s + num(e.amount), 0);

    // Depreciation stops in the month the asset left the books.
    const stopMonth = asset.disposalDate ? monthOfDateOnly(asset.disposalDate) : null;
    const limit = stopMonth && stopMonth < through ? stopMonth : through;

    const rows = [];
    let period = asset.depreciationStartMonth;
    // A future acquisition date means the loop simply never runs.
    let guard = 0;
    while (period <= limit && guard++ < 1200) {
      if (!posted.has(period)) {
        const remaining = round3(depreciableBase - already);
        if (remaining <= 0.0005) break;
        // min() enforces the salvage floor AND absorbs the rounding
        // remainder: 1000 @ 20% is 16.667 x 60 = 1000.02, so the final
        // period posts 16.647 and the total lands on exactly 1000.000.
        const amount = round3(Math.min(monthly, remaining));
        already = round3(already + amount);
        rows.push({
          fixedAssetId: asset.id,
          period,
          periodDate: lastDayOf(period),
          amount,
          bookValueAfter: round3(cost - already),
          method: 'straight_line',
          runId,
          createdBy: userId,
        });
      }
      period = nextMonth(period);
    }

    if (rows.length) {
      await DepreciationEntry.bulkCreate(rows, { ignoreDuplicates: true });
      entriesCreated += rows.length;
      totalPosted += rows.reduce((s, r) => s + r.amount, 0);
      summary.push({ assetId: asset.id, name: asset.name, periods: rows.length });
    }

    const fullyDone = already >= depreciableBase - 0.0005;
    if (num(asset.accumulatedDepreciation) !== already
      || (fullyDone && asset.status === 'active')) {
      await asset.update({
        accumulatedDepreciation: round3(already),
        status: fullyDone && asset.status === 'active' ? 'fully_depreciated' : asset.status,
      });
    }
  }

  return {
    runId,
    throughMonth: through,
    assetsProcessed: assets.length,
    entriesCreated,
    totalPosted: round3(totalPosted),
    summary,
  };
}

// Reports call this before computing, so the figures on screen are never
// stale. The in-flight promise keeps concurrent readers to one run.
let inFlight = null;
export function ensureDepreciation(throughMonth) {
  if (!inFlight) {
    inFlight = runDepreciation({ throughMonth })
      .catch((err) => { console.error('[depreciation] run failed:', err.message); })
      .finally(() => { inFlight = null; });
  }
  return inFlight;
}

export function startDepreciationJob() {
  console.log(`[Depreciation] Job started — checking every ${INTERVAL_HOURS}h`);
  const tick = () => runDepreciation({})
    .then((r) => {
      if (r.entriesCreated) {
        console.log(`[Depreciation] posted ${r.entriesCreated} entries (${r.totalPosted}) through ${r.throughMonth}`);
      }
    })
    .catch((err) => console.error('[Depreciation] Job error:', err.message));
  setInterval(tick, INTERVAL_HOURS * 60 * 60 * 1000);
  // Boot run — this is what back-fills anything missed while down.
  setTimeout(tick, 30_000);
}

export default { runDepreciation, ensureDepreciation, startDepreciationJob, monthKey };
