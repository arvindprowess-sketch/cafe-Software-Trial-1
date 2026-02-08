import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';

const GST_RATE = 5; // 5% GST (inclusive)

export default function CashierPOS() {
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCat, setSelectedCat] = useState('All');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<any[]>([]);
  const [orderType, setOrderType] = useState('dine-in');
  const [placing, setPlacing] = useState(false);
  const [customerName, setCustomerName] = useState('');

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

  // Coupon
  const [couponCode, setCouponCode] = useState('');
  const [couponDiscount, setCouponDiscount] = useState<any>(null);
  const [couponError, setCouponError] = useState('');

  // Payment
  const [showPayment, setShowPayment] = useState(false);
  const [paymentMode, setPaymentMode] = useState('cash');
  const [showReceipt, setShowReceipt] = useState<any>(null);

  // View toggle
  const [viewTab, setViewTab] = useState<'single' | 'readymade'>('single');

  useEffect(() => {
    (async () => {
      try {
        const [p, c] = await Promise.all([api('/products'), api('/categories')]);
        setProducts(p); setCategories(c);
      } catch {}
    })();
  }, []);

  const singleProducts = products.filter(p => p.product_type !== 'ready_made');
  const readyMadeProducts = products.filter(p => p.product_type === 'ready_made');

  const activeProducts = viewTab === 'single' ? singleProducts : readyMadeProducts;

  const filtered = activeProducts.filter(p => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (selectedCat === 'All') return true;
    if (selectedCat === 'veg') return p.diet_type === 'veg';
    if (selectedCat === 'non-veg') return p.diet_type === 'non-veg';
    return p.category === selectedCat;
  });

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

  const addSingleToCart = () => {
    if (!detailProduct) return;
    let grams: number;
    if (buildMode === 'mrp') {
      const target = parseFloat(mrpTarget) || 50;
      grams = Math.round((target / detailProduct.cost_per_100g) * 100);
    } else {
      grams = parseFloat(detailGrams) || 100;
    }
    if (grams <= 0) return;
    const f = grams / 100;
    const item = {
      ...detailProduct,
      grams,
      plateQty: 0,
      price: Math.round(f * detailProduct.cost_per_100g * 100) / 100,
      calories: Math.round(f * detailProduct.calories_per_100g),
      protein: Math.round(f * detailProduct.protein_per_100g * 10) / 10,
      carbs: Math.round(f * (detailProduct.carbs_per_100g || 0) * 10) / 10,
      fat: Math.round(f * (detailProduct.fat_per_100g || 0) * 10) / 10,
    };
    setCart(prev => {
      const idx = prev.findIndex(c => c.id === item.id && c.product_type !== 'ready_made');
      if (idx >= 0) {
        const u = [...prev];
        u[idx].grams += grams;
        const f2 = u[idx].grams / 100;
        u[idx].price = Math.round(f2 * detailProduct.cost_per_100g * 100) / 100;
        u[idx].calories = Math.round(f2 * detailProduct.calories_per_100g);
        u[idx].protein = Math.round(f2 * detailProduct.protein_per_100g * 10) / 10;
        u[idx].carbs = Math.round(f2 * (detailProduct.carbs_per_100g || 0) * 10) / 10;
        u[idx].fat = Math.round(f2 * (detailProduct.fat_per_100g || 0) * 10) / 10;
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
    const price = (detailProduct.fixed_price || detailProduct.cost_per_100g * (detailProduct.serving_grams || 100) / 100) * qty;
    const item = {
      ...detailProduct,
      grams: (detailProduct.serving_grams || 200) * qty,
      plateQty: qty,
      price: Math.round(price * 100) / 100,
      calories: Math.round((detailProduct.total_calories_per_serving || detailProduct.calories_per_100g * (detailProduct.serving_grams || 200) / 100) * qty),
      protein: Math.round((detailProduct.total_protein_per_serving || detailProduct.protein_per_100g * (detailProduct.serving_grams || 200) / 100) * qty * 10) / 10,
      carbs: Math.round((detailProduct.total_carbs_per_serving || (detailProduct.carbs_per_100g || 0) * (detailProduct.serving_grams || 200) / 100) * qty * 10) / 10,
      fat: Math.round((detailProduct.total_fat_per_serving || (detailProduct.fat_per_100g || 0) * (detailProduct.serving_grams || 200) / 100) * qty * 10) / 10,
    };
    setCart(prev => [...prev, { ...item, cartKey: `${item.id}_${Date.now()}` }]);
    resetCoupon();
    setDetailProduct(null);
  };

  const remove = (cartKey: string, id: string) => {
    setCart(prev => {
      if (cartKey) return prev.filter(c => c.cartKey !== cartKey);
      return prev.filter(c => c.id !== id);
    });
    resetCoupon();
  };

  const editGrams = (id: string, newGrams: number) => {
    if (newGrams <= 0) return;
    setCart(prev => prev.map(c => {
      if (c.id === id && c.product_type !== 'ready_made') {
        const f = newGrams / 100;
        return {
          ...c,
          grams: newGrams,
          price: Math.round(f * c.cost_per_100g * 100) / 100,
          calories: Math.round(f * c.calories_per_100g),
          protein: Math.round(f * c.protein_per_100g * 10) / 10,
          carbs: Math.round(f * (c.carbs_per_100g || 0) * 10) / 10,
          fat: Math.round(f * (c.fat_per_100g || 0) * 10) / 10,
        };
      }
      return c;
    }));
    resetCoupon();
  };

  const resetCoupon = () => {
    if (couponDiscount) { setCouponDiscount(null); setCouponCode(''); setCouponError(''); }
  };

  const totals = cart.reduce((a, c) => ({
    price: a.price + c.price,
    calories: a.calories + c.calories,
    protein: a.protein + c.protein,
    carbs: a.carbs + (c.carbs || 0),
    fat: a.fat + (c.fat || 0),
  }), { price: 0, calories: 0, protein: 0, carbs: 0, fat: 0 });

  const applyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponError('');
    try {
      const result = await api('/orders/apply-coupon', { method: 'POST', body: { coupon_code: couponCode.trim().toUpperCase() } });
      if (result.min_order_value && totals.price < result.min_order_value) {
        setCouponError(`Min order ₹${result.min_order_value} required`);
        setCouponDiscount(null);
        return;
      }
      let discount = 0;
      if (result.discount_type === 'percentage') {
        discount = (totals.price * result.discount_value) / 100;
        if (result.max_discount) discount = Math.min(discount, result.max_discount);
      } else {
        discount = result.discount_value;
      }
      setCouponDiscount({ ...result, calculated_discount: Math.round(discount * 100) / 100 });
    } catch (err: any) {
      setCouponError(err.message || 'Invalid coupon');
      setCouponDiscount(null);
    }
  };

  const getExtraCharge = () => orderType === 'takeaway' ? 10 : 0;
  const getDiscount = () => couponDiscount?.calculated_discount || 0;
  const getSubtotal = () => Math.round((totals.price + getExtraCharge() - getDiscount()) * 100) / 100;
  const getGST = () => Math.round(getSubtotal() * GST_RATE / (100 + GST_RATE) * 100) / 100;
  const getBaseAmount = () => Math.round((getSubtotal() - getGST()) * 100) / 100;
  const getFinalTotal = () => Math.max(0, getSubtotal());

  const isUnavailable = (p: any) => {
    if (p.product_type === 'ready_made') {
      return (p.available_servings || 0) <= 0 && !p.is_active;
    }
    return (p.available_qty_grams || 0) <= 0;
  };

  const proceedToPayment = () => {
    if (!cart.length) return;
    setShowPayment(true);
  };

  const confirmPayment = async () => {
    if (!cart.length) return;
    setPlacing(true);
    try {
      const body = {
        order_type: orderType,
        payment_mode: paymentMode,
        customer_name: customerName.trim() || undefined,
        coupon_code: couponDiscount ? couponCode : undefined,
        discount: getDiscount(),
        items: cart.map(c => ({
          product_id: c.id,
          product_name: c.name,
          grams: c.grams,
          price: c.price,
          calories: c.calories,
          protein: c.protein,
          carbs: c.carbs || 0,
          fat: c.fat || 0,
          product_type: c.product_type || 'single',
          quantity: c.plateQty || 1,
        })),
        total_price: getFinalTotal(),
        total_calories: totals.calories,
        total_protein: totals.protein,
        total_carbs: totals.carbs,
        total_fat: totals.fat,
      };
      const r = await api('/orders', { method: 'POST', body });
      try {
        const receipt = await api(`/orders/${r.id}/receipt`);
        setShowReceipt(receipt);
      } catch {
        alert(`Order #${r.id} placed! Sent to kitchen.`);
      }
      setCart([]);
      setCouponCode(''); setCouponDiscount(null); setCouponError('');
      setShowPayment(false);
      setCustomerName('');
    } catch (e: any) { alert(e.message); }
    finally { setPlacing(false); }
  };

  const printReceipt = () => {
    const el = document.getElementById('receipt-print');
    if (!el) return;
    const w = window.open('', '_blank', 'width=400,height=700');
    if (!w) return;
    w.document.write(`<html><head><title>Receipt #${showReceipt?.order_id}</title>
      <style>body{font-family:monospace;padding:16px;font-size:13px;max-width:300px;margin:0 auto}
      h2{text-align:center;margin:0}.dashed{border-top:1px dashed #000;margin:8px 0}
      .row{display:flex;justify-content:space-between}.center{text-align:center}
      .bold{font-weight:bold}.big{font-size:16px;font-weight:bold}</style></head><body>`);
    w.document.write(el.innerHTML);
    w.document.write('</body></html>');
    w.document.close();
    w.print();
  };

  const runAI = async () => {
    setAiLoading(true); setAiResult(null);
    try {
      const r = await api('/ai/quick-meal', { method: 'POST', body: { diet_preference: aiDiet, goal: aiGoal, budget: parseFloat(aiBudget) || undefined, order_type: orderType } });
      setAiResult(r);
    } catch (e: any) { alert(e.message); }
    finally { setAiLoading(false); }
  };

  const addAIToCart = () => {
    if (!aiResult?.meal_items) return;
    for (const item of aiResult.meal_items) {
      const p = products.find(pr => pr.id === item.product_id);
      if (p) {
        const f = item.grams / 100;
        setCart(prev => [...prev, {
          ...p, grams: item.grams, plateQty: 0,
          price: Math.round(f * p.cost_per_100g * 100) / 100,
          calories: Math.round(f * p.calories_per_100g),
          protein: Math.round(f * p.protein_per_100g * 10) / 10,
          carbs: Math.round(f * (p.carbs_per_100g || 0) * 10) / 10,
          fat: Math.round(f * (p.fat_per_100g || 0) * 10) / 10,
        }]);
      }
    }
    setShowAI(false); setAiResult(null);
  };

  const PAYMENT_MODES = [
    { key: 'cash', label: 'Cash', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/></svg> },
    { key: 'upi', label: 'UPI', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18.01"/></svg> },
    { key: 'card', label: 'Card', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> },
    { key: 'other', label: 'Other', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l2 2"/></svg> },
  ];

  return (
    <div className="pos-layout">
      {/* LEFT - Menu */}
      <div className="pos-menu">
        <div className="pos-search">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search menu..." data-testid="pos-search" />
          <button className="btn btn-purple" onClick={() => setShowAI(true)} data-testid="ai-suggest-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
            AI Guide
          </button>
        </div>

        {/* Single vs Ready-Made toggle */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <button className={`pos-cat ${viewTab === 'single' ? 'active' : ''}`} onClick={() => setViewTab('single')} data-testid="tab-single" style={{ fontWeight: 700 }}>
            Build Your Own ({singleProducts.length})
          </button>
          <button className={`pos-cat ${viewTab === 'readymade' ? 'active' : ''}`} onClick={() => setViewTab('readymade')} data-testid="tab-readymade" style={{ fontWeight: 700 }}>
            Ready-Made ({readyMadeProducts.length})
          </button>
        </div>

        <div className="pos-categories">
          {[{ key: 'All', name: 'All' }, { key: 'veg', name: 'Veg' }, { key: 'non-veg', name: 'Non-Veg' }, ...categories].map(c => (
            <button key={c.key || c.name} className={`pos-cat ${selectedCat === (c.key || c.name) ? 'active' : ''}`} onClick={() => setSelectedCat(c.key || c.name)} data-testid={`cat-${c.key || c.name}`}>{c.name}</button>
          ))}
        </div>

        <div className="pos-products">
          {filtered.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: '#9C9C9C' }}>
              {viewTab === 'readymade' ? 'No ready-made meals available. Admin can create them from Products page.' : 'No items found'}
            </div>
          )}
          {filtered.map(p => {
            const unavailable = isUnavailable(p);
            const inCart = cart.find(c => c.id === p.id);
            const isRM = p.product_type === 'ready_made';
            return (
              <div key={p.id} className={`pos-product ${inCart ? 'in-cart' : ''} ${unavailable ? 'unavailable' : ''}`}
                onClick={() => !unavailable && openDetail(p)} data-testid={`product-${p.id}`}
                style={unavailable ? { opacity: 0.4, cursor: 'not-allowed' } : {}}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span className="pos-product-badge" style={{ background: p.diet_type === 'non-veg' ? '#FDE8EA' : '#E8F5E9', color: p.diet_type === 'non-veg' ? '#E23744' : '#267E3E', fontSize: 10 }}>
                    {p.diet_type === 'non-veg' ? 'Non-Veg' : 'Veg'}
                  </span>
                  {isRM && <span style={{ fontSize: 9, fontWeight: 700, background: '#5B5FE015', color: '#5B5FE0', padding: '2px 6px', borderRadius: 4 }}>MEAL</span>}
                </div>
                <div className="pos-product-name">{p.name}</div>
                {unavailable && <div style={{ fontSize: 11, color: '#E23744', fontWeight: 700 }}>Unavailable</div>}
                {isRM ? (
                  <>
                    <div className="pos-product-price">₹{p.fixed_price || Math.round(p.cost_per_100g * (p.serving_grams || 200) / 100)}/plate</div>
                    <div className="pos-product-nutrition">{p.total_calories_per_serving || Math.round(p.calories_per_100g * (p.serving_grams || 200) / 100)} cal | P:{p.total_protein_per_serving || Math.round(p.protein_per_100g * (p.serving_grams || 200) / 100)}g</div>
                    {p.is_editable && <div style={{ fontSize: 10, color: '#5B5FE0', fontWeight: 600 }}>Customizable</div>}
                    {!p.is_editable && <div style={{ fontSize: 10, color: '#9C9C9C' }}>Fixed recipe</div>}
                  </>
                ) : (
                  <>
                    <div className="pos-product-price">₹{p.cost_per_100g}/100g</div>
                    <div className="pos-product-nutrition">{p.calories_per_100g} cal | P:{p.protein_per_100g}g</div>
                  </>
                )}
                {inCart && <div style={{ marginTop: 4, fontSize: 11, fontWeight: 700, color: '#5B5FE0' }}>In cart</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT - Cart */}
      <div className="pos-cart">
        <div className="pos-cart-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Cart ({cart.length} items)</span>
        </div>

        {/* Walk-in customer name */}
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #EFEFEF' }}>
          <input value={customerName} onChange={e => setCustomerName(e.target.value)}
            placeholder="Customer name (Walk-in)" data-testid="customer-name-input"
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #EFEFEF', fontSize: 13 }} />
        </div>

        <div className="pos-cart-items">
          {cart.map((c, idx) => (
            <div className="pos-cart-item" key={c.cartKey || `${c.id}_${idx}`} style={{ flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <div className="pos-cart-info">
                  <div className="pos-cart-name">
                    {c.name}
                    {c.product_type === 'ready_made' && <span style={{ fontSize: 10, color: '#5B5FE0', marginLeft: 4 }}>MEAL</span>}
                  </div>
                  {c.product_type === 'ready_made' ? (
                    <div className="pos-cart-detail">x{c.plateQty || 1} plate{(c.plateQty || 1) > 1 ? 's' : ''} | {c.calories} cal</div>
                  ) : (
                    <div className="pos-cart-detail">{c.grams}g | {c.calories} cal</div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="pos-cart-price">₹{Math.round(c.price)}</span>
                  <button className="pos-cart-remove" onClick={() => remove(c.cartKey, c.id)} data-testid={`remove-${c.cartKey || c.id}`}>x</button>
                </div>
              </div>
              {/* Edit grams for single items only */}
              {c.product_type !== 'ready_made' && (
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  {[50, 100, 150, 200, 300].map(g => (
                    <button key={g} onClick={() => editGrams(c.id, g)}
                      style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, border: c.grams === g ? '2px solid #5B5FE0' : '1px solid #EFEFEF', background: c.grams === g ? '#5B5FE015' : '#fff', color: c.grams === g ? '#5B5FE0' : '#9C9C9C', cursor: 'pointer', fontWeight: 600 }}>
                      {g}g
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {cart.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#9C9C9C', fontSize: 14 }}>Add items from menu</div>}
        </div>

        <div className="pos-cart-footer">
          {/* Coupon */}
          {cart.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={couponCode} onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponError(''); }}
                  placeholder="Coupon code" data-testid="coupon-input"
                  style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid #EFEFEF', fontSize: 13, fontWeight: 600 }} />
                <button className="btn btn-sm btn-orange" onClick={applyCoupon} data-testid="apply-coupon-btn" disabled={!couponCode.trim()}>Apply</button>
              </div>
              {couponError && <p style={{ color: '#E23744', fontSize: 12, marginTop: 4 }} data-testid="coupon-error">{couponError}</p>}
              {couponDiscount && (
                <div style={{ background: '#E8F5E9', borderRadius: 8, padding: '6px 10px', marginTop: 6, fontSize: 12, color: '#267E3E', display: 'flex', justifyContent: 'space-between' }} data-testid="coupon-applied">
                  <span>{couponDiscount.title}</span>
                  <span style={{ fontWeight: 700 }}>-₹{couponDiscount.calculated_discount}</span>
                </div>
              )}
            </div>
          )}

          <div className="order-type-toggle">
            {['dine-in', 'takeaway'].map(t => (
              <button key={t} className={`order-type-btn ${orderType === t ? 'active' : ''}`} onClick={() => setOrderType(t)} data-testid={`type-${t}`}>
                {t === 'dine-in' ? 'Dine-In' : 'Takeaway'}
              </button>
            ))}
          </div>

          {/* Price Breakup */}
          <div className="pos-totals">
            <div className="pos-total-row"><span>Item Total</span><span>₹{Math.round(totals.price)}</span></div>
            {orderType === 'takeaway' && <div className="pos-total-row"><span>Packaging</span><span>₹10</span></div>}
            {couponDiscount && <div className="pos-total-row" style={{ color: '#267E3E' }}><span>Discount</span><span>-₹{couponDiscount.calculated_discount}</span></div>}
            <div className="pos-total-row" style={{ fontSize: 12, color: '#9C9C9C' }}><span>Base Amount</span><span>₹{getBaseAmount()}</span></div>
            <div className="pos-total-row" style={{ fontSize: 12, color: '#9C9C9C' }}><span>GST (5% incl.)</span><span>₹{getGST()}</span></div>
            <div className="pos-total-row grand"><span>Total</span><span>₹{getFinalTotal()}</span></div>
            <div className="pos-total-row" style={{ fontSize: 11, color: '#9C9C9C' }}>
              <span>Nutrition</span>
              <span>{Math.round(totals.calories)} cal | P:{Math.round(totals.protein)}g | C:{Math.round(totals.carbs)}g | F:{Math.round(totals.fat)}g</span>
            </div>
          </div>

          <button className="pos-order-btn" onClick={proceedToPayment} disabled={!cart.length} data-testid="proceed-payment-btn">
            Proceed to Payment — ₹{getFinalTotal()}
          </button>
        </div>
      </div>

      {/* Product Detail Modal */}
      {detailProduct && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDetailProduct(null)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <h2>{detailProduct.name}</h2>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <span className="badge" style={{ background: detailProduct.diet_type === 'non-veg' ? '#FDE8EA' : '#E8F5E9', color: detailProduct.diet_type === 'non-veg' ? '#E23744' : '#267E3E' }}>
                {detailProduct.diet_type === 'non-veg' ? 'Non-Veg' : 'Veg'}
              </span>
              <span className="badge badge-purple">{detailProduct.category}</span>
              {detailProduct.product_type === 'ready_made' && <span className="badge" style={{ background: '#5B5FE015', color: '#5B5FE0' }}>Ready-Made Meal</span>}
            </div>

            {detailProduct.product_type === 'ready_made' ? (
              <>
                {/* Ready-made: order by plate */}
                <div style={{ background: '#F8F8F8', borderRadius: 10, padding: 14, marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Ingredients (per plate):</div>
                  {(detailProduct.ingredients || []).map((ing: any, i: number) => (
                    <div key={i} style={{ fontSize: 13, color: '#666', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{ing.name}</span><span>{ing.grams_per_serving}g</span>
                    </div>
                  ))}
                  {!detailProduct.is_editable && (
                    <div style={{ marginTop: 8, fontSize: 11, color: '#E23744', fontStyle: 'italic' }}>
                      Fixed recipe — ingredients cannot be modified
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label>Number of Plates</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button className="btn btn-sm btn-secondary" onClick={() => setDetailQty(Math.max(1, detailQty - 1))} data-testid="qty-minus">-</button>
                    <span style={{ fontSize: 22, fontWeight: 800, minWidth: 40, textAlign: 'center' }}>{detailQty}</span>
                    <button className="btn btn-sm btn-secondary" onClick={() => setDetailQty(detailQty + 1)} data-testid="qty-plus">+</button>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
                  <span>Price:</span><span style={{ fontWeight: 800, color: '#5B5FE0' }}>₹{(detailProduct.fixed_price || Math.round(detailProduct.cost_per_100g * (detailProduct.serving_grams || 200) / 100)) * detailQty}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14, fontSize: 13, color: '#9C9C9C' }}>
                  <span>Calories:</span><span>{Math.round((detailProduct.total_calories_per_serving || detailProduct.calories_per_100g * (detailProduct.serving_grams || 200) / 100) * detailQty)} cal</span>
                </div>
                <div className="modal-actions">
                  <button className="btn btn-secondary" onClick={() => setDetailProduct(null)}>Cancel</button>
                  <button className="btn btn-green" onClick={addReadyMadeToCart} data-testid="add-readymade-btn">Add {detailQty} plate{detailQty > 1 ? 's' : ''} to Cart</button>
                </div>
              </>
            ) : (
              <>
                {/* Single item: by grams or MRP */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  <button className={`pos-cat ${buildMode === 'grams' ? 'active' : ''}`} onClick={() => setBuildMode('grams')} data-testid="mode-grams" style={{ flex: 1 }}>By Grams</button>
                  <button className={`pos-cat ${buildMode === 'mrp' ? 'active' : ''}`} onClick={() => setBuildMode('mrp')} data-testid="mode-mrp" style={{ flex: 1 }}>By MRP (₹)</button>
                </div>

                {buildMode === 'grams' ? (
                  <div className="form-group">
                    <label>Quantity (grams)</label>
                    <input type="number" value={detailGrams} onChange={e => setDetailGrams(e.target.value)} min="10" data-testid="gram-input" />
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      {[50, 100, 150, 200, 300, 500].map(g => (
                        <button key={g} className="btn btn-sm btn-secondary" onClick={() => setDetailGrams(String(g))} data-testid={`quick-g-${g}`}
                          style={{ flex: 1, fontWeight: detailGrams === String(g) ? 800 : 400 }}>{g}g</button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="form-group">
                    <label>Budget (₹) — we'll calculate grams</label>
                    <input type="number" value={mrpTarget} onChange={e => setMrpTarget(e.target.value)} min="5" data-testid="mrp-input" />
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      {[20, 50, 100, 150, 200].map(m => (
                        <button key={m} className="btn btn-sm btn-secondary" onClick={() => setMrpTarget(String(m))} data-testid={`quick-m-${m}`}
                          style={{ flex: 1, fontWeight: mrpTarget === String(m) ? 800 : 400 }}>₹{m}</button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Preview */}
                {(() => {
                  const g = buildMode === 'mrp'
                    ? Math.round(((parseFloat(mrpTarget) || 50) / detailProduct.cost_per_100g) * 100)
                    : parseFloat(detailGrams) || 100;
                  const f = g / 100;
                  return (
                    <div style={{ background: '#F8F8F8', borderRadius: 10, padding: 14, marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                        <span style={{ fontWeight: 700 }}>{g}g of {detailProduct.name}</span>
                        <span style={{ fontWeight: 800, color: '#5B5FE0' }}>₹{Math.round(f * detailProduct.cost_per_100g)}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 12, color: '#9C9C9C' }}>
                        <span>{Math.round(f * detailProduct.calories_per_100g)} cal</span>
                        <span>P:{Math.round(f * detailProduct.protein_per_100g * 10) / 10}g</span>
                        <span>C:{Math.round(f * (detailProduct.carbs_per_100g || 0) * 10) / 10}g</span>
                        <span>F:{Math.round(f * (detailProduct.fat_per_100g || 0) * 10) / 10}g</span>
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

      {/* Payment Modal */}
      {showPayment && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowPayment(false)}>
          <div className="modal" style={{ maxWidth: 440 }}>
            <h2>Collect Payment</h2>

            {/* Order Summary */}
            <div style={{ background: '#F8F8F8', borderRadius: 10, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 13, marginBottom: 8 }}>
                {cart.map((c, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                    <span>{c.name} {c.product_type === 'ready_made' ? `x${c.plateQty || 1}` : `(${c.grams}g)`}</span>
                    <span>₹{Math.round(c.price)}</span>
                  </div>
                ))}
              </div>
              <div style={{ borderTop: '1px dashed #ccc', paddingTop: 8, marginTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>Item Total</span><span>₹{Math.round(totals.price)}</span></div>
                {orderType === 'takeaway' && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>Packaging</span><span>₹10</span></div>}
                {couponDiscount && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#267E3E' }}><span>Discount ({couponDiscount.title})</span><span>-₹{couponDiscount.calculated_discount}</span></div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#9C9C9C', marginTop: 4 }}><span>Base Amount (excl. GST)</span><span>₹{getBaseAmount()}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#9C9C9C' }}><span>CGST (2.5%)</span><span>₹{Math.round(getGST() / 2 * 100) / 100}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#9C9C9C' }}><span>SGST (2.5%)</span><span>₹{Math.round(getGST() / 2 * 100) / 100}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 800, marginTop: 8, borderTop: '1px solid #333', paddingTop: 8 }}>
                  <span>TOTAL</span><span>₹{getFinalTotal()}</span>
                </div>
              </div>
            </div>

            {/* Payment Mode Selection */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, display: 'block' }}>Payment Method</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {PAYMENT_MODES.map(pm => (
                  <button key={pm.key} data-testid={`pay-${pm.key}`}
                    onClick={() => setPaymentMode(pm.key)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                      padding: '14px 8px', borderRadius: 12, cursor: 'pointer',
                      border: paymentMode === pm.key ? '2px solid #5B5FE0' : '2px solid #EFEFEF',
                      background: paymentMode === pm.key ? '#5B5FE010' : '#fff',
                      color: paymentMode === pm.key ? '#5B5FE0' : '#333',
                      fontWeight: paymentMode === pm.key ? 700 : 500, fontSize: 13,
                    }}>
                    {pm.icon}
                    {pm.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowPayment(false)}>Back to Cart</button>
              <button className="btn btn-green" onClick={confirmPayment} disabled={placing} data-testid="confirm-payment-btn" style={{ flex: 2 }}>
                {placing ? 'Processing...' : `Confirm ${paymentMode.toUpperCase()} — ₹${getFinalTotal()}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Modal */}
      {showAI && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && (setShowAI(false), setAiResult(null))}>
          <div className="modal">
            <h2>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5B5FE0" strokeWidth="2" style={{verticalAlign:'middle',marginRight:6}}><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
              AI Meal Guide
            </h2>
            <p style={{ fontSize: 13, color: '#9C9C9C', marginBottom: 14 }}>Help customer choose the best meal for their diet goal and budget</p>
            {!aiResult ? (
              <>
                <div className="form-group"><label>Customer's Goal</label>
                  <div className="ai-options">{[{ k: 'fat_loss', l: 'Fat Loss' }, { k: 'muscle_gain', l: 'Muscle Gain' }, { k: 'maintenance', l: 'Balanced' }].map(g => <button key={g.k} className={`ai-option ${aiGoal === g.k ? 'active' : ''}`} onClick={() => setAiGoal(g.k)}>{g.l}</button>)}</div>
                </div>
                <div className="form-group"><label>Diet Preference</label>
                  <div className="ai-options">{[{ k: 'veg', l: 'Veg' }, { k: 'non-veg', l: 'Non-Veg' }, { k: 'both', l: 'Both' }].map(d => <button key={d.k} className={`ai-option ${aiDiet === d.k ? 'active' : ''}`} onClick={() => setAiDiet(d.k)}>{d.l}</button>)}</div>
                </div>
                <div className="form-group"><label>Budget (₹)</label><input value={aiBudget} onChange={e => setAiBudget(e.target.value)} type="number" placeholder="200" /></div>
                <button className="btn btn-purple" style={{ width: '100%', padding: 14, marginTop: 8 }} onClick={runAI} disabled={aiLoading} data-testid="ai-build-btn">{aiLoading ? 'Building...' : 'Get AI Suggestion'}</button>
              </>
            ) : (
              <>
                <p style={{ marginBottom: 12, fontWeight: 600 }}>{aiResult.summary}</p>
                {aiResult.meal_items?.map((item: any, i: number) => (
                  <div className="ai-result-item" key={i}>
                    <div><div style={{ fontWeight: 700 }}>{item.product_name}</div><div style={{ fontSize: 12, color: '#9C9C9C' }}>{item.grams}g | {Math.round(item.calories)} cal</div></div>
                    <span style={{ fontWeight: 800, color: '#5B5FE0' }}>₹{Math.round(item.price)}</span>
                  </div>
                ))}
                {aiResult.totals && <div className="ai-totals">Total: ₹{Math.round(aiResult.totals.price)} | {Math.round(aiResult.totals.calories)} cal | P:{Math.round(aiResult.totals.protein)}g</div>}
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
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#267E3E" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>
              <h2 style={{ margin: '4px 0', color: '#267E3E' }}>Payment Received!</h2>
              <p style={{ fontSize: 13, color: '#9C9C9C' }}>Order sent to kitchen automatically</p>
            </div>
            <div id="receipt-print" style={{ fontFamily: 'monospace', fontSize: 13 }}>
              <div style={{ textAlign: 'center', marginBottom: 8 }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>DIET CAFE</h2>
                <p style={{ margin: 0, fontSize: 11, color: '#9C9C9C' }}>{showReceipt.cafe_tagline}</p>
              </div>
              <div className="dashed" style={{ borderTop: '1px dashed #ccc', margin: '8px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Order #</span><strong>{showReceipt.order_id}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Type</span><span>{showReceipt.order_type}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Customer</span><span>{showReceipt.customer_name}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Date</span><span>{new Date(showReceipt.date).toLocaleString()}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Payment</span><span style={{ fontWeight: 700, textTransform: 'uppercase' }}>{showReceipt.payment_mode}</span></div>
              <div style={{ borderTop: '1px dashed #ccc', margin: '8px 0' }} />
              {showReceipt.items?.map((item: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                  <span>{item.name} ({item.quantity})</span>
                  <span>₹{Math.round(item.price)}</span>
                </div>
              ))}
              <div style={{ borderTop: '1px dashed #ccc', margin: '8px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Item Total</span><span>₹{Math.round(showReceipt.subtotal)}</span></div>
              {showReceipt.extra_charge > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{showReceipt.extra_charge_label}</span><span>₹{showReceipt.extra_charge}</span></div>}
              {showReceipt.discount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#267E3E' }}><span>Discount</span><span>-₹{showReceipt.discount}</span></div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#9C9C9C' }}><span>Base (excl. GST)</span><span>₹{showReceipt.base_amount}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#9C9C9C' }}><span>CGST (2.5%)</span><span>₹{Math.round((showReceipt.gst_amount || 0) / 2 * 100) / 100}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#9C9C9C' }}><span>SGST (2.5%)</span><span>₹{Math.round((showReceipt.gst_amount || 0) / 2 * 100) / 100}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: 16, borderTop: '1px dashed #000', paddingTop: 6, marginTop: 6 }}>
                <span>TOTAL</span><span>₹{Math.round(showReceipt.total)}</span>
              </div>
              <div style={{ borderTop: '1px dashed #ccc', margin: '8px 0' }} />
              <div style={{ fontSize: 11, color: '#9C9C9C' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Calories</span><span>{Math.round(showReceipt.nutrition_summary?.calories || 0)} kcal</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Protein</span><span>{Math.round(showReceipt.nutrition_summary?.protein || 0)}g</span></div>
              </div>
              <div style={{ borderTop: '1px dashed #ccc', margin: '8px 0' }} />
              <p style={{ textAlign: 'center', fontSize: 11, color: '#9C9C9C' }}>Thank you for choosing Diet Cafe!</p>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowReceipt(null)} data-testid="close-receipt-btn">Done</button>
              <button className="btn btn-purple" onClick={printReceipt} data-testid="print-receipt-btn">Print Receipt</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
