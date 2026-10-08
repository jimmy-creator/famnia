/**
 * Temporary sales-order cart filled from the Products list. It only holds
 * SKU key + quantity in this browser; the New Sales Order page takes the
 * items over, and order confirmation does the stock checks and deduction.
 */
import { useSyncExternalStore } from 'react';

const KEY = 'femnia-pos-cart-v1';
const listeners = new Set();
let cache = null;
const EMPTY = [];

function read() {
  if (typeof window === 'undefined') return EMPTY;
  if (cache) return cache;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
    cache = Array.isArray(parsed)
      ? parsed.filter((e) => e && typeof e.key === 'string' && Number(e.quantity) > 0)
      : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(next) {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — the cart lives in memory for this tab */
  }
  listeners.forEach((l) => l());
}

export const getCart = () => read();

/** Adds one unit; returns false when stock would be exceeded. */
export function addToCart(key, available) {
  const cur = read();
  const existing = cur.find((e) => e.key === key);
  const qty = (existing?.quantity ?? 0) + 1;
  if (qty > available) return false;
  write(existing ? cur.map((e) => (e.key === key ? { ...e, quantity: qty } : e)) : [...cur, { key, quantity: 1 }]);
  return true;
}

export const clearCart = () => write([]);

export function setCart(entries) {
  write(entries.filter((e) => e && typeof e.key === 'string' && Number(e.quantity) > 0));
}

export function useCart() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => EMPTY,
  );
}
