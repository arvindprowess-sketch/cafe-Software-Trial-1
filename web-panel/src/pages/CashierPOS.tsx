import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';

export default function CashierPOS() {
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCat, setSelectedCat] = useState('All');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<any[]>([]);
  const [orderType, setOrderType] = useState('dine-in');
  const [placing, setPlacing] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [aiGoal, setAiGoal] = useState('maintenance');
  const [aiDiet, setAiDiet] = useState('both');
  const [aiBudget, setAiBudget] = useState('200');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);
  const [couponCode, setCouponCode] = useState('');
  const [couponDiscount, setCouponDiscount] = useState<any>(null);
  const [couponError, setCouponError] = useState('');
  const [showReceipt, setShowReceipt] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const [p, c] = await Promise.all([api('/products'), api('/categories')]);
        setProducts(p); setCategories(c);
      } catch {}
    })();
  }, []);

  const filtered = products.filter(p => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (selectedCat === 'All') return true;
    if (selectedCat === 'veg') return p.diet_type === 'veg';
    if (selectedCat === 'non-veg') return p.diet_type === 'non-veg';
    return p.category === selectedCat;
  });

  const addToCart = (product: any, grams = 100) => {
    setCart(prev => {
      const idx = prev.findIndex(c => c.id === product.id);
      const f = grams / 100;
      const item = { ...product, grams, price: Math.round(f * product.cost_per_100g * 100) / 100, calories: Math.round(f * product.calories_per_100g), protein: Math.round(f * product.protein_per_100g * 10) / 10 };
      if (idx >= 0) {
        const u = [...prev]; u[idx].grams += grams;
        const f2 = u[idx].grams / 100;
        u[idx].price = Math.round(f2 * product.cost_per_100g * 100) / 100;
        u[idx].calories = Math.round(f2 * product.calories_per_100g);
        u[idx].protein = Math.round(f2 * product.protein_per_100g * 10) / 10;
        return u;
      }
      return [...prev, item];
    });
    // Reset coupon when cart changes
    if (couponDiscount) { setCouponDiscount(null); setCouponCode(''); setCouponError(''); }
  };

  const remove = (id: string) => {
    setCart(prev => prev.filter(c => c.id !== id));
    if (couponDiscount) { setCouponDiscount(null); setCouponCode(''); setCouponError(''); }
  };

  const totals = cart.reduce((a, c) => ({ price: a.price + c.price, calories: a.calories + c.calories, protein: a.protein + c.protein }), { price: 0, calories: 0, protein: 0 });

  const applyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponError('');
    try {
      const result = await api('/orders/apply-coupon', { method: 'POST', body: { coupon_code: couponCode.trim().toUpperCase() } });
      // Check min order value
      if (result.min_order_value && totals.price < result.min_order_value) {
        setCouponError(`Minimum order ₹${result.min_order_value} required`);
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
  const getFinalTotal = () => Math.max(0, Math.round((totals.price + getExtraCharge() - getDiscount()) * 100) / 100);

  const placeOrder = async () => {
    if (!cart.length) return;
    setPlacing(true);
    try {
      const body = {
        order_type: orderType,
        items: cart.map(c => ({
          product_id: c.id, product_name: c.name, grams: c.grams, price: c.price,
          calories: c.calories, protein: c.protein,
          carbs: Math.round((c.grams / 100) * c.carbs_per_100g * 10) / 10,
          fat: Math.round((c.grams / 100) * c.fat_per_100g * 10) / 10,
          product_type: c.product_type || 'single', quantity: 1
        })),
        total_price: getFinalTotal(),
        total_calories: totals.calories,
        total_protein: totals.protein,
        total_carbs: cart.reduce((a, c) => a + Math.round((c.grams / 100) * c.carbs_per_100g * 10) / 10, 0),
        total_fat: cart.reduce((a, c) => a + Math.round((c.grams / 100) * c.fat_per_100g * 10) / 10, 0),
      };
      const r = await api('/orders', { method: 'POST', body });
      // Fetch receipt
      try {
        const receipt = await api(`/orders/${r.id}/receipt`);
        setShowReceipt(receipt);
      } catch {
        alert(`Order placed! #${r.id} - ₹${getFinalTotal()} (${orderType})`);
      }
      setCart([]);
      setCouponCode(''); setCouponDiscount(null); setCouponError('');
    } catch (e: any) { alert(e.message); }
    finally { setPlacing(false); }
  };

  const printReceipt = () => {
    const el = document.getElementById('receipt-print');
    if (!el) return;
    const w = window.open('', '_blank', 'width=400,height=600');
    if (!w) return;
    w.document.write(`<html><head><title>Receipt #${showReceipt?.order_id}</title>
      <style>body{font-family:monospace;padding:16px;font-size:13px;max-width:300px;margin:0 auto}
      h2{text-align:center;margin:0}.line{border-top:1px dashed #000;margin:8px 0}
      .row{display:flex;justify-content:space-between}.center{text-align:center}
      .bold{font-weight:bold}.total{font-size:16px;font-weight:bold}</style></head><body>`);
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
      if (p) addToCart(p, item.grams);
    }
    setShowAI(false); setAiResult(null);
  };

  return (
    <div className="pos-layout">
      <div className="pos-menu">
        <div className="pos-search">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search menu..." data-testid="pos-search" />
          <button className="btn btn-purple" onClick={() => setShowAI(true)} data-testid="ai-suggest-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
            AI Suggest
          </button>
        </div>
        <div className="pos-categories">
          {[{ key: 'All', name: 'All' }, ...categories].map(c => (
            <button key={c.key || c.name} className={`pos-cat ${selectedCat === (c.key || c.name) ? 'active' : ''}`} onClick={() => setSelectedCat(c.key || c.name)} data-testid={`cat-${c.key || c.name}`}>{c.name}</button>
          ))}
        </div>
        <div className="pos-products">
          {filtered.map(p => {
            const inCart = cart.find(c => c.id === p.id);
            return (
              <div key={p.id} className={`pos-product ${inCart ? 'in-cart' : ''}`} onClick={() => addToCart(p)} data-testid={`product-${p.id}`}>
                <span className="pos-product-badge" style={{ background: p.diet_type === 'non-veg' ? '#FDE8EA' : '#E8F5E9', color: p.diet_type === 'non-veg' ? '#E23744' : '#267E3E' }}>{p.diet_type === 'non-veg' ? 'Non-Veg' : 'Veg'}</span>
                <div className="pos-product-name">{p.name}</div>
                <div className="pos-product-price">₹{p.cost_per_100g}/100g</div>
                <div className="pos-product-nutrition">{p.calories_per_100g} cal | P:{p.protein_per_100g}g</div>
                {inCart && <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: '#5B5FE0' }}>{inCart.grams}g in cart</div>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="pos-cart">
        <div className="pos-cart-header">Cart ({cart.length} items)</div>
        <div className="pos-cart-items">
          {cart.map(c => (
            <div className="pos-cart-item" key={c.id}>
              <div className="pos-cart-info">
                <div className="pos-cart-name">{c.name}</div>
                <div className="pos-cart-detail">{c.grams}g | {c.calories} cal</div>
              </div>
              <span className="pos-cart-price">₹{Math.round(c.price)}</span>
              <button className="pos-cart-remove" onClick={() => remove(c.id)} data-testid={`remove-${c.id}`}>×</button>
            </div>
          ))}
          {cart.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#9C9C9C', fontSize: 14 }}>Add items from menu</div>}
        </div>
        <div className="pos-cart-footer">
          {/* Coupon Section */}
          {cart.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={couponCode}
                  onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponError(''); }}
                  placeholder="Coupon code"
                  style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid #EFEFEF', fontSize: 13, fontWeight: 600 }}
                  data-testid="coupon-input"
                />
                <button className="btn btn-sm btn-orange" onClick={applyCoupon} data-testid="apply-coupon-btn" disabled={!couponCode.trim()}>Apply</button>
              </div>
              {couponError && <p style={{ color: '#E23744', fontSize: 12, marginTop: 4 }} data-testid="coupon-error">{couponError}</p>}
              {couponDiscount && (
                <div style={{ background: '#E8F5E9', borderRadius: 8, padding: '6px 10px', marginTop: 6, fontSize: 12, color: '#267E3E', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} data-testid="coupon-applied">
                  <span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#267E3E" strokeWidth="3" style={{ verticalAlign: 'middle', marginRight: 4 }}><path d="M20 6L9 17l-5-5"/></svg>
                    {couponDiscount.title}
                  </span>
                  <span style={{ fontWeight: 700 }}>-₹{couponDiscount.calculated_discount}</span>
                </div>
              )}
            </div>
          )}

          <div className="order-type-toggle">
            {['dine-in', 'takeaway'].map(t => (
              <button key={t} className={`order-type-btn ${orderType === t ? 'active' : ''}`} onClick={() => setOrderType(t)} data-testid={`type-${t}`}>
                {t === 'dine-in' ? (
                  <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{verticalAlign:'middle',marginRight:4}}><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2M7 2v20M21 15V2v0a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3m0 0v7"/></svg> Dine-In</>
                ) : (
                  <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{verticalAlign:'middle',marginRight:4}}><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0"/></svg> Takeaway</>
                )}
              </button>
            ))}
          </div>
          <div className="pos-totals">
            <div className="pos-total-row"><span>Subtotal</span><span>₹{Math.round(totals.price)}</span></div>
            {orderType === 'takeaway' && <div className="pos-total-row"><span>Packaging</span><span>₹10</span></div>}
            {couponDiscount && <div className="pos-total-row" style={{ color: '#267E3E' }}><span>Discount ({couponDiscount.title})</span><span>-₹{couponDiscount.calculated_discount}</span></div>}
            <div className="pos-total-row grand"><span>Total</span><span>₹{getFinalTotal()}</span></div>
            <div className="pos-total-row" style={{ fontSize: 12 }}><span>Nutrition</span><span>{Math.round(totals.calories)} cal | P:{Math.round(totals.protein)}g</span></div>
          </div>
          <button className="pos-order-btn" onClick={placeOrder} disabled={placing || !cart.length} data-testid="place-order-btn">
            {placing ? 'Placing...' : `Place Order (${orderType})`}
          </button>
        </div>
      </div>

      {/* AI Modal */}
      {showAI && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && (setShowAI(false), setAiResult(null))}>
          <div className="modal">
            <h2>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5B5FE0" strokeWidth="2" style={{verticalAlign:'middle',marginRight:6}}><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
              AI Meal Builder
            </h2>
            {!aiResult ? (
              <>
                <div className="form-group"><label>Fitness Goal</label>
                  <div className="ai-options">{[{ k: 'fat_loss', l: 'Fat Loss' }, { k: 'muscle_gain', l: 'Muscle Gain' }, { k: 'maintenance', l: 'Balanced' }].map(g => <button key={g.k} className={`ai-option ${aiGoal === g.k ? 'active' : ''}`} onClick={() => setAiGoal(g.k)}>{g.l}</button>)}</div>
                </div>
                <div className="form-group"><label>Diet Preference</label>
                  <div className="ai-options">{[{ k: 'veg', l: 'Veg' }, { k: 'non-veg', l: 'Non-Veg' }, { k: 'both', l: 'Both' }].map(d => <button key={d.k} className={`ai-option ${aiDiet === d.k ? 'active' : ''}`} onClick={() => setAiDiet(d.k)}>{d.l}</button>)}</div>
                </div>
                <div className="form-group"><label>Budget (₹)</label><input value={aiBudget} onChange={e => setAiBudget(e.target.value)} type="number" placeholder="200" /></div>
                <button className="btn btn-purple" style={{ width: '100%', padding: 14, marginTop: 8 }} onClick={runAI} disabled={aiLoading} data-testid="ai-build-btn">{aiLoading ? 'Building...' : 'Build Meal'}</button>
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
            <h2>Order Receipt</h2>
            <div id="receipt-print" style={{ fontFamily: 'monospace', fontSize: 13 }}>
              <div style={{ textAlign: 'center', marginBottom: 8 }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>DIET CAFE</h2>
                <p style={{ margin: 0, fontSize: 11, color: '#9C9C9C' }}>{showReceipt.cafe_tagline}</p>
              </div>
              <div style={{ borderTop: '1px dashed #ccc', margin: '8px 0' }} />
              <div className="row" style={{ display: 'flex', justifyContent: 'space-between' }}><span>Order #</span><strong>{showReceipt.order_id}</strong></div>
              <div className="row" style={{ display: 'flex', justifyContent: 'space-between' }}><span>Type</span><span>{showReceipt.order_type}</span></div>
              <div className="row" style={{ display: 'flex', justifyContent: 'space-between' }}><span>Customer</span><span>{showReceipt.customer_name}</span></div>
              <div className="row" style={{ display: 'flex', justifyContent: 'space-between' }}><span>Date</span><span>{new Date(showReceipt.date).toLocaleString()}</span></div>
              <div style={{ borderTop: '1px dashed #ccc', margin: '8px 0' }} />
              {showReceipt.items?.map((item: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                  <span>{item.name} ({item.quantity})</span>
                  <span>₹{Math.round(item.price)}</span>
                </div>
              ))}
              <div style={{ borderTop: '1px dashed #ccc', margin: '8px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span>₹{Math.round(showReceipt.subtotal)}</span></div>
              {showReceipt.extra_charge > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{showReceipt.extra_charge_label}</span><span>₹{showReceipt.extra_charge}</span></div>}
              {showReceipt.discount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#267E3E' }}><span>Discount</span><span>-₹{showReceipt.discount}</span></div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: 16, borderTop: '1px dashed #000', paddingTop: 6, marginTop: 6 }}>
                <span>TOTAL</span><span>₹{Math.round(showReceipt.total)}</span>
              </div>
              <div style={{ borderTop: '1px dashed #ccc', margin: '8px 0' }} />
              <div style={{ fontSize: 11, color: '#9C9C9C' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Calories</span><span>{Math.round(showReceipt.nutrition_summary?.calories || 0)} kcal</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Protein</span><span>{Math.round(showReceipt.nutrition_summary?.protein || 0)}g</span></div>
              </div>
              <div style={{ borderTop: '1px dashed #ccc', margin: '8px 0' }} />
              <p style={{ textAlign: 'center', fontSize: 11, color: '#9C9C9C' }}>Payment: {showReceipt.payment_status}</p>
              <p style={{ textAlign: 'center', fontSize: 11, color: '#9C9C9C' }}>Thank you for choosing Diet Cafe!</p>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowReceipt(null)}>Close</button>
              <button className="btn btn-purple" onClick={printReceipt} data-testid="print-receipt-btn">Print Receipt</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
