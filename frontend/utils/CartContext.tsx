import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================================================
// UNIFIED CART — single shared cart for the whole customer app.
// Menu, Home (popular + AI builder), AI Diet Assistant, Budget/Build, Combo,
// Smart Fill and Reorder ALL write to this one cart. Persisted to AsyncStorage.
// ============================================================================

export type CartItem = {
  id: string;
  product_id: string;
  name: string;
  product_type: 'single' | 'ready_made';
  grams: number;            // single: total grams | ready_made: serving_grams * quantity (display)
  quantity: number;         // ready_made: plates | single: 1
  serving_grams?: number;
  fixed_price?: number;
  cost_per_100g: number;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  diet_type?: string;
  image_url?: string;
  category?: string;
  preparation_time_minutes?: number;
};

const SINGLE_STEP = 50; // grams per +/- tap for build-your-own items
const STORAGE_KEY = 'fuel_cart_v1';
const ORDERTYPE_KEY = 'fuel_order_type_v1';

export const itemUnitPrice = (i: CartItem) =>
  i.product_type === 'ready_made'
    ? (i.fixed_price || (i.cost_per_100g * (i.serving_grams || 300)) / 100)
    : i.cost_per_100g; // per 100g
export const itemPrice = (i: CartItem) =>
  i.product_type === 'ready_made'
    ? itemUnitPrice(i) * (i.quantity || 1)
    : (i.grams / 100) * i.cost_per_100g;
const itemFactor = (i: CartItem) =>
  i.product_type === 'ready_made' ? ((i.serving_grams || 300) / 100) * (i.quantity || 1) : i.grams / 100;

function normalize(raw: any): CartItem {
  const isReady = (raw.product_type === 'ready_made');
  return {
    id: raw.id || raw.product_id,
    product_id: raw.product_id || raw.id,
    name: raw.name || raw.product_name || 'Item',
    product_type: isReady ? 'ready_made' : 'single',
    grams: raw.grams || (isReady ? (raw.serving_grams || 300) : 100),
    quantity: raw.quantity || 1,
    serving_grams: raw.serving_grams || 300,
    fixed_price: raw.fixed_price,
    cost_per_100g: raw.cost_per_100g || 0,
    calories_per_100g: raw.calories_per_100g ?? raw.calories ?? 0,
    protein_per_100g: raw.protein_per_100g ?? raw.protein ?? 0,
    carbs_per_100g: raw.carbs_per_100g ?? raw.carbs ?? 0,
    fat_per_100g: raw.fat_per_100g ?? raw.fat ?? 0,
    diet_type: raw.diet_type || 'veg',
    image_url: raw.image_url,
    category: raw.category || '',
    preparation_time_minutes: raw.preparation_time_minutes,
  };
}

type CartCtx = {
  items: CartItem[];
  orderType: string;
  setOrderType: (t: string) => void;
  addItem: (raw: any) => void;
  addMeal: (rawItems: any[]) => void;
  replaceCart: (rawItems: any[]) => void;
  incItem: (id: string) => void;
  decItem: (id: string) => void;
  removeItem: (id: string) => void;
  getItem: (id: string) => CartItem | undefined;
  clear: () => void;
  count: number;
  subtotal: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

const Ctx = createContext<CartCtx | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [orderType, setOrderTypeState] = useState('dine-in');
  const [hydrated, setHydrated] = useState(false);

  // hydrate
  useEffect(() => {
    (async () => {
      try {
        const [c, ot] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(ORDERTYPE_KEY),
        ]);
        if (c) setItems(JSON.parse(c));
        if (ot) setOrderTypeState(ot);
      } catch {}
      setHydrated(true);
    })();
  }, []);

  // persist
  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items)).catch(() => {});
  }, [items, hydrated]);

  const setOrderType = useCallback((t: string) => {
    setOrderTypeState(t);
    AsyncStorage.setItem(ORDERTYPE_KEY, t).catch(() => {});
  }, []);

  const addItem = useCallback((raw: any) => {
    const n = normalize(raw);
    setItems(prev => {
      const idx = prev.findIndex(c => c.id === n.id);
      if (idx >= 0) {
        const next = [...prev];
        const cur = next[idx];
        if (cur.product_type === 'ready_made') {
          next[idx] = { ...cur, quantity: cur.quantity + 1, grams: (cur.serving_grams || 300) * (cur.quantity + 1) };
        } else {
          next[idx] = { ...cur, grams: cur.grams + 100 };
        }
        return next;
      }
      return [...prev, n];
    });
  }, []);

  // For AI / build meals: add many, summing grams when same product already present.
  const addMeal = useCallback((rawItems: any[]) => {
    setItems(prev => {
      const next = [...prev];
      rawItems.forEach(raw => {
        const n = normalize(raw);
        const idx = next.findIndex(c => c.id === n.id);
        if (idx >= 0) {
          const cur = next[idx];
          if (cur.product_type === 'ready_made') {
            next[idx] = { ...cur, quantity: cur.quantity + n.quantity, grams: (cur.serving_grams || 300) * (cur.quantity + n.quantity) };
          } else {
            next[idx] = { ...cur, grams: cur.grams + n.grams };
          }
        } else {
          next.push(n);
        }
      });
      return next;
    });
  }, []);

  const replaceCart = useCallback((rawItems: any[]) => {
    setItems(rawItems.map(normalize));
  }, []);

  const incItem = useCallback((id: string) => {
    setItems(prev => prev.map(c => {
      if (c.id !== id) return c;
      if (c.product_type === 'ready_made') return { ...c, quantity: c.quantity + 1, grams: (c.serving_grams || 300) * (c.quantity + 1) };
      return { ...c, grams: c.grams + SINGLE_STEP };
    }));
  }, []);

  const decItem = useCallback((id: string) => {
    setItems(prev => prev.flatMap(c => {
      if (c.id !== id) return [c];
      if (c.product_type === 'ready_made') {
        const q = c.quantity - 1;
        return q <= 0 ? [] : [{ ...c, quantity: q, grams: (c.serving_grams || 300) * q }];
      }
      const g = c.grams - SINGLE_STEP;
      return g <= 0 ? [] : [{ ...c, grams: g }];
    }));
  }, []);

  const removeItem = useCallback((id: string) => setItems(prev => prev.filter(c => c.id !== id)), []);
  const getItem = useCallback((id: string) => items.find(c => c.id === id), [items]);
  const clear = useCallback(() => setItems([]), []);

  const totals = useMemo(() => {
    let subtotal = 0, calories = 0, protein = 0, carbs = 0, fat = 0;
    items.forEach(i => {
      const f = itemFactor(i);
      subtotal += itemPrice(i);
      calories += i.calories_per_100g * f;
      protein += i.protein_per_100g * f;
      carbs += i.carbs_per_100g * f;
      fat += i.fat_per_100g * f;
    });
    return { subtotal, calories, protein, carbs, fat };
  }, [items]);

  const value: CartCtx = {
    items, orderType, setOrderType,
    addItem, addMeal, replaceCart, incItem, decItem, removeItem, getItem, clear,
    count: items.reduce((s, i) => s + (i.product_type === 'ready_made' ? i.quantity : 1), 0),
    subtotal: totals.subtotal,
    calories: totals.calories,
    protein: totals.protein,
    carbs: totals.carbs,
    fat: totals.fat,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCart must be used within CartProvider');
  return c;
}
