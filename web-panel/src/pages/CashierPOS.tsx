import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';

const GST_RATE = 5;
const POS_DIET_TAGS = ['veg', 'non-veg', 'vegan', 'eggetarian', 'jain', 'keto', 'high-protein'];
const POS_DIET_LABEL: Record<string, string> = { 'veg': 'Veg', 'non-veg': 'Non-Veg', 'vegan': 'Vegan', 'eggetarian': 'Egg', 'jain': 'Jain', 'keto': 'Keto', 'high-protein': 'High-Pro' };
const dietTagsOf = (p: any): string[] => (p?.diet_types && p.diet_types.length ? p.diet_types : [p?.diet_type]).filter(Boolean);

export default function CashierPOS() {
  const { user } = useAuth();
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [selectedCat, setSelectedCat] = useState('All');
  const [search, setSearch] = useState('');
  const [dietFilter, setDietFilter] = useState<string[]>([]);
  const [cart, setCart] = useState<any[]>([]);
  const [orderType, setOrderType] = useState('dine-in');
  const [placing, setPlacing] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [activeHoldId, setActiveHoldId] = useState<string | null>(null);

  // Product detail modal
  const [detailProduct, setDetailProduct] = useState<any>(null);
  const [detailGrams, setDetailGrams] = useState('100');
  const [detailQty, setDetailQty] = useState(1);
  const [buildMode, setBuildMode] = useState<'grams' | 'mrp'>('grams');
  const [mrpTarget, setMrpTarget] = useState('50');

  // AI
  const [showAI, setShowAI] = useState(false);
  const [aiGoal, setAiGoal] = useState('maintenance');
  const [aiDiet, setAiDiet] = useState('both');
  const [aiBudget, setAiBudget] = useState('200');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);

  // Coupon (server-quoted; appliedCode is the code sent to /cart/quote)
  const [couponCode, setCouponCode] = useState('');
  const [appliedCode, setAppliedCode] = useState('');

  // Server-authoritative bill (FIX 4 — /cart/quote is the single source of truth
  // for subtotal / discount / GST / total; client math is optimistic-only).
  const [quote, setQuote] = useState<any>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  // Payment
  const [showPayment, setShowPayment] = useState(false);
  const [paymentMode, setPaymentMode] = useState('cash');
  const [tendered, setTendered] = useState('');   // FIX 4.3 — cash received
  const [showReceipt, setShowReceipt] = useState<any>(null);

  // View & offers
  const [viewTab, setViewTab] = useState<'single' | 'readymade'>('single');
  const [showOfferProducts, setShowOfferProducts] = useState<any>(null);

  // Editing cart item
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editGramsVal, setEditGramsVal] = useState('');
  const [editPriceVal, setEditPriceVal] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [p, c, o] = await Promise.all([api('/products'), api('/categories'), api('/offers')]);
        setProducts(p);
        setCategories(c);
        setOffers(o.filter((of: any) => of.is_active));
      } catch {}
    })();
    // Check for resumed held bill
    const params = new URLSearchParams(window.location.search);
    const resumeData = params.get('resume');
    if (resumeData) {
      try {
        const bill = JSON.parse(decodeURIComponent(resumeData));
        setCustomerName(bill.customer_name || '');
        setOrderType(bill.order_type || 'dine-in');
        setActiveHoldId(bill.id);
        if (bill.coupon_code) { setCouponCode(bill.coupon_code); setAppliedCode(bill.coupon_code); }
        // Restore cart items
        if (bill.items?.length) {
          setCart(bill.items.map((item: any) => ({
            ...item,
            cartKey: item.product_type === 'ready_made' ? `${item.id}_rm_${Date.now()}_${Math.random()}` : undefined,
          })));
        }
        // Clean URL
        window.history.replaceState({}, '', '/cashier');
      } catch {}
    }
  }, []);

  const singleProducts = products.filter(p => p.product_type !== 'ready_made');
  const readyMadeProducts = products.filter(p => p.product_type === 'ready_made');
  const activeProducts = viewTab === 'single' ? singleProducts : readyMadeProducts;

  const filtered = activeProducts.filter(p => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (dietFilter.length) {
      const tags = dietTagsOf(p);
      if (!dietFilter.every(t => tags.includes(t))) return false;
    }
    if (selectedCat === 'All') return true;
    return p.category === selectedCat || p.diet_type === selectedCat;
  });

  // PR-1: group Build-Your-Own singles by subcategory in canonical order;
  // anything without a (known) subcategory falls into "Other" shown last.
  // Server already filters out is_sellable=false items, so we render what we get.
  const SUBCAT_ORDER = ['Base', 'Protein', 'Veggies', 'Sauce', 'Toppings'];
  const groupedSingles = (() => {
    const groups: Record<string, any[]> = {};
    for (const p of filtered) {
      const key = (p.subcategory && String(p.subcategory).trim()) ? String(p.subcategory).trim() : 'Other';
      (groups[key] ||= []).push(p);
    }
    const ordered: { label: string; items: any[] }[] = [];
    for (const label of SUBCAT_ORDER) if (groups[label]) { ordered.push({ label, items: groups[label] }); delete groups[label]; }
    for (const label of Object.keys(groups).filter(k => k !== 'Other').sort()) ordered.push({ label, items: groups[label] });
    if (groups['Other']) ordered.push({ label: 'Other', items: groups['Other'] });
    return ordered;
  })();

  const openDetail = (product: any) => {
    setDetailProduct(product);
    if (product.product_type === 'ready_made') {
      setDetailQty(1);
    } else {
      setDetailGrams('100');
      setBuildMode('grams');
      setMrpTarget('50');
    }
  };

  const calcItem = (product: any, grams: number) => {
    const f = grams / 100;
    return {
      ...product,
      grams,
      plateQty: 0,
      price: Math.round(f * product.cost_per_100g * 100) / 100,
      calories: Math.round(f * product.calories_per_100g),
      protein: Math.round(f * product.protein_per_100g * 10) / 10,
      carbs: Math.round(f * (product.carbs_per_100g || 0) * 10) / 10,
      fat: Math.round(f * (product.fat_per_100g || 0) * 10) / 10,
    };
  };

  const addSingleToCart = () => {
    if (!detailProduct) return;
    let grams: number;
    if (buildMode === 'mrp') {
      grams = Math.round(((parseFloat(mrpTarget) || 50) / detailProduct.cost_per_100g) * 100);
    } else {
      grams = parseFloat(detailGrams) || 100;
    }
    if (grams <= 0) return;
    const item = calcItem(detailProduct, grams);
    // Merge with existing same product
    setCart(prev => {
      const idx = prev.findIndex(c => c.id === item.id && c.product_type !== 'ready_made');
      if (idx >= 0) {
        const u = [...prev];
        const newGrams = u[idx].grams + grams;
        const f = newGrams / 100;
        u[idx] = { ...u[idx], grams: newGrams, price: Math.round(f * detailProduct.cost_per_100g * 100) / 100, calories: Math.round(f * detailProduct.calories_per_100g), protein: Math.round(f * detailProduct.protein_per_100g * 10) / 10, carbs: Math.round(f * (detailProduct.carbs_per_100g || 0) * 10) / 10, fat: Math.round(f * (detailProduct.fat_per_100g || 0) * 10) / 10 };
        return u;
      }
      return [...prev, item];
    });
    resetCoupon();
    setDetailProduct(null);
  };

  const addReadyMadeToCart = () => {
    if (!detailProduct) return;
    const qty = detailQty || 1;
    const price = (detailProduct.fixed_price || detailProduct.cost_per_100g * (detailProduct.serving_grams || 200) / 100) * qty;
    const item = {
      ...detailProduct,
      grams: (detailProduct.serving_grams || 200) * qty,
      plateQty: qty,
      price: Math.round(price * 100) / 100,
      calories: Math.round((detailProduct.total_calories_per_serving || detailProduct.calories_per_100g * (detailProduct.serving_grams || 200) / 100) * qty),
      protein: Math.round((detailProduct.total_protein_per_serving || detailProduct.protein_per_100g * (detailProduct.serving_grams || 200) / 100) * qty * 10) / 10,
      carbs: Math.round((detailProduct.total_carbs_per_serving || (detailProduct.carbs_per_100g || 0) * (detailProduct.serving_grams || 200) / 100) * qty * 10) / 10,
      fat: Math.round((detailProduct.total_fat_per_serving || (detailProduct.fat_per_100g || 0) * (detailProduct.serving_grams || 200) / 100) * qty * 10) / 10,
      cartKey: `${detailProduct.id}_rm_${Date.now()}`,
    };
    setCart(prev => [...prev, item]);
    resetCoupon();
    setDetailProduct(null);
  };

  const removeItem = (idx: number) => {
    setCart(prev => prev.filter((_, i) => i !== idx));
    resetCoupon();
    setEditingIdx(null);
  };

  // Edit grams for a cart item (recalculate price)
  const applyEditGrams = (idx: number) => {
    const newG = parseFloat(editGramsVal);
    if (!newG || newG <= 0) return;
    setCart(prev => prev.map((c, i) => {
      if (i !== idx || c.product_type === 'ready_made') return c;
      const f = newG / 100;
      return { ...c, grams: newG, price: Math.round(f * c.cost_per_100g * 100) / 100, calories: Math.round(f * c.calories_per_100g), protein: Math.round(f * c.protein_per_100g * 10) / 10, carbs: Math.round(f * (c.carbs_per_100g || 0) * 10) / 10, fat: Math.round(f * (c.fat_per_100g || 0) * 10) / 10 };
    }));
    resetCoupon();
    setEditingIdx(null);
  };

  // Edit price for a cart item (recalculate grams)
  const applyEditPrice = (idx: number) => {
    const newPrice = parseFloat(editPriceVal);
    if (!newPrice || newPrice <= 0) return;
    setCart(prev => prev.map((c, i) => {
      if (i !== idx || c.product_type === 'ready_made') return c;
      const newG = Math.round((newPrice / c.cost_per_100g) * 100);
      const f = newG / 100;
      return { ...c, grams: newG, price: Math.round(f * c.cost_per_100g * 100) / 100, calories: Math.round(f * c.calories_per_100g), protein: Math.round(f * c.protein_per_100g * 10) / 10, carbs: Math.round(f * (c.carbs_per_100g || 0) * 10) / 10, fat: Math.round(f * (c.fat_per_100g || 0) * 10) / 10 };
    }));
    resetCoupon();
    setEditingIdx(null);
  };

  // Cart edits invalidate any applied coupon; the quote re-runs and re-validates.
  const resetCoupon = () => { if (appliedCode) { setAppliedCode(''); setCouponCode(''); } };

  const totals = cart.reduce((a, c) => ({ price: a.price + c.price, calories: a.calories + c.calories, protein: a.protein + c.protein, carbs: a.carbs + (c.carbs || 0), fat: a.fat + (c.fat || 0) }), { price: 0, calories: 0, protein: 0, carbs: 0, fat: 0 });

  // FIX 4 — debounced server quote. Bill panel renders THESE numbers; the client
  // reduce above is only an optimistic placeholder shown until the quote lands.
  useEffect(() => {
    if (!cart.length) { setQuote(null); setQuoteLoading(false); return; }
    const items = cart.map(c => ({
      product_id: c.id, grams: c.grams, quantity: c.plateQty || 1,
      product_type: c.product_type || 'single', cost_per_100g: c.cost_per_100g,
    }));
    let cancelled = false;
    setQuoteLoading(true);
    const t = setTimeout(async () => {
      try {
        const q = await api('/cart/quote', { method: 'POST', body: {
          items, order_type: orderType,
          coupon_code: appliedCode || undefined,
          store_id: user?.store_id || undefined,
        } });
        if (!cancelled) setQuote(q);
      } catch { if (!cancelled) setQuote(null); }
      finally { if (!cancelled) setQuoteLoading(false); }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [cart, orderType, appliedCode, user?.store_id]);

  // Apply = send the code to the next quote; the quote result is the authority.
  const applyCoupon = () => { if (couponCode.trim()) setAppliedCode(couponCode.trim().toUpperCase()); };

  // Coupon feedback derived from the server quote (no local percentage math).
  const couponApplied = !!(appliedCode && quote?.coupon_applied);
  const couponInfo = couponApplied ? quote.coupon : null;
  const couponError = (appliedCode && quote && !quote.coupon_applied) ? (quote.coupon_error || 'Coupon not valid') : '';

  // Server-authoritative bill, with an optimistic client fallback pre-quote.
  const clientNet = Math.max(0, totals.price + (orderType === 'takeaway' ? 10 : 0));
  const bill = quote ? {
    itemTotal: quote.subtotal,
    packaging: quote.delivery_fee || 0,
    discount: quote.coupon_applied ? quote.discount : 0,
    gst: quote.gst_amount,
    base: quote.base_amount,
    total: quote.total,
  } : {
    itemTotal: Math.round(totals.price * 100) / 100,
    packaging: orderType === 'takeaway' ? 10 : 0,
    discount: 0,
    gst: Math.round(clientNet * GST_RATE / (100 + GST_RATE) * 100) / 100,
    base: Math.round((clientNet - clientNet * GST_RATE / (100 + GST_RATE)) * 100) / 100,
    total: clientNet,
  };
  const getDiscount = () => bill.discount;
  const getGST = () => bill.gst;
  const getBaseAmount = () => bill.base;
  const getFinalTotal = () => Math.round(bill.total);

  const isUnavailable = (p: any) => p.product_type === 'ready_made' ? ((p.available_servings || 0) <= 0 && !p.is_active) : (p.available_qty_grams || 0) <= 0;

  // ========== HOLD BILL ==========
  const holdBill = async () => {
    if (!cart.length) return;
    try {
      const items = cart.map(c => ({
        id: c.id, name: c.name, grams: c.grams, price: c.price, calories: c.calories,
        protein: c.protein, carbs: c.carbs, fat: c.fat, product_type: c.product_type || 'single',
        plateQty: c.plateQty || 0, cost_per_100g: c.cost_per_100g, calories_per_100g: c.calories_per_100g,
        protein_per_100g: c.protein_per_100g, carbs_per_100g: c.carbs_per_100g || 0,
        fat_per_100g: c.fat_per_100g || 0, diet_type: c.diet_type, category: c.category,
      }));
      await api('/held-bills', { method: 'POST', body: { customer_name: customerName || 'Walk-in', order_type: orderType, items, coupon_code: appliedCode || null, coupon_discount: getDiscount() } });
      setCart([]); setCouponCode(''); setAppliedCode(''); setCustomerName(''); setActiveHoldId(null);
    } catch (e: any) { alert(e.message); }
  };

  // ========== PAYMENT ==========
  const confirmPayment = async () => {
    if (!cart.length) return;
    setPlacing(true);
    try {
      const body = {
        order_type: orderType, payment_mode: paymentMode,
        customer_name: customerName.trim() || undefined,
        coupon_code: couponApplied ? appliedCode : undefined, discount: getDiscount(),
        items: cart.map(c => ({ product_id: c.id, product_name: c.name, grams: c.grams, price: c.price, calories: c.calories, protein: c.protein, carbs: c.carbs || 0, fat: c.fat || 0, product_type: c.product_type || 'single', quantity: c.plateQty || 1 })),
        total_price: getFinalTotal(), total_calories: totals.calories, total_protein: totals.protein, total_carbs: totals.carbs, total_fat: totals.fat,
      };
      const r = await api('/orders', { method: 'POST', body });
      // If resumed from hold, delete the held bill
      if (activeHoldId) { try { await api(`/held-bills/${activeHoldId}`, { method: 'DELETE' }); } catch {} }
      try { const receipt = await api(`/orders/${r.id}/receipt`); setShowReceipt(receipt); } catch { alert(`Order #${r.id} placed!`); }
      setCart([]); setCouponCode(''); setAppliedCode(''); setShowPayment(false); setCustomerName(''); setActiveHoldId(null);
    } catch (e: any) { alert(e.message); }
    finally { setPlacing(false); }
  };

  // ========== AI ==========
  const runAI = async () => {
    setAiLoading(true); setAiResult(null);
    try {
      const r = await api('/ai/quick-meal', { method: 'POST', body: { diet_preference: aiDiet, goal: aiGoal, budget: parseFloat(aiBudget) || undefined, order_type: orderType } });
      setAiResult(r);
    } catch (e: any) { alert(e.message); }
    finally { setAiLoading(false); }
  };

  // Fix #3: AI items merge into existing cart entries
  const addAIToCart = () => {
    if (!aiResult?.meal_items) return;
    setCart(prev => {
      let updated = [...prev];
      for (const aiItem of aiResult.meal_items) {
        const existIdx = updated.findIndex(c => c.id === aiItem.product_id && c.product_type !== 'ready_made');
        if (existIdx >= 0) {
          // Merge: add grams to existing
          const c = updated[existIdx];
          const newG = c.grams + aiItem.grams;
          const f = newG / 100;
          updated[existIdx] = { ...c, grams: newG, price: Math.round(f * c.cost_per_100g * 100) / 100, calories: Math.round(f * c.calories_per_100g), protein: Math.round(f * c.protein_per_100g * 10) / 10, carbs: Math.round(f * (c.carbs_per_100g || 0) * 10) / 10, fat: Math.round(f * (c.fat_per_100g || 0) * 10) / 10 };
        } else {
          // Add new
          const p = products.find(pr => pr.id === aiItem.product_id);
          if (p) {
            updated.push(calcItem(p, aiItem.grams));
          }
        }
      }
      return updated;
    });
    resetCoupon();
    setShowAI(false);
    setAiResult(null);
  };

  const printReceipt = () => {
    const el = document.getElementById('receipt-print');
    if (!el) return;
    const w = window.open('', '_blank', 'width=400,height=700');
    if (!w) return;
    w.document.write(`<html><head><title>Receipt</title><style>body{font-family:monospace;padding:16px;font-size:13px;max-width:300px;margin:0 auto}h2{text-align:center;margin:0}.dashed{border-top:1px dashed #000;margin:8px 0}.row{display:flex;justify-content:space-between}.big{font-size:16px;font-weight:bold}</style></head><body>`);
    w.document.write(el.innerHTML);
    w.document.write('</body></html>');
    w.document.close();
    w.print();
  };

  // Offer click handler
  const handleOfferClick = (offer: any) => {
    if (offer.applicable_to === 'category' && offer.applicable_category) {
      setSelectedCat(offer.applicable_category);
      setShowOfferProducts(null);
    } else {
      // Show all products for "all" offers
      setSelectedCat('All');
    }
    // Auto-apply coupon (drives the server quote)
    setCouponCode(offer.coupon_code || '');
    setAppliedCode((offer.coupon_code || '').toUpperCase());
  };

  const PAYMENT_MODES = [
    { key: 'cash', label: 'Cash', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/></svg> },
    { key: 'upi', label: 'UPI', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18.01"/></svg> },
    { key: 'card', label: 'Card', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> },
    { key: 'other', label: 'Other', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l2 2"/></svg> },
  ];

  return (
    <div className="pos-layout">
      <div className="pos-menu">
        <div className="pos-search">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search menu..." data-testid="pos-search" />
          <button className="btn btn-purple" onClick={() => setShowAI(true)} data-testid="ai-suggest-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
            AI Guide
          </button>
        </div>

        {/* Fix #5: Offers Banner */}
        {offers.length > 0 && (
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 10, paddingBottom: 4 }} data-testid="offers-banner">
            {offers.map(offer => (
              <button key={offer.id} onClick={() => handleOfferClick(offer)} data-testid={`offer-${offer.id}`}
                style={{ minWidth: 180, padding: '10px 14px', borderRadius: 10, border: 'none', cursor: 'pointer', textAlign: 'left', background: '#15140F', color: '#F4F1E9', flexShrink: 0 }}>
                <div style={{ fontFamily: 'Anton, sans-serif', fontWeight: 400, fontSize: 15, marginBottom: 2, color: '#C7F24E', textTransform: 'uppercase', letterSpacing: '0.02em' }}>{offer.title}</div>
                <div style={{ fontSize: 11, opacity: 0.85 }}>{offer.subtitle}</div>
                {offer.coupon_code && <div style={{ fontSize: 10, marginTop: 4, background: 'rgba(199,242,78,0.18)', color: '#C7F24E', display: 'inline-block', padding: '2px 6px', borderRadius: 4 }}>Code: {offer.coupon_code}</div>}
              </button>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <button className={`pos-cat ${viewTab === 'single' ? 'active' : ''}`} onClick={() => setViewTab('single')} data-testid="tab-single" style={{ fontWeight: 700 }}>Build Your Own ({singleProducts.length})</button>
          <button className={`pos-cat ${viewTab === 'readymade' ? 'active' : ''}`} onClick={() => setViewTab('readymade')} data-testid="tab-readymade" style={{ fontWeight: 700 }}>Ready-Made ({readyMadeProducts.length})</button>
        </div>

        {/* Fix #4: Only admin-created categories */}
        <div className="pos-categories">
          <button className={`pos-cat ${selectedCat === 'All' ? 'active' : ''}`} onClick={() => setSelectedCat('All')} data-testid="cat-All">All</button>
          {categories.filter(c => c.is_active).map(c => {
            const fontStyle = c.font_style === 'bold' ? { fontWeight: 800 } as const : c.font_style === 'italic' ? { fontStyle: 'italic' } as const : c.font_style === 'mono' ? { fontFamily: 'monospace' } as const : {};
            return (
              <button key={c.id || c.key} className={`pos-cat ${selectedCat === c.key ? 'active' : ''}`}
                onClick={() => setSelectedCat(c.key)} data-testid={`cat-${c.key}`}
                style={{ ...fontStyle, borderColor: selectedCat === c.key ? (c.color || '#15140F') : undefined }}>
                {c.name}
              </button>
            );
          })}
        </div>

        {/* Diet filter (staff can answer "is this vegan/jain?") */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }} data-testid="pos-diet-filter">
          <span style={{ fontSize: 11, fontWeight: 700, color: '#9C9C9C' }}>DIET:</span>
          {POS_DIET_TAGS.map(tag => {
            const on = dietFilter.includes(tag);
            return (
              <button key={tag} type="button" data-testid={`pos-diet-${tag}`} onClick={() => setDietFilter(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                style={{ padding: '4px 10px', borderRadius: 16, border: on ? '2px solid #3FA34D' : '1px solid #E0E0E0', background: on ? '#EAF2DD' : '#FFF', color: on ? '#2C7A3D' : '#696969', fontWeight: on ? 700 : 500, fontSize: 11, cursor: 'pointer' }}>
                {POS_DIET_LABEL[tag]}
              </button>
            );
          })}
          {dietFilter.length > 0 && <button type="button" onClick={() => setDietFilter([])} style={{ fontSize: 11, color: '#15140F', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>clear</button>}
        </div>

        {(() => {
          const renderCard = (p: any) => {
            const unavailable = isUnavailable(p);
            const inCart = cart.find(c => c.id === p.id);
            const isRM = p.product_type === 'ready_made';
            const tags = dietTagsOf(p);
            const nonVeg = tags.includes('non-veg');
            const cartCount = inCart ? (isRM ? (inCart.plateQty || 1) : 1) : 0;
            return (
              <div key={p.id} className={`pos-product ${inCart ? 'in-cart' : ''} ${unavailable ? 'unavailable' : ''}`}
                onClick={() => !unavailable && openDetail(p)} data-testid={`product-${p.id}`}>
                <div className="pos-card-top">
                  {inCart ? <span className="pos-count-chip" data-testid={`pos-count-${p.id}`}>{cartCount}</span> : <span />}
                  {unavailable
                    ? <span className="pos-out-tag" data-testid={`pos-out-${p.id}`}>OUT</span>
                    : <span className="pos-diet-dot" style={{ background: nonVeg ? 'var(--protein)' : 'var(--success)' }} title={nonVeg ? 'Non-Veg' : 'Veg'} data-testid={`pos-diet-dot-${p.id}`} />}
                </div>
                <div className="pos-product-name">{p.name}</div>
                {isRM ? (
                  <><div className="pos-product-price">₹{p.fixed_price || Math.round(p.cost_per_100g * (p.serving_grams || 200) / 100)}<span style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 0 }}>/plate</span></div>
                  <div className="pos-product-nutrition">{p.total_calories_per_serving || Math.round(p.calories_per_100g * (p.serving_grams || 200) / 100)} cal · Meal</div></>
                ) : (
                  <><div className="pos-product-price">₹{p.cost_per_100g}<span style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 0 }}>/100g</span></div>
                  <div className="pos-product-nutrition">{p.calories_per_100g} cal · P{p.protein_per_100g}g</div></>
                )}
              </div>
            );
          };
          if (filtered.length === 0) {
            return <div className="pos-products"><div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: '#9C9C9C' }}>{viewTab === 'readymade' ? 'No ready-made meals. Admin can create them.' : 'No items found'}</div></div>;
          }
          // PR-1: Build-Your-Own grouped by subcategory; Ready-Made stays flat.
          if (viewTab === 'single') {
            return (
              <div data-testid="pos-grouped-singles">
                {groupedSingles.map(g => (
                  <div key={g.label} data-testid={`pos-subcat-${g.label.toLowerCase().replace(/[^a-z]+/g, '-')}`}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#9C9C9C', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '10px 2px 6px' }}>{g.label}</div>
                    <div className="pos-products">{g.items.map(renderCard)}</div>
                  </div>
                ))}
              </div>
            );
          }
          return <div className="pos-products">{filtered.map(renderCard)}</div>;
        })()}
      </div>

      {/* RIGHT - Ink bill panel */}
      <div className="pos-bill" data-testid="pos-bill">
        <div className="pos-bill-header">
          <div className="pos-bill-title-row">
            <span className="pos-bill-title">Bill <span className="count">· {cart.length}</span></span>
            {cart.length > 0 && (
              <button className="pos-hold-btn" onClick={holdBill} data-testid="hold-bill-btn" title="Hold this bill for later (H)">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M10 15V9l5 3-5 3z"/></svg>
                Hold
              </button>
            )}
          </div>
          <div className="pos-bill-fields">
            <input className="pos-ink-input" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Customer name (Walk-in)" data-testid="customer-name-input" />
            <div className="pos-type-pills">
              {['dine-in', 'takeaway'].map(t => (
                <button key={t} className={`pos-type-pill ${orderType === t ? 'active' : ''}`} onClick={() => setOrderType(t)} data-testid={`type-${t}`}>{t === 'dine-in' ? 'Dine-In' : 'Takeaway'}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="pos-bill-items" data-testid="pos-bill-items">
          {cart.map((c, idx) => (
            <div className="pos-bill-item" key={`${c.id}_${idx}`}>
              <div className="pos-bill-item-top">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="pos-bill-item-name">{c.name}{c.product_type === 'ready_made' && <span className="pos-bill-item-meal">MEAL</span>}</div>
                  <div className="pos-bill-item-detail">{c.product_type === 'ready_made' ? `x${c.plateQty || 1} plate · ${c.calories} cal` : `${c.grams}g · ${c.calories} cal`}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="pos-bill-item-price" style={{ cursor: c.product_type !== 'ready_made' ? 'pointer' : 'default' }} onClick={() => { if (c.product_type !== 'ready_made') { setEditingIdx(idx); setEditGramsVal(String(c.grams)); setEditPriceVal(String(Math.round(c.price))); } }}>₹{Math.round(c.price)}</span>
                  <button className="pos-bill-remove" onClick={() => removeItem(idx)} data-testid={`remove-${idx}`} aria-label="Remove item">×</button>
                </div>
              </div>
              {c.product_type !== 'ready_made' && editingIdx === idx && (
                <div className="pos-inline-edit">
                  <div style={{ flex: 1 }}>
                    <label>Grams</label>
                    <input type="number" value={editGramsVal} onChange={e => setEditGramsVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && applyEditGrams(idx)} data-testid={`edit-grams-${idx}`} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label>Price (₹)</label>
                    <input type="number" value={editPriceVal} onChange={e => setEditPriceVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && applyEditPrice(idx)} data-testid={`edit-price-${idx}`} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <button className="btn btn-sm btn-green" onClick={() => applyEditGrams(idx)} data-testid={`save-grams-${idx}`} style={{ fontSize: 10, padding: '5px 9px' }}>g</button>
                    <button className="btn btn-sm btn-primary" onClick={() => applyEditPrice(idx)} data-testid={`save-price-${idx}`} style={{ fontSize: 10, padding: '5px 9px' }}>₹</button>
                  </div>
                </div>
              )}
              {c.product_type !== 'ready_made' && editingIdx !== idx && (
                <button className="pos-bill-linkbtn" onClick={() => { setEditingIdx(idx); setEditGramsVal(String(c.grams)); setEditPriceVal(String(Math.round(c.price))); }}>Edit grams / price</button>
              )}
            </div>
          ))}
          {cart.length === 0 && <div className="pos-bill-empty">Add items from the menu</div>}
        </div>

        <div className="pos-bill-footer">
          {cart.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div className="pos-coupon-row">
                <input className="pos-ink-input" style={{ flex: 1, fontWeight: 600 }} value={couponCode} onChange={e => setCouponCode(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && applyCoupon()} placeholder="Coupon code" data-testid="coupon-input" />
                <button className="pos-coupon-apply" onClick={applyCoupon} data-testid="apply-coupon-btn" disabled={!couponCode.trim()}>Apply</button>
              </div>
              {couponError && <p className="pos-coupon-error" data-testid="coupon-error">{couponError}</p>}
              {couponInfo && (
                <div className="pos-coupon-chip" data-testid="coupon-applied">
                  <span>{couponInfo.title}</span><span style={{ fontWeight: 700 }}>-₹{Math.round(bill.discount)}</span>
                </div>
              )}
            </div>
          )}
          <div className="pos-bill-total-row"><span>Item Total</span><span>{quoteLoading ? '…' : `₹${Math.round(bill.itemTotal)}`}</span></div>
          {bill.packaging > 0 && <div className="pos-bill-total-row"><span>Packaging</span><span>₹{Math.round(bill.packaging)}</span></div>}
          {couponInfo && <div className="pos-bill-total-row discount"><span>Discount</span><span>-₹{Math.round(bill.discount)}</span></div>}
          <div className="pos-bill-total-row"><span>Base Amount</span><span>₹{getBaseAmount()}</span></div>
          <div className="pos-bill-total-row"><span>GST (5% incl.)</span><span>₹{getGST()}</span></div>
          <div className="pos-bill-total-row grand"><span>Total</span><span>{quoteLoading ? '…' : `₹${getFinalTotal()}`}</span></div>
          <button className="pos-charge-btn" onClick={() => { setTendered(''); setShowPayment(true); }} disabled={!cart.length} data-testid="proceed-payment-btn">Charge ₹{getFinalTotal()}</button>
        </div>
      </div>

      {/* Product Detail Modal */}
      {detailProduct && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDetailProduct(null)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <h2>{detailProduct.name}</h2>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {dietTagsOf(detailProduct).map((t: string) => (
                <span key={t} className="badge" style={{ background: t === 'non-veg' ? '#F1E7E1' : '#EAF2DD', color: t === 'non-veg' ? '#15140F' : '#3FA34D' }}>{POS_DIET_LABEL[t] || t}</span>
              ))}
              <span className="badge badge-purple">{detailProduct.category}</span>
            </div>
            {detailProduct.product_type === 'ready_made' ? (
              <>
                <div style={{ background: '#F8F8F8', borderRadius: 10, padding: 14, marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Ingredients (per plate):</div>
                  {(detailProduct.ingredients || []).map((ing: any, i: number) => (
                    <div key={i} style={{ fontSize: 13, color: '#666', display: 'flex', justifyContent: 'space-between' }}><span>{ing.name}</span><span>{ing.grams_per_serving}g</span></div>
                  ))}
                  {!detailProduct.is_editable && <div style={{ marginTop: 8, fontSize: 11, color: '#15140F', fontStyle: 'italic' }}>Fixed recipe — cannot be modified</div>}
                </div>
                <div className="form-group"><label>Plates</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button className="btn btn-sm btn-secondary" onClick={() => setDetailQty(Math.max(1, detailQty - 1))} data-testid="qty-minus">-</button>
                    <span style={{ fontSize: 22, fontWeight: 800, minWidth: 40, textAlign: 'center' }}>{detailQty}</span>
                    <button className="btn btn-sm btn-secondary" onClick={() => setDetailQty(detailQty + 1)} data-testid="qty-plus">+</button>
                  </div>
                </div>
                <div className="modal-actions">
                  <button className="btn btn-secondary" onClick={() => setDetailProduct(null)}>Cancel</button>
                  <button className="btn btn-green" onClick={addReadyMadeToCart} data-testid="add-readymade-btn">Add {detailQty} plate{detailQty > 1 ? 's' : ''}</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  <button className={`pos-cat ${buildMode === 'grams' ? 'active' : ''}`} onClick={() => setBuildMode('grams')} data-testid="mode-grams" style={{ flex: 1 }}>By Grams</button>
                  <button className={`pos-cat ${buildMode === 'mrp' ? 'active' : ''}`} onClick={() => setBuildMode('mrp')} data-testid="mode-mrp" style={{ flex: 1 }}>By MRP (₹)</button>
                </div>
                {buildMode === 'grams' ? (
                  <div className="form-group"><label>Grams</label>
                    <input type="number" value={detailGrams} onChange={e => setDetailGrams(e.target.value)} min="10" data-testid="gram-input" />
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      {[50, 100, 150, 200, 300, 500].map(g => (
                        <button key={g} className="btn btn-sm btn-secondary" onClick={() => setDetailGrams(String(g))} data-testid={`quick-g-${g}`} style={{ flex: 1, fontWeight: detailGrams === String(g) ? 800 : 400 }}>{g}g</button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="form-group"><label>Budget (₹)</label>
                    <input type="number" value={mrpTarget} onChange={e => setMrpTarget(e.target.value)} min="5" data-testid="mrp-input" />
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      {[20, 50, 100, 150, 200].map(m => (
                        <button key={m} className="btn btn-sm btn-secondary" onClick={() => setMrpTarget(String(m))} data-testid={`quick-m-${m}`} style={{ flex: 1, fontWeight: mrpTarget === String(m) ? 800 : 400 }}>₹{m}</button>
                      ))}
                    </div>
                  </div>
                )}
                {(() => {
                  const g = buildMode === 'mrp' ? Math.round(((parseFloat(mrpTarget) || 50) / detailProduct.cost_per_100g) * 100) : parseFloat(detailGrams) || 100;
                  const f = g / 100;
                  return (
                    <div style={{ background: '#F8F8F8', borderRadius: 10, padding: 14, marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                        <span style={{ fontWeight: 700 }}>{g}g</span><span style={{ fontWeight: 800, color: '#15140F' }}>₹{Math.round(f * detailProduct.cost_per_100g)}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 12, color: '#9C9C9C' }}>
                        <span>{Math.round(f * detailProduct.calories_per_100g)} cal</span>
                        <span>P:{Math.round(f * detailProduct.protein_per_100g * 10) / 10}g</span>
                      </div>
                    </div>
                  );
                })()}
                <div className="modal-actions">
                  <button className="btn btn-secondary" onClick={() => setDetailProduct(null)}>Cancel</button>
                  <button className="btn btn-green" onClick={addSingleToCart} data-testid="add-single-btn">Add to Cart</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Payment Sheet (A3) */}
      {showPayment && (() => {
        const total = getFinalTotal();
        const tenderedNum = parseFloat(tendered) || 0;
        const change = Math.max(0, Math.round((tenderedNum - total) * 100) / 100);
        return (
          <div className="pos-pay-overlay" onClick={e => e.target === e.currentTarget && !placing && setShowPayment(false)}>
            <div className="pos-pay-sheet" data-testid="payment-sheet">
              <div className="pos-pay-head">
                <div className="pos-pay-head-row">
                  <span className="pos-pay-kicker">Amount due</span>
                  <button className="pos-pay-close" onClick={() => setShowPayment(false)} data-testid="close-payment-btn" aria-label="Close">×</button>
                </div>
                <div className="pos-pay-total" data-testid="pay-total">₹{total}</div>
              </div>
              <div className="pos-pay-body">
                <div className="pos-pay-label">Payment method</div>
                <div className="pos-seg">
                  {PAYMENT_MODES.map(pm => (
                    <button key={pm.key} data-testid={`pay-${pm.key}`} className={`pos-seg-btn ${paymentMode === pm.key ? 'active' : ''}`} onClick={() => setPaymentMode(pm.key)}>
                      {pm.icon}{pm.label}
                    </button>
                  ))}
                </div>

                {paymentMode === 'cash' && (
                  <div data-testid="cash-tender">
                    <div className="pos-pay-label" style={{ marginTop: 22 }}>Cash received</div>
                    <div className="pos-tender-grid">
                      {[100, 200, 500].map(v => (
                        <button key={v} type="button" className="pos-tender-btn" onClick={() => setTendered(String(v))} data-testid={`tender-${v}`}>₹{v}</button>
                      ))}
                      <button type="button" className="pos-tender-btn exact" onClick={() => setTendered(String(total))} data-testid="tender-exact">EXACT</button>
                    </div>
                    <input className="pos-tender-input" type="number" inputMode="numeric" value={tendered} onChange={e => setTendered(e.target.value)} placeholder="Enter amount" data-testid="tender-input" />
                    {tenderedNum > 0 && (
                      <div className="pos-change-row" data-testid="change-row">
                        <span className="lbl">Change</span>
                        <span className="amt" data-testid="change-amount">₹{change}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="pos-pay-foot">
                <button className="pos-charge-btn" style={{ marginTop: 0 }} onClick={confirmPayment} disabled={placing} data-testid="confirm-payment-btn">
                  {placing ? 'Processing…' : `Charge ₹${total} · ${paymentMode.toUpperCase()}`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* AI Modal */}
      {showAI && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && (setShowAI(false), setAiResult(null))}>
          <div className="modal">
            <h2>AI Meal Guide</h2>
            <p style={{ fontSize: 13, color: '#9C9C9C', marginBottom: 14 }}>AI will create a meal that uses the full budget</p>
            {!aiResult ? (
              <>
                <div className="form-group"><label>Goal</label>
                  <div className="ai-options" style={{ flexWrap: 'wrap' }}>{[{ k: 'fat_loss', l: 'Fat Loss' }, { k: 'muscle_gain', l: 'Muscle Gain' }, { k: 'maintenance', l: 'Maintenance' }, { k: 'beginner', l: 'Beginner' }, { k: 'recomposition', l: 'Recomp' }, { k: 'lean_bulk', l: 'Lean Bulk' }].map(g => <button key={g.k} className={`ai-option ${aiGoal === g.k ? 'active' : ''}`} onClick={() => setAiGoal(g.k)}>{g.l}</button>)}</div>
                </div>
                <div className="form-group"><label>Diet</label>
                  <div className="ai-options" style={{ flexWrap: 'wrap' }}>{[{ k: 'both', l: 'Any' }, ...POS_DIET_TAGS.map(t => ({ k: t, l: POS_DIET_LABEL[t] }))].map(d => <button key={d.k} className={`ai-option ${aiDiet === d.k ? 'active' : ''}`} onClick={() => setAiDiet(d.k)}>{d.l}</button>)}</div>
                </div>
                <div className="form-group"><label>Budget (₹)</label><input value={aiBudget} onChange={e => setAiBudget(e.target.value)} type="number" placeholder="200" data-testid="ai-budget-input" /></div>
                <button className="btn btn-purple" style={{ width: '100%', padding: 14, marginTop: 8 }} onClick={runAI} disabled={aiLoading} data-testid="ai-build-btn">{aiLoading ? 'Building...' : 'Create Diet'}</button>
              </>
            ) : (
              <>
                <p style={{ marginBottom: 12, fontWeight: 600 }}>{aiResult.summary}</p>
                {aiResult.meal_items?.map((item: any, i: number) => (
                  <div className="ai-result-item" key={i}>
                    <div><div style={{ fontWeight: 700 }}>{item.product_name}</div><div style={{ fontSize: 12, color: '#9C9C9C' }}>{item.grams}g | {Math.round(item.calories)} cal | P:{Math.round(item.protein)}g</div></div>
                    <span style={{ fontWeight: 800, color: '#15140F' }}>₹{Math.round(item.price)}</span>
                  </div>
                ))}
                {aiResult.totals && (
                  <div className="ai-totals" data-testid="ai-totals">
                    Total: ₹{Math.round(aiResult.totals.price)} | {Math.round(aiResult.totals.calories)} cal | P:{Math.round(aiResult.totals.protein)}g
                    {parseFloat(aiBudget) > 0 && <span style={{ marginLeft: 8, fontSize: 11, color: '#3FA34D' }}>({Math.round(aiResult.totals.price / parseFloat(aiBudget) * 100)}% of ₹{aiBudget})</span>}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={runAI}>Retry</button>
                  <button className="btn btn-green" style={{ flex: 2 }} onClick={addAIToCart} data-testid="ai-add-cart">Add to Cart</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {showReceipt && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowReceipt(null)}>
          <div className="modal" style={{ maxWidth: 380 }}>
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#3FA34D" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>
              <h2 style={{ margin: '4px 0', color: '#3FA34D' }}>Payment Received!</h2>
              <p style={{ fontSize: 13, color: '#9C9C9C' }}>Order sent to kitchen</p>
            </div>
            <div id="receipt-print" style={{ fontFamily: 'monospace', fontSize: 13 }}>
              <div style={{ textAlign: 'center', marginBottom: 8 }}><h2 style={{ margin: 0, fontSize: 18 }}>BORAROC</h2><p style={{ margin: 0, fontSize: 11, color: '#9C9C9C' }}>{showReceipt.cafe_tagline}</p></div>
              <div style={{ borderTop: '1px dashed #ccc', margin: '8px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Order #</span><strong>{showReceipt.order_id}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Type</span><span>{showReceipt.order_type}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Customer</span><span>{showReceipt.customer_name}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Payment</span><span style={{ fontWeight: 700, textTransform: 'uppercase' }}>{showReceipt.payment_mode}</span></div>
              <div style={{ borderTop: '1px dashed #ccc', margin: '8px 0' }} />
              {showReceipt.items?.map((item: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}><span>{item.name} ({item.quantity})</span><span>₹{Math.round(item.price)}</span></div>
              ))}
              <div style={{ borderTop: '1px dashed #ccc', margin: '8px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span>₹{Math.round(showReceipt.subtotal)}</span></div>
              {showReceipt.discount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#3FA34D' }}><span>Discount</span><span>-₹{showReceipt.discount}</span></div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#9C9C9C' }}><span>Base (excl.GST)</span><span>₹{showReceipt.base_amount}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#9C9C9C' }}><span>CGST 2.5%</span><span>₹{Math.round((showReceipt.gst_amount || 0) / 2 * 100) / 100}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#9C9C9C' }}><span>SGST 2.5%</span><span>₹{Math.round((showReceipt.gst_amount || 0) / 2 * 100) / 100}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: 16, borderTop: '1px dashed #000', paddingTop: 6, marginTop: 6 }}><span>TOTAL</span><span>₹{Math.round(showReceipt.total)}</span></div>
              <div style={{ borderTop: '1px dashed #ccc', margin: '8px 0' }} />
              <p style={{ textAlign: 'center', fontSize: 11, color: '#9C9C9C' }}>Thank you for choosing BORAROC!</p>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowReceipt(null)} data-testid="close-receipt-btn">Done</button>
              <button className="btn btn-purple" onClick={printReceipt} data-testid="print-receipt-btn">Print</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
