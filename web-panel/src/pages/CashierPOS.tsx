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

  useEffect(() => { (async () => {
    try { const [p, c] = await Promise.all([api('/products'), api('/categories')]); setProducts(p); setCategories(c); } catch {}
  })(); }, []);

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
  };

  const remove = (id: string) => setCart(prev => prev.filter(c => c.id !== id));
  const totals = cart.reduce((a, c) => ({ price: a.price + c.price, calories: a.calories + c.calories, protein: a.protein + c.protein }), { price: 0, calories: 0, protein: 0 });

  const placeOrder = async () => {
    if (!cart.length) return;
    setPlacing(true);
    try {
      const body = {
        order_type: orderType,
        items: cart.map(c => ({ product_id: c.id, product_name: c.name, grams: c.grams, price: c.price, calories: c.calories, protein: c.protein, carbs: Math.round((c.grams/100)*c.carbs_per_100g*10)/10, fat: Math.round((c.grams/100)*c.fat_per_100g*10)/10, product_type: c.product_type||'single', quantity: 1 })),
        total_price: Math.round(totals.price * 100) / 100,
        total_calories: totals.calories, total_protein: totals.protein,
        total_carbs: cart.reduce((a,c) => a + Math.round((c.grams/100)*c.carbs_per_100g*10)/10, 0),
        total_fat: cart.reduce((a,c) => a + Math.round((c.grams/100)*c.fat_per_100g*10)/10, 0),
      };
      const r = await api('/orders', { method: 'POST', body });
      alert(`Order placed! #${r.id} - ₹${Math.round(totals.price)} (${orderType})`);
      setCart([]);
    } catch (e: any) { alert(e.message); }
    finally { setPlacing(false); }
  };

  const runAI = async () => {
    setAiLoading(true); setAiResult(null);
    try {
      const r = await api('/ai/quick-meal', { method: 'POST', body: { diet_preference: aiDiet, goal: aiGoal, budget: parseFloat(aiBudget)||undefined, order_type: orderType } });
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
          <button className="btn btn-purple" onClick={() => setShowAI(true)} data-testid="ai-suggest-btn">✨ AI Suggest</button>
        </div>
        <div className="pos-categories">
          {[{ key: 'All', name: 'All' }, ...categories].map(c => (
            <button key={c.key||c.name} className={`pos-cat ${selectedCat===(c.key||c.name)?'active':''}`} onClick={() => setSelectedCat(c.key||c.name)} data-testid={`cat-${c.key||c.name}`}>{c.name}</button>
          ))}
        </div>
        <div className="pos-products">
          {filtered.map(p => {
            const inCart = cart.find(c => c.id === p.id);
            return (
              <div key={p.id} className={`pos-product ${inCart?'in-cart':''}`} onClick={() => addToCart(p)} data-testid={`product-${p.id}`}>
                <span className="pos-product-badge" style={{background:p.diet_type==='non-veg'?'#FDE8EA':'#E8F5E9',color:p.diet_type==='non-veg'?'#E23744':'#267E3E'}}>{p.diet_type==='non-veg'?'Non-Veg':'Veg'}</span>
                <div className="pos-product-name">{p.name}</div>
                <div className="pos-product-price">₹{p.cost_per_100g}/100g</div>
                <div className="pos-product-nutrition">{p.calories_per_100g} cal | P:{p.protein_per_100g}g</div>
                {inCart && <div style={{marginTop:6,fontSize:11,fontWeight:700,color:'#5B5FE0'}}>{inCart.grams}g in cart</div>}
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
              <div className="pos-cart-info"><div className="pos-cart-name">{c.name}</div><div className="pos-cart-detail">{c.grams}g | {c.calories} cal</div></div>
              <span className="pos-cart-price">₹{Math.round(c.price)}</span>
              <button className="pos-cart-remove" onClick={() => remove(c.id)} data-testid={`remove-${c.id}`}>×</button>
            </div>
          ))}
          {cart.length === 0 && <div style={{textAlign:'center',padding:40,color:'#9C9C9C',fontSize:14}}>Add items from menu</div>}
        </div>
        <div className="pos-cart-footer">
          <div className="order-type-toggle">
            {['dine-in','takeaway'].map(t => <button key={t} className={`order-type-btn ${orderType===t?'active':''}`} onClick={() => setOrderType(t)} data-testid={`type-${t}`}>{t==='dine-in'?'🍽 Dine-In':'🛍 Takeaway'}</button>)}
          </div>
          <div className="pos-totals">
            <div className="pos-total-row"><span>Subtotal</span><span>₹{Math.round(totals.price)}</span></div>
            {orderType==='takeaway' && <div className="pos-total-row"><span>Packaging</span><span>₹10</span></div>}
            <div className="pos-total-row grand"><span>Total</span><span>₹{Math.round(totals.price)+(orderType==='takeaway'?10:0)}</span></div>
            <div className="pos-total-row" style={{fontSize:12}}><span>Nutrition</span><span>{Math.round(totals.calories)} cal | P:{Math.round(totals.protein)}g</span></div>
          </div>
          <button className="pos-order-btn" onClick={placeOrder} disabled={placing||!cart.length} data-testid="place-order-btn">
            {placing ? 'Placing...' : `Place Order (${orderType})`}
          </button>
        </div>
      </div>

      {showAI && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && (setShowAI(false), setAiResult(null))}>
          <div className="modal">
            <h2>✨ AI Meal Builder</h2>
            {!aiResult ? (
              <>
                <div className="form-group"><label>Fitness Goal</label>
                  <div className="ai-options">{[{k:'fat_loss',l:'Fat Loss'},{k:'muscle_gain',l:'Muscle Gain'},{k:'maintenance',l:'Balanced'}].map(g => <button key={g.k} className={`ai-option ${aiGoal===g.k?'active':''}`} onClick={() => setAiGoal(g.k)}>{g.l}</button>)}</div>
                </div>
                <div className="form-group"><label>Diet Preference</label>
                  <div className="ai-options">{[{k:'veg',l:'Veg'},{k:'non-veg',l:'Non-Veg'},{k:'both',l:'Both'}].map(d => <button key={d.k} className={`ai-option ${aiDiet===d.k?'active':''}`} onClick={() => setAiDiet(d.k)}>{d.l}</button>)}</div>
                </div>
                <div className="form-group"><label>Budget (₹)</label><input value={aiBudget} onChange={e => setAiBudget(e.target.value)} type="number" placeholder="200" /></div>
                <button className="btn btn-purple" style={{width:'100%',padding:14,marginTop:8}} onClick={runAI} disabled={aiLoading} data-testid="ai-build-btn">{aiLoading?'Building...':'✨ Build Meal'}</button>
              </>
            ) : (
              <>
                <p style={{marginBottom:12,fontWeight:600}}>{aiResult.summary}</p>
                {aiResult.meal_items?.map((item: any, i: number) => (
                  <div className="ai-result-item" key={i}>
                    <div><div style={{fontWeight:700}}>{item.product_name}</div><div style={{fontSize:12,color:'#9C9C9C'}}>{item.grams}g | {Math.round(item.calories)} cal</div></div>
                    <span style={{fontWeight:800,color:'#5B5FE0'}}>₹{Math.round(item.price)}</span>
                  </div>
                ))}
                {aiResult.totals && <div className="ai-totals">Total: ₹{Math.round(aiResult.totals.price)} | {Math.round(aiResult.totals.calories)} cal | P:{Math.round(aiResult.totals.protein)}g</div>}
                <div style={{display:'flex',gap:10,marginTop:16}}>
                  <button className="btn btn-secondary" style={{flex:1}} onClick={runAI}>Retry</button>
                  <button className="btn btn-green" style={{flex:2}} onClick={addAIToCart} data-testid="ai-add-cart">Add to Cart</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
