import { useEffect, useState } from 'react';
import api from '../api/axios';

// Free-delivery threshold and standard rate, as the server charges them
// (edited in the hub's Online Store → Delivery). Read once per page load.
let ratesPromise = null;
export const loadShippingRates = () => {
  ratesPromise ??= api.get('/settings/shipping')
    .then((r) => ({ freeAbove: parseFloat(r.data?.freeAbove) || 0, flatRate: parseFloat(r.data?.flatRate) || 0 }))
    .catch(() => { ratesPromise = null; return null; });
  return ratesPromise;
};

/** An amount for running text: "135", or "99.50" when it has fils. */
export const amountText = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

/** Changing the threshold in an admin screen makes the next read fetch it again. */
export const forgetShippingRates = () => { ratesPromise = null; };

/** `{ freeAbove, flatRate }`, or null until loaded. */
export function useShippingRates() {
  const [rates, setRates] = useState(null);
  useEffect(() => {
    let live = true;
    loadShippingRates().then((r) => live && setRates(r));
    return () => { live = false; };
  }, []);
  return rates;
}
