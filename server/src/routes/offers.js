import { Router } from 'express';
import { Offer, Product } from '../models/index.js';
import { protect, requirePermission } from '../middleware/auth.js';
import { loadOffers } from '../services/offers.js';

/**
 * Offers & sales (hub → Offers): timed offer prices on chosen products.
 * Managed by whoever manages coupons. Every write reloads the in-memory
 * offer cache, so the storefront picks the change up immediately.
 */
const router = Router();
router.use(protect, requirePermission('coupons'));

const bad = (res, message) => res.status(400).json({ message });

/** 'YYYY-MM-DDTHH:mm' from the hub is store-local time; the server runs on the store's clock (tz.js). */
function parseLocal(v) {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

async function withProducts(offers) {
  const ids = [...new Set(offers.flatMap((o) => (o.items || []).map((i) => Number(i.productId))))];
  const products = ids.length
    ? await Product.findAll({ where: { id: ids }, attributes: ['id', 'name', 'price', 'images', 'barcode', 'active', 'hideOnline'] })
    : [];
  const byId = new Map(products.map((p) => [p.id, p]));
  return offers.map((o) => {
    const json = o.toJSON();
    json.discountValue = json.discountValue == null ? null : parseFloat(json.discountValue);
    json.items = (json.items || []).map((i) => {
      const p = byId.get(Number(i.productId));
      return {
        productId: Number(i.productId),
        price: i.price == null ? null : parseFloat(i.price),
        name: p?.name ?? `Deleted product #${i.productId}`,
        productCode: p?.barcode ?? null,
        listPrice: p ? parseFloat(p.price) : null,
        image: (Array.isArray(p?.images) && p.images[0]) || null,
        onlineHidden: p ? !p.active || p.hideOnline : true,
      };
    });
    return json;
  });
}

async function validate(body) {
  const name = String(body.name ?? '').trim().slice(0, 120);
  if (!name) return { error: 'Give the offer a name, e.g. "National Day Sale".' };
  const startsAt = parseLocal(body.startsAt);
  const endsAt = parseLocal(body.endsAt);
  if (!startsAt || !endsAt) return { error: 'Choose when the offer starts and ends.' };
  if (endsAt <= startsAt) return { error: 'The offer must end after it starts.' };
  const discountType = body.discountType === 'price' ? 'price' : 'percent';
  const discountValue = parseFloat(body.discountValue);
  if (discountType === 'percent' && !(discountValue > 0 && discountValue < 100)) {
    return { error: 'Enter a discount between 1% and 99%.' };
  }
  const seen = new Set();
  const items = [];
  for (const raw of Array.isArray(body.items) ? body.items : []) {
    const productId = parseInt(raw?.productId, 10);
    if (!productId || seen.has(productId)) continue;
    seen.add(productId);
    const item = { productId };
    if (discountType === 'price') {
      const price = parseFloat(raw.price);
      if (!(price > 0)) return { error: 'Every product needs an offer price above 0.' };
      item.price = price;
    }
    items.push(item);
  }
  if (!items.length) return { error: 'Add at least one product to the offer.' };
  const found = await Product.findAll({ where: { id: [...seen] }, attributes: ['id', 'name', 'price'] });
  if (found.length !== items.length) return { error: 'A product in this offer no longer exists.' };
  if (discountType === 'price') {
    const tooHigh = items.find((i) => i.price >= parseFloat(found.find((p) => p.id === i.productId).price));
    if (tooHigh) {
      const p = found.find((x) => x.id === tooHigh.productId);
      return { error: `${p.name}: the offer price must be lower than its normal price (QAR ${parseFloat(p.price).toFixed(2)}).` };
    }
  }
  return {
    fields: {
      name, startsAt, endsAt, discountType, discountValue: discountType === 'percent' ? discountValue : null, items,
      active: body.active !== false,
    },
  };
}

router.get('/', async (req, res) => {
  const offers = await Offer.findAll({ order: [['startsAt', 'DESC'], ['id', 'DESC']] });
  res.set('Cache-Control', 'no-store');
  res.json(await withProducts(offers));
});

router.post('/', async (req, res) => {
  const { error, fields } = await validate(req.body || {});
  if (error) return bad(res, error);
  const offer = await Offer.create({ ...fields, createdBy: req.user.id });
  await loadOffers();
  res.status(201).json((await withProducts([offer]))[0]);
});

router.put('/:id', async (req, res) => {
  const offer = await Offer.findByPk(req.params.id);
  if (!offer) return res.status(404).json({ message: 'Offer not found' });
  // Pause / resume only.
  if (Object.keys(req.body || {}).length === 1 && 'active' in req.body) {
    await offer.update({ active: Boolean(req.body.active) });
  } else {
    const { error, fields } = await validate(req.body || {});
    if (error) return bad(res, error);
    await offer.update(fields);
  }
  await loadOffers();
  res.json((await withProducts([offer]))[0]);
});

router.delete('/:id', async (req, res) => {
  const offer = await Offer.findByPk(req.params.id);
  if (!offer) return res.status(404).json({ message: 'Offer not found' });
  await offer.destroy();
  await loadOffers();
  res.json({ ok: true });
});

export default router;
