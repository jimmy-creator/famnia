/**
 * Fixed assets, owner capital, and the balance sheet.
 *
 *   GET    /api/accounting/assets                 register with NBV
 *   POST   /api/accounting/assets                 acquire
 *   GET    /api/accounting/assets/:id             detail + schedule
 *   PUT    /api/accounting/assets/:id             descriptive fields only
 *   DELETE /api/accounting/assets/:id             only if never depreciated
 *   POST   /api/accounting/assets/:id/dispose     sell / write off
 *   GET    /api/accounting/depreciation           entry listing
 *   POST   /api/accounting/depreciation/run       manual run
 *
 *   GET    /api/accounting/capital                entries + totals
 *   POST   /api/accounting/capital                contribution / drawing
 *   POST   /api/accounting/capital/:id/cancel     reversing entry
 *
 *   GET    /api/accounting/balance-sheet?asOf=    see the note below
 *
 * ── On the balance sheet ────────────────────────────────────────────
 * This is a single-entry cash ledger with no chart of accounts, so the
 * sheet is an AGGREGATION, not a trial balance. Nothing in the schema
 * forces it to balance. Rather than plug the gap, the response carries a
 * `reconciliation` block that names — and where possible quantifies —
 * every known reason the two sides can differ. A non-zero difference is
 * a signal to act on, not a cosmetic defect.
 */
import { Router } from 'express';
import { Op } from 'sequelize';
import sequelize from '../config/database.js';
import {
  FixedAsset, DepreciationEntry, CapitalEntry,
  CashAccount, CashTransaction, Location, Supplier, User, Order,
  writeCashTxn, logActivity,
} from '../models/index.js';
import { protect, admin } from '../middleware/auth.js';
import { computePnl, computeStockValue, dateOnly, monthKeyLocal } from './finance.js';
import { computeBalance as computeSupplierBalance } from './suppliers.js';
import { runDepreciation, ensureDepreciation } from '../services/depreciationJob.js';

const router = Router();

