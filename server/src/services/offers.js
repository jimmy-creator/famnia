import { Op } from 'sequelize';
import { Offer } from '../models/index.js';
import { roundMoney } from '../utils/money.js';

/**
 * Timed offers on the storefront price.
 *
 * Offers not yet ended are held in memory (reloaded on every offer write and
 * once a minute), so the synchronous paths — publicProduct() and the checkout
 * price lookup — can ask "what does this cost right now?" without a query.
 * The start / end window is checked at call time, so an offer starts and
 * stops on the minute without waiting for a reload.
 */
let cache = [];
let timer = null;

export async function loadOffers() {
  try {
    const rows = await Offer.findAll({ where: { active: true, endsAt: { [Op.gt]: new Date() } } });
    cache = rows.map((o) => ({
      id: o.id,
      name: o.name,
      startsAt: new Date(o.startsAt).getTime(),
      endsAt: new Date(o.endsAt).getTime(),
      discountType: o.discountType,
      discountValue: parseFloat(o.discountValue) || 0,
      items: new Map((Array.isArray(o.items) ? o.items : []).map((i) => [Number(i.productId), i])),
    }));
  } catch (err) {
    // A missing table on first boot, or a DB blip: keep serving normal prices.
    console.error('[offers] load failed:', err.message);
  }
}

export function startOfferRefresh() {
  loadOffers();
  if (!timer) timer = setInterval(loadOffers, 60 * 1000);
}

const running = (o, now) => o.startsAt <= now && now < o.endsAt;

/** The price `basePrice` drops to under one offer's rule for this product. */
function priceUnder(offer, item, basePrice) {
  if (offer.discountType === 'price') {
    const p = parseFloat(item.price);
    return Number.isFinite(p) && p >= 0 ? Math.min(roundMoney(p), basePrice) : basePrice;
  }
  const pct = Math.min(Math.max(offer.discountValue, 0), 100);
  return roundMoney(basePrice * (1 - pct / 100));
}

/**
 * The best running offer for a product at `basePrice`: { price, offer } or
 * null. Overlapping offers never stack — the lowest price wins.
 */
export function offerPriceFor(productId, basePrice, now = Date.now()) {
  const base = parseFloat(basePrice);
  if (!Number.isFinite(base) || base <= 0) return null;
  let best = null;
  for (const o of cache) {
    if (!running(o, now)) continue;
    const item = o.items.get(Number(productId));
    if (!item) continue;
    const price = priceUnder(o, item, base);
    if (price < base && (!best || price < best.price)) best = { price, offer: o };
  }
  return best;
}

/** Checkout: the price actually charged for one unit. */
export const effectivePrice = (productId, basePrice) => offerPriceFor(productId, basePrice)?.price ?? parseFloat(basePrice);

/** Ids of products in a running offer — the storefront's "Offers" listing. */
export function productIdsOnOffer(now = Date.now()) {
  const ids = new Set();
  for (const o of cache) if (running(o, now)) for (const id of o.items.keys()) ids.add(id);
  return [...ids];
}

/**
 * Rewrite a public product JSON with its offer: the offer price becomes
 * `price` (product and each variant), the price it replaces becomes
 * `comparePrice` (kept if the product already had a higher one), and
 * `offer` names the sale and when it ends.
 */
export function applyOfferToJson(json) {
  const now = Date.now();
  let shown = null;
  const swap = (target) => {
    const hit = offerPriceFor(json.id, target.price, now);
    if (!hit) return;
    const original = parseFloat(target.price);
    const compare = parseFloat(target.comparePrice);
    target.comparePrice = Number.isFinite(compare) && compare > original ? compare : original;
    target.price = hit.price;
    shown = shown || hit.offer;
  };
  swap(json);
  if (Array.isArray(json.variants)) json.variants.forEach((v) => v && v.price != null && swap(v));
  if (shown) json.offer = { id: shown.id, name: shown.name, endsAt: new Date(shown.endsAt).toISOString() };
  return json;
}
