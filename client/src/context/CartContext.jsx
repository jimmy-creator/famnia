import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import CartAddedPopup from '../components/CartAddedPopup';
import api from '../api/axios';
import { showToast } from '../utils/toast';
import { variantFor } from '../lib/productImages';

const CartContext = createContext();

export const useCart = () => useContext(CartContext);

const makeCartKey = (productId, selectedVariant) => {
  if (!selectedVariant) return String(productId);
  const parts = Object.entries(selectedVariant)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`);
  return `${productId}__${parts.join('_')}`;
};

// Units of a cart line still in stock, from the product data the line carries.
const stockOf = (item) => {
  if (item.variants?.length) return variantFor(item, item.selectedVariant)?.stock ?? Infinity;
  return item.stock ?? Infinity;
};

export function CartProvider({ children }) {
  const [cart, setCart] = useState(() => {
    const saved = localStorage.getItem('cart');
    if (!saved) return [];
    // Migrate old cart items that don't have cartKey
    const parsed = JSON.parse(saved);
    return parsed.map((item) => ({
      ...item,
      cartKey: item.cartKey || makeCartKey(item.id, item.selectedVariant),
    }));
  });

  const [lastAdded, setLastAdded] = useState(null);
  const cartRef = useRef(cart);

  useEffect(() => {
    cartRef.current = cart;
    localStorage.setItem('cart', JSON.stringify(cart));
  }, [cart]);

  // Re-check the cart against the live catalogue: anything sold out (the API
  // no longer lists it) leaves the cart, quantities are capped at the stock
  // left, and prices / product codes are refreshed.
  const refreshCart = useCallback(async () => {
    const ids = [...new Set(cartRef.current.map((i) => i.id))];
    if (!ids.length) return;
    let live;
    try {
      const { data } = await api.get('/products', { params: { ids: ids.join(','), limit: ids.length } });
      live = new Map((data.products || []).map((p) => [p.id, p]));
    } catch {
      return; // offline or server error: leave the cart as it is
    }
    const removed = [];
    const next = cartRef.current.flatMap((item) => {
      const p = live.get(item.id);
      const variant = p?.variants?.length ? variantFor(p, item.selectedVariant) : null;
      const stock = !p ? 0 : p.variants?.length ? (variant?.stock ?? 0) : (p.stock ?? 0);
      if (stock <= 0) {
        removed.push(item.name);
        return [];
      }
      return [{
        ...item,
        ...p,
        price: variant?.price != null ? variant.price : p.price,
        quantity: Math.min(item.quantity, stock),
        selectedVariant: item.selectedVariant,
        cartKey: item.cartKey,
      }];
    });
    setCart(next);
    if (removed.length) {
      showToast(`Sold out and removed from your cart: ${[...new Set(removed)].join(', ')}`, 'error');
    }
  }, []);

  useEffect(() => { refreshCart(); }, [refreshCart]);

  const addToCart = (product, quantity = 1, selectedVariant = null) => {
    setLastAdded({ product, quantity, selectedVariant, ts: Date.now() });
    setCart((prev) => {
      const key = makeCartKey(product.id, selectedVariant);
      const existing = prev.find((item) => item.cartKey === key);
      if (existing) {
        return prev.map((item) =>
          item.cartKey === key
            ? { ...item, quantity: Math.min(item.quantity + quantity, stockOf(item)) }
            : item
        );
      }

      // Use variant price if available
      let effectivePrice = product.price;
      if (selectedVariant && product.variants) {
        const variant = product.variants.find((v) =>
          Object.entries(selectedVariant).every(([k, val]) => v.options[k] === val)
        );
        if (variant?.price != null) effectivePrice = variant.price;
      }

      return [...prev, {
        ...product,
        price: effectivePrice,
        quantity,
        selectedVariant,
        cartKey: key,
      }];
    });
  };

  const removeFromCart = (cartKey) => {
    setCart((prev) => prev.filter((item) => item.cartKey !== cartKey));
  };

  const updateQuantity = (cartKey, quantity) => {
    if (quantity <= 0) {
      removeFromCart(cartKey);
      return;
    }
    setCart((prev) =>
      prev.map((item) =>
        item.cartKey === cartKey ? { ...item, quantity: Math.min(quantity, stockOf(item)) } : item
      )
    );
  };

  const clearCart = () => setCart([]);

  const cartTotal = cart.reduce(
    (sum, item) => sum + parseFloat(item.price) * item.quantity,
    0
  );

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const dismissLastAdded = () => setLastAdded(null);

  const value = {
    cart,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    refreshCart,
    cartTotal,
    cartCount,
    lastAdded,
    dismissLastAdded,
  };

  return (
    <CartContext.Provider value={value}>
      {children}
      <CartAddedPopup />
    </CartContext.Provider>
  );
}