// Sequelize hands DECIMAL back as a string; `asset.cost + 20` would
// silently concatenate. Coerce on every read.
const num = (v) => parseFloat(v) || 0;
const round3 = (n) => +n.toFixed(3);
const gen = (prefix) =>
  `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

// Same guard the finance routes use. Deliberately NOT the `admin`
// middleware, which despite its name lets in any staff member holding any
// single permission.
const hasFinanceAccess = (req) =>
  req.user.role === 'admin' || (req.user.permissions || []).includes('analytics');

const guard = (req, res) => {
  if (!hasFinanceAccess(req)) { res.status(403).json({ message: 'Forbidden' }); return false; }
  return true;
};

// ─── Fixed assets ───────────────────────────────────────────────────

function shapeAsset(asset, accum) {
  const cost = num(asset.cost);
  const rate = num(asset.depreciationRate);
  const base = Math.max(0, cost - num(asset.salvageValue));
  return {
    ...asset.toJSON(),
    accumulatedDepreciation: round3(accum),
    netBookValue: round3(cost - accum),
    monthlyDepreciation: round3((base * rate) / 100 / 12),
    // Derived, never stored — two fields that can disagree is a bug factory.
    usefulLifeMonths: rate > 0 ? Math.round((12 * 100) / rate) : null,
  };
}

router.get('/assets', protect, async (req, res) => {
  try {
    if (!guard(req, res)) return;
    await ensureDepreciation(monthKeyLocal(new Date()));

    const where = {};
    if (req.query.status) where.status = req.query.status;
    else if (req.query.includeDisposed !== 'true') where.status = { [Op.ne]: 'disposed' };
    if (req.query.category) where.category = req.query.category;
    if (req.query.locationId) where.locationId = parseInt(req.query.locationId, 10);

    const assets = await FixedAsset.findAll({
      where,
      include: [
        { model: Location, attributes: ['id', 'name', 'code'] },
        { model: CashAccount, attributes: ['id', 'name', 'type'] },
      ],
      order: [['acquisitionDate', 'DESC'], ['id', 'DESC']],
    });

    // One grouped query rather than N — the register can get long.
    const sums = await DepreciationEntry.findAll({
      attributes: ['fixedAssetId', [sequelize.fn('SUM', sequelize.col('amount')), 'total']],
      group: ['fixedAssetId'],
      raw: true,
    });
    const accumById = new Map(sums.map((r) => [r.fixedAssetId, num(r.total)]));

    const rows = assets.map((a) => shapeAsset(a, accumById.get(a.id) || 0));
    const totals = rows.reduce((s, r) => ({
      count: s.count + 1,
      cost: s.cost + num(r.cost),
      accumulatedDepreciation: s.accumulatedDepreciation + num(r.accumulatedDepreciation),
      netBookValue: s.netBookValue + num(r.netBookValue),
      monthlyCharge: s.monthlyCharge + (r.status === 'active' ? num(r.monthlyDepreciation) : 0),
    }), { count: 0, cost: 0, accumulatedDepreciation: 0, netBookValue: 0, monthlyCharge: 0 });

    res.json({
      totals: {
        count: totals.count,
        cost: round3(totals.cost),
        accumulatedDepreciation: round3(totals.accumulatedDepreciation),
        netBookValue: round3(totals.netBookValue),
        monthlyCharge: round3(totals.monthlyCharge),
      },
      assets: rows,
    });
  } catch (err) {
    console.error('[accounting/assets]', err);
    res.status(500).json({ message: err.message });
  }
});

router.post('/assets', protect, async (req, res) => {
  if (!guard(req, res)) return;
  const t = await sequelize.transaction();
  try {
    const {
      name, category, locationId, supplierId, acquisitionDate, cost,
      salvageValue = 0, depreciationRate = 20, depreciationStartMonth,
      cashAccountId, serialNumber, attachmentUrl, notes,
    } = req.body || {};

    if (!name?.trim()) throw new Error('Name is required');
    if (!acquisitionDate) throw new Error('Acquisition date is required');
    const c = parseFloat(cost);
    if (!(c > 0)) throw new Error('Cost must be greater than zero');
    const sv = parseFloat(salvageValue) || 0;
    if (sv < 0 || sv >= c) throw new Error('Salvage value must be between 0 and the cost');
    const rate = parseFloat(depreciationRate);
    if (!(rate > 0 && rate <= 100)) throw new Error('Depreciation rate must be between 0 and 100');

    const startMonth = depreciationStartMonth || String(acquisitionDate).slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(startMonth)) throw new Error('depreciationStartMonth must be YYYY-MM');

    const asset = await FixedAsset.create({
      assetNumber: gen('FA'),
      name: name.trim(),
      category: category || 'equipment',
      locationId: locationId || null,
      supplierId: supplierId || null,
      acquisitionDate,
      cost: c,
      salvageValue: sv,
      depreciationRate: rate,
      depreciationStartMonth: startMonth,
      cashAccountId: cashAccountId || null,
      serialNumber: serialNumber?.trim() || null,
      attachmentUrl: attachmentUrl || null,
      notes: notes?.trim() || null,
      status: 'active',
      createdBy: req.user.id,
    }, { transaction: t });

    // Paying from an account moves cash. Leaving it blank is legitimate
    // (the owner bought it personally) but leaves the balance sheet with
    // an asset and no matching credit — reported as a reconciling item.
    if (cashAccountId) {
      await writeCashTxn({
        cashAccountId,
        amount: -c,
        source: 'asset',
        sourceType: 'FixedAsset',
        sourceId: asset.id,
        reference: asset.assetNumber,
        description: `Purchase of ${asset.name}`,
        date: new Date(`${acquisitionDate}T00:00:00`),
        createdBy: req.user.id,
        transaction: t,
        requireFunds: true,
      });
    }

    await t.commit();
    res.status(201).json(shapeAsset(asset, 0));
  } catch (err) {
    if (!t.finished) await t.rollback().catch(() => {});
    console.error('[accounting/assets/create]', err);
    res.status(400).json({ message: err.message });
  }
});

router.get('/assets/:id', protect, async (req, res) => {
  try {
    if (!guard(req, res)) return;
    const asset = await FixedAsset.findByPk(req.params.id, {
      include: [
        { model: Location, attributes: ['id', 'name'] },
        { model: Supplier, attributes: ['id', 'name'] },
        { model: CashAccount, attributes: ['id', 'name'] },
        { model: User, as: 'creator', attributes: ['id', 'name'] },
      ],
    });
    if (!asset) return res.status(404).json({ message: 'Asset not found' });

    const schedule = await DepreciationEntry.findAll({
      where: { fixedAssetId: asset.id },
      order: [['period', 'ASC']],
      include: [{ model: FixedAsset, attributes: [] }],
    });
    const accum = schedule.reduce((s, e) => s + num(e.amount), 0);
    const cashTxns = await CashTransaction.findAll({
      where: { sourceType: 'FixedAsset', sourceId: asset.id },
      order: [['date', 'ASC']],
    });

    res.json({ ...shapeAsset(asset, accum), schedule, cashTransactions: cashTxns });
  } catch (err) {
    console.error('[accounting/assets/detail]', err);
    res.status(500).json({ message: err.message });
  }
});

router.put('/assets/:id', protect, admin, async (req, res) => {
  try {
    if (!guard(req, res)) return;
    const asset = await FixedAsset.findByPk(req.params.id);
    if (!asset) return res.status(404).json({ message: 'Asset not found' });

    // Changing the numbers after entries are posted would silently
    // invalidate every one of them. Refuse rather than corrupt the trail.
    const LOCKED = ['cost', 'salvageValue', 'depreciationRate', 'acquisitionDate', 'depreciationStartMonth'];
    const touchesLocked = LOCKED.some((k) => k in (req.body || {})
      && String(req.body[k]) !== String(asset[k]));
    if (touchesLocked) {
      const posted = await DepreciationEntry.count({ where: { fixedAssetId: asset.id } });
      if (posted > 0) {
        return res.status(409).json({
          message: `Asset already has ${posted} posted depreciation entries — `
            + 'dispose and re-acquire instead of editing its cost or rate',
        });
      }
    }

    const EDITABLE = [...LOCKED, 'name', 'category', 'locationId', 'supplierId',
      'serialNumber', 'notes', 'attachmentUrl'];
    const updates = {};
    for (const k of EDITABLE) if (k in (req.body || {})) updates[k] = req.body[k];
    await asset.update(updates);
    res.json(asset);
  } catch (err) {
    console.error('[accounting/assets/update]', err);
    res.status(400).json({ message: err.message });
  }
});

router.delete('/assets/:id', protect, admin, async (req, res) => {
  try {
    if (!guard(req, res)) return;
    const asset = await FixedAsset.findByPk(req.params.id);
    if (!asset) return res.status(404).json({ message: 'Asset not found' });

    const [posted, txns] = await Promise.all([
      DepreciationEntry.count({ where: { fixedAssetId: asset.id } }),
      CashTransaction.count({ where: { sourceType: 'FixedAsset', sourceId: asset.id } }),
    ]);
    if (posted > 0 || txns > 0) {
      return res.status(400).json({
        message: 'Asset has depreciation or cash history — dispose it instead of deleting',
      });
    }
    await asset.destroy();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/assets/:id/dispose', protect, admin, async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const asset = await FixedAsset.findByPk(req.params.id);
    if (!asset) return res.status(404).json({ message: 'Asset not found' });
    if (asset.status === 'disposed' || asset.status === 'written_off') {
      return res.status(400).json({ message: `Asset is already ${asset.status}` });
    }

    const { disposalDate, proceeds = 0, cashAccountId, notes, writeOff } = req.body || {};
    if (!disposalDate) return res.status(400).json({ message: 'Disposal date is required' });
    const p = parseFloat(proceeds) || 0;
    if (p < 0) return res.status(400).json({ message: 'Proceeds cannot be negative' });

    // Charge the disposal month in full BEFORE computing NBV. Skip this
    // and the gain/loss silently absorbs the unposted depreciation,
    // splitting one economic event across two P&L lines.
    await runDepreciation({
      throughMonth: String(disposalDate).slice(0, 7),
      assetId: asset.id,
      userId: req.user.id,
    });

    const t = await sequelize.transaction();
    try {
      await asset.reload({ transaction: t });
      const accum = num(await DepreciationEntry.sum('amount', {
        where: { fixedAssetId: asset.id }, transaction: t,
      }));
      const nbv = round3(num(asset.cost) - accum);
      const gainLoss = round3(p - nbv);

      if (cashAccountId && p > 0) {
        await writeCashTxn({
          cashAccountId,
          amount: p,
          source: 'asset',
          sourceType: 'FixedAsset',
          sourceId: asset.id,
          reference: `${asset.assetNumber}-DISP`,
          description: `Disposal of ${asset.name}`,
          date: new Date(`${disposalDate}T00:00:00`),
          createdBy: req.user.id,
          transaction: t,
        });
      }

      await asset.update({
        status: writeOff ? 'written_off' : 'disposed',
        disposalDate,
        disposalProceeds: p,
        disposalCashAccountId: cashAccountId || null,
        disposalGainLoss: gainLoss,
        disposalNotes: notes?.trim() || null,
        accumulatedDepreciation: round3(accum),
      }, { transaction: t });

      await logActivity({
        userId: req.user.id,
        action: 'asset_disposed',
        entityType: 'FixedAsset',
        entityId: asset.id,
        details: { assetNumber: asset.assetNumber, name: asset.name, nbv, proceeds: p, gainLoss },
        transaction: t,
      });

      await t.commit();
      res.json({ ok: true, netBookValue: nbv, proceeds: p, gainLoss });
    } catch (err) {
      if (!t.finished) await t.rollback().catch(() => {});
      throw err;
    }
  } catch (err) {
    console.error('[accounting/assets/dispose]', err);
    res.status(400).json({ message: err.message });
  }
});

// ─── Depreciation ───────────────────────────────────────────────────

router.get('/depreciation', protect, async (req, res) => {
  try {
    if (!guard(req, res)) return;
    const where = {};
    if (req.query.assetId) where.fixedAssetId = parseInt(req.query.assetId, 10);
    if (req.query.period) where.period = req.query.period;
    if (req.query.from || req.query.to) {
      where.periodDate = {};
      if (req.query.from) where.periodDate[Op.gte] = req.query.from;
      if (req.query.to) where.periodDate[Op.lte] = req.query.to;
    }
    const entries = await DepreciationEntry.findAll({
      where,
      include: [{ model: FixedAsset, attributes: ['id', 'assetNumber', 'name', 'category'] }],
      order: [['periodDate', 'DESC'], ['fixedAssetId', 'ASC']],
      limit: Math.min(parseInt(req.query.limit, 10) || 500, 1000),
    });
    const total = entries.reduce((s, e) => s + num(e.amount), 0);
    res.json({ total: round3(total), entries });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/depreciation/run', protect, admin, async (req, res) => {
  try {
    if (!guard(req, res)) return;
    const result = await runDepreciation({
      throughMonth: req.body?.throughMonth,
      userId: req.user.id,
    });
    // Financially significant and manually triggered — worth attributing.
    await logActivity({
      userId: req.user.id,
      action: 'depreciation_run',
      details: result,
    });
    res.json(result);
  } catch (err) {
    console.error('[accounting/depreciation/run]', err);
    res.status(500).json({ message: err.message });
  }
});

// ─── Owner capital ──────────────────────────────────────────────────

router.get('/capital', protect, async (req, res) => {
  try {
    if (!guard(req, res)) return;
    const where = {};
    if (req.query.type) where.type = req.query.type;
    if (req.query.status) where.status = req.query.status;
    if (req.query.from || req.query.to) {
      where.entryDate = {};
      if (req.query.from) where.entryDate[Op.gte] = req.query.from;
      if (req.query.to) where.entryDate[Op.lte] = req.query.to;
    }
    const entries = await CapitalEntry.findAll({
      where,
      include: [
        { model: CashAccount, attributes: ['id', 'name', 'type'] },
        { model: User, as: 'creator', attributes: ['id', 'name'] },
      ],
      order: [['entryDate', 'DESC'], ['createdAt', 'DESC']],
      limit: Math.min(parseInt(req.query.limit, 10) || 500, 1000),
    });
    let contributions = 0, drawings = 0;
    for (const e of entries) {
      if (e.status === 'cancelled') continue;
      if (e.type === 'contribution') contributions += num(e.amount);
      else drawings += num(e.amount);
    }
    res.json({
      totals: {
        contributions: round3(contributions),
        drawings: round3(drawings),
        net: round3(contributions - drawings),
      },
      entries,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/capital', protect, async (req, res) => {
  if (!guard(req, res)) return;
  const t = await sequelize.transaction();
  try {
    const { type, cashAccountId, amount, entryDate, ownerName, description, reference, attachmentUrl } = req.body || {};
    if (!['contribution', 'drawing'].includes(type)) throw new Error('type must be contribution or drawing');
    const amt = parseFloat(amount);
    if (!(amt > 0)) throw new Error('Amount must be greater than zero');
    if (!entryDate) throw new Error('Date is required');
    if (!cashAccountId) throw new Error('Cash account is required');

    const acct = await CashAccount.findByPk(cashAccountId, { transaction: t });
    if (!acct || !acct.active) throw new Error('Cash account not found or inactive');

    const entry = await CapitalEntry.create({
      entryNumber: gen('CAP'),
      type,
      cashAccountId,
      amount: amt,
      entryDate,
      ownerName: ownerName?.trim() || null,
      description: description?.trim() || null,
      reference: reference?.trim() || null,
      attachmentUrl: attachmentUrl || null,
      status: 'active',
      createdBy: req.user.id,
    }, { transaction: t });

    await writeCashTxn({
      cashAccountId,
      amount: type === 'contribution' ? amt : -amt,
      source: 'capital',
      sourceType: 'CapitalEntry',
      sourceId: entry.id,
      reference: entry.entryNumber,
      description: `${type === 'contribution' ? 'Owner capital' : 'Owner drawing'}`
        + `${ownerName ? ` — ${ownerName}` : ''}`,
      date: new Date(`${entryDate}T00:00:00`),
      createdBy: req.user.id,
      transaction: t,
      requireFunds: true,   // only bites on a drawing (negative amount)
    });

    await t.commit();
    res.status(201).json(entry);
  } catch (err) {
    if (!t.finished) await t.rollback().catch(() => {});
    console.error('[accounting/capital/create]', err);
    res.status(400).json({ message: err.message });
  }
});

router.post('/capital/:id/cancel', protect, admin, async (req, res) => {
  if (!guard(req, res)) return;
  const t = await sequelize.transaction();
  try {
    const entry = await CapitalEntry.findByPk(req.params.id, { transaction: t });
    if (!entry) { await t.rollback(); return res.status(404).json({ message: 'Entry not found' }); }
    if (entry.status !== 'active') { await t.rollback(); return res.status(400).json({ message: 'Already cancelled' }); }

    // Reversing entry dated today — never delete the original row.
    await writeCashTxn({
      cashAccountId: entry.cashAccountId,
      amount: entry.type === 'contribution' ? -num(entry.amount) : num(entry.amount),
      source: 'capital',
      sourceType: 'CapitalEntry',
      sourceId: entry.id,
      reference: `${entry.entryNumber}-REVERSAL`,
      description: `Cancelled ${entry.type}`,
      date: new Date(),
      createdBy: req.user.id,
      transaction: t,
    });
    await entry.update({ status: 'cancelled' }, { transaction: t });
    await t.commit();
    res.json({ ok: true });
  } catch (err) {
    if (!t.finished) await t.rollback().catch(() => {});
    res.status(500).json({ message: err.message });
  }
});

// ─── Balance sheet ──────────────────────────────────────────────────

router.get('/balance-sheet', protect, async (req, res) => {
  try {
    if (!guard(req, res)) return;

    const asOfStr = req.query.asOf || dateOnly(new Date());
    const asOfEnd = new Date(`${asOfStr}T23:59:59.999`);
    if (asOfEnd <= new Date()) await ensureDepreciation(monthKeyLocal(asOfEnd));

    // ── Assets: cash ────────────────────────────────────────────
    // INCLUDING inactive accounts. /daily-cash filters active:true, and
    // copying that here would silently erase the balance of any account
    // soft-deleted while still holding money.
    const accounts = await CashAccount.findAll({
      include: [{ model: Location, attributes: ['id', 'name'] }],
      order: [['type', 'ASC'], ['name', 'ASC']],
    });
    const cashByAccount = [];
    let cashInHand = 0, cashInBank = 0;
    for (const a of accounts) {
      const sum = await CashTransaction.sum('amount', {
        where: { cashAccountId: a.id, date: { [Op.lte]: asOfEnd } },
      });
      const bal = round3(num(a.openingBalance) + (sum || 0));
      cashByAccount.push({ id: a.id, name: a.name, type: a.type, active: a.active, balance: bal });
      if (a.type === 'drawer' || a.type === 'petty_cash') cashInHand += bal;
      else cashInBank += bal;
    }

    // ── Assets: inventory ───────────────────────────────────────
    // Valued at CURRENT costPrice — ProductStock keeps no history, so
    // this figure cannot be truthfully rewound to a past date.
    const stock = await computeStockValue({});
    const inventory = num(stock.totals.value);

    // ── Assets: fixed ───────────────────────────────────────────
    // Both queries share one predicate; if cost excluded disposed assets
    // while depreciation didn't, NBV would go negative.
    const assetWhere = {
      acquisitionDate: { [Op.lte]: asOfStr },
      status: { [Op.ne]: 'written_off' },
      [Op.or]: [{ disposalDate: null }, { disposalDate: { [Op.gt]: asOfStr } }],
    };
    const heldAssets = await FixedAsset.findAll({ where: assetWhere, attributes: ['id', 'cost'] });
    const heldIds = heldAssets.map((a) => a.id);
    const fixedAssetsAtCost = heldAssets.reduce((s, a) => s + num(a.cost), 0);
    // Filter on `period`, NOT periodDate. periodDate is the LAST day of the
    // month, so for the current month it sits in the future relative to an
    // as-of date of today — the asset side would omit a charge the P&L (which
    // filters on the month) has already taken, and the sheet would drift by
    // exactly one month's depreciation.
    const accumulatedDepreciation = heldIds.length
      ? num(await DepreciationEntry.sum('amount', {
        where: { fixedAssetId: { [Op.in]: heldIds }, period: { [Op.lte]: monthKeyLocal(asOfEnd) } },
      }))
      : 0;
    const fixedAssetsNet = fixedAssetsAtCost - accumulatedDepreciation;

    // ── Liabilities: supplier payable ───────────────────────────
    // With the no-credit rule this should sit at ~0, which makes it a
    // useful self-check rather than a real liability line.
    const suppliers = await Supplier.findAll({ attributes: ['id'] });
    let supplierPayable = 0, supplierAdvances = 0;
    for (const s of suppliers) {
      const bal = num(await computeSupplierBalance(s.id));
      if (bal > 0) supplierPayable += bal;
      else if (bal < 0) supplierAdvances += -bal;
    }

    // ── Equity ──────────────────────────────────────────────────
    const capEntries = await CapitalEntry.findAll({
      where: { status: 'active', entryDate: { [Op.lte]: asOfStr } },
      attributes: ['type', 'amount'],
    });
    let capitalContributions = 0, drawings = 0;
    for (const e of capEntries) {
      if (e.type === 'contribution') capitalContributions += num(e.amount);
      else drawings += num(e.amount);
    }

    // Retained profit — all-time, through the same P&L formula the
    // Profit & Loss screen uses, so the two can never disagree.
    const pnl = await computePnl({ from: new Date('1970-01-01T00:00:00'), to: asOfEnd });
    const retainedProfit = num(pnl.netProfit);

    const totalAssets = cashInHand + cashInBank + inventory + fixedAssetsNet + supplierAdvances;
    const totalLiabilities = supplierPayable;
    const ownersEquity = capitalContributions - drawings + retainedProfit;
    const totalLiabilitiesAndEquity = totalLiabilities + ownersEquity;
    const difference = round3(totalAssets - totalLiabilitiesAndEquity);

    // ── Reconciliation ──────────────────────────────────────────
    // Name and quantify the gaps rather than plugging them.
    const unbankedOnlineRevenue = num(await Order.sum('totalAmount', {
      where: {
        paymentStatus: 'paid',
        cashierSessionId: null,          // POS orders carry one; web orders don't
        createdAt: { [Op.lte]: asOfEnd },
      },
    }));
    const cashAccountOpeningBalances = accounts.reduce((s, a) => s + num(a.openingBalance), 0);
    const supplierOpeningBalances = num(await Supplier.sum('openingBalance'));
    const assetsWithoutCashSource = num(await FixedAsset.sum('cost', {
      where: { cashAccountId: null, ...assetWhere },
    }));

    res.json({
      asOf: asOfStr,
      locationId: null,   // a per-location balance sheet needs equity allocation
      assets: {
        cashInHand: round3(cashInHand),
        cashInBank: round3(cashInBank),
        cashByAccount,
        inventory: round3(inventory),
        fixedAssetsAtCost: round3(fixedAssetsAtCost),
        accumulatedDepreciation: round3(accumulatedDepreciation),
        fixedAssetsNet: round3(fixedAssetsNet),
        supplierAdvances: round3(supplierAdvances),
        total: round3(totalAssets),
      },
      liabilities: {
        supplierPayable: round3(supplierPayable),
        total: round3(totalLiabilities),
      },
      equity: {
        capitalContributions: round3(capitalContributions),
        drawings: round3(drawings),
        retainedProfit: round3(retainedProfit),
        total: round3(ownersEquity),
      },
      totalLiabilitiesAndEquity: round3(totalLiabilitiesAndEquity),
      reconciliation: {
        difference,
        balanced: Math.abs(difference) < 0.01,
        quantified: {
          unbankedOnlineRevenue: round3(unbankedOnlineRevenue),
          cashAccountOpeningBalances: round3(cashAccountOpeningBalances),
          supplierOpeningBalances: round3(supplierOpeningBalances),
          assetsAcquiredWithoutCashSource: round3(assetsWithoutCashSource),
        },
        notes: [
          'Online orders record revenue but never write a cash-account entry, so a web sale raises equity without raising an asset.',
          'Cash-account opening balances have no equity counterpart. Record start-up cash as a Capital contribution instead.',
          'Supplier opening balances have no matching asset.',
          'Fixed assets bought without a cash account sit on the books with nothing credited against them.',
          'Inventory is valued at current cost price, so this sheet cannot be rewound truthfully to a past date.',
          'This is a single-entry ledger with no chart of accounts — the sheet is an aggregation, not a trial balance.',
        ],
      },
    });
  } catch (err) {
    console.error('[accounting/balance-sheet]', err);
    res.status(500).json({ message: err.message });
  }
});

export default router;
