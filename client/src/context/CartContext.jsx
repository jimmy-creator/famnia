import { createContext, useContext, useState, useEffect } from 'react';
import CartAddedPopup from '../components/CartAddedPopup';

const CartContext = createContext();

export const useCart = () => useContext(CartContext);

const makeCartKey = (productId, selectedVariant) => {
  if (!selectedVariant) return String(productId);
  const parts = Object.entries(selectedVariant)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`);
  return `${productId}__${parts.join('_')}`;
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

  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(cart));
  }, [cart]);

  const addToCart = (product, quantity = 1, selectedVariant = null) => {
    setLastAdded({ product, quantity, selectedVariant, ts: Date.now() });
    setCart((prev) => {
      const key = makeCartKey(product.id, selectedVariant);
      const existing = prev.find((item) => item.cartKey === key);
      if (existing) {
        return prev.map((item) =>
          item.cartKey === key
            ? { ...item, quantity: item.quantity + quantity }
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
        item.cartKey === cartKey ? { ...item, quantity } : item
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
