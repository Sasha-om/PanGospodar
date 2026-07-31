"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export interface CartProduct {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
  /**
   * Units available in stock. `undefined` means the source system did not
   * report a quantity for this product, in which case no ceiling is enforced.
   */
  stock?: number;
}

export interface CartItem extends CartProduct {
  quantity: number;
}

interface CartContextValue {
  items: CartItem[];
  /** Adds up to the available stock; never exceeds it. */
  addItem: (product: CartProduct, quantity?: number) => void;
  removeItem: (id: string) => void;
  /** Sets an explicit quantity, clamped to [0, stock]. 0 removes the item. */
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  /** Quantity of a product currently in the cart (0 when absent). */
  getItemQuantity: (id: string) => number;
  /** True when the cart already holds every available unit of this product. */
  isAtStockLimit: (id: string, stock?: number) => boolean;
  /** Sum of ALL unit quantities (not the number of distinct products). */
  totalItems: number;
  totalPrice: number;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

/** Clamp a requested quantity into the range allowed by `stock`. */
function clampToStock(quantity: number, stock?: number): number {
  const floored = Math.max(0, Math.floor(quantity));
  if (typeof stock !== "number" || !Number.isFinite(stock)) {
    return floored; // unknown stock — no ceiling
  }
  return Math.min(floored, Math.max(0, Math.floor(stock)));
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const addItem = useCallback((product: CartProduct, quantity = 1) => {
    setItems((prev) => {
      const existing = prev.find((item) => item.id === product.id);

      // `product.stock` is the freshest value (read when the page rendered),
      // so it wins over whatever was stored when the item was first added.
      const stock = product.stock;

      if (typeof stock === "number" && stock <= 0) {
        return prev; // out of stock — nothing to add
      }

      if (!existing) {
        const initial = clampToStock(quantity, stock);
        if (initial <= 0) {
          return prev;
        }
        return [...prev, { ...product, stock, quantity: initial }];
      }

      const nextQuantity = clampToStock(existing.quantity + quantity, stock);
      if (nextQuantity === existing.quantity) {
        return prev; // already at the ceiling — no state churn
      }
      return prev.map((item) =>
        item.id === product.id
          ? { ...item, stock, quantity: nextQuantity }
          : item,
      );
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const updateQuantity = useCallback((id: string, quantity: number) => {
    setItems((prev) => {
      const existing = prev.find((item) => item.id === id);
      if (!existing) {
        return prev;
      }
      const next = clampToStock(quantity, existing.stock);
      if (next <= 0) {
        return prev.filter((item) => item.id !== id);
      }
      if (next === existing.quantity) {
        return prev;
      }
      return prev.map((item) =>
        item.id === id ? { ...item, quantity: next } : item,
      );
    });
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const getItemQuantity = useCallback(
    (id: string) => items.find((item) => item.id === id)?.quantity ?? 0,
    [items],
  );

  const isAtStockLimit = useCallback(
    (id: string, stock?: number) => {
      if (typeof stock !== "number" || !Number.isFinite(stock)) {
        return false;
      }
      const inCart = items.find((item) => item.id === id)?.quantity ?? 0;
      return inCart >= stock;
    },
    [items],
  );

  // Sum of every unit in the cart — this is what the header badge shows.
  const totalItems = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items],
  );
  const totalPrice = useMemo(
    () => items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [items],
  );

  const value = useMemo(
    () => ({
      items,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
      getItemQuantity,
      isAtStockLimit,
      totalItems,
      totalPrice,
    }),
    [
      items,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
      getItemQuantity,
      isAtStockLimit,
      totalItems,
      totalPrice,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
