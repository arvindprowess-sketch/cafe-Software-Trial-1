import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { apiCall, getStoredUser } from '../utils/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { FUEL, FONT, RADIUS, SPACE } from '../utils/theme';
const Z_RED = FUEL.ink;
const GREEN = '#3FA34D';
const PURPLE = '#15140F';

export default function CustomizeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  console.log('[Customize] Screen mounted with params:', params);
  
  let initialCart = [];
  try {
    initialCart = params.cart ? JSON.parse(params.cart as string) : [];
    console.log('[Customize] Parsed cart:', initialCart);
  } catch (error) {
    console.error('[Customize] Error parsing cart:', error);
    Alert.alert('Error', 'Failed to load cart items');
  }
  
  const orderType = (params.orderType as string) || 'dine-in';
  console.log('[Customize] Order type:', orderType);

  // Normalize cart items - ensure all have 'id' field
  const normalizedCart = initialCart.map((item: any) => ({
    ...item,
    id: item.id || item.product_id,
    product_id: item.product_id || item.id,
    carbs_per_100g: item.carbs_per_100g || 0,
    fat_per_100g: item.fat_per_100g || 0,
  }));
  
  console.log('[Customize] Normalized cart:', normalizedCart);
  
  const [items, setItems] = useState<any[]>(normalizedCart);
  // FIX 3: carry goal + budget forward from the AI Picks / builder flow so we
  // don't ask the user for them a second time. When present, hide the selector.
  const cameFromAI = !!(params.goal);
  const [goal, setGoal] = useState((params.goal as string) || '');
  const [budget, setBudget] = useState((params.budget as string) || '');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<any>(null);
  const [ordering, setOrdering] = useState(false);
  const [inputMode, setInputMode] = useState<Record<string, 'grams' | 'rupees'>>({});

  // Scheduled order state
  const [selectedOrderType, setSelectedOrderType] = useState(orderType);
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledHour, setScheduledHour] = useState('');
  const [scheduledMinute, setScheduledMinute] = useState('');
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Calorie goal awareness
  const [userGoals, setUserGoals] = useState<any>({ daily_calories: 2000, daily_protein: 100, daily_carbs: 250, daily_fat: 65 });
  const [consumedToday, setConsumedToday] = useState<any>({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  const [showCalorieWarning, setShowCalorieWarning] = useState(false);
  const [aiAdjusting, setAiAdjusting] = useState(false);
  const [adjustedItems, setAdjustedItems] = useState<any>(null);

  useEffect(() => {
    loadUserGoals();
    AsyncStorage.getItem('delivery_address').then(a => { if (a) setDeliveryAddress(a); }).catch(() => {});
  }, []);

  const loadUserGoals = async () => {
    try {
      const [user, summary] = await Promise.all([
        getStoredUser(),
        apiCall('/user/nutrition-summary').catch(() => null),
      ]);
      if (user) {
        setUserGoals({
          daily_calories: user.daily_calories || 2000,
          daily_protein: user.daily_protein || 100,
          daily_carbs: user.daily_carbs || 250,
          daily_fat: user.daily_fat || 65,
        });
      }
      if (summary?.consumed) {
        setConsumedToday(summary.consumed);
      }
    } catch {}
  };

  // For single products
  const updateGrams = (id: string, grams: number) => setItems(items.map(i => i.id === id ? { ...i, grams: Math.max(0, grams) } : i));
  const updateByRupees = (id: string, rupees: number) => { 
    const item = items.find(i => i.id === id); 
    if (item) {
      const calculatedGrams = Math.round((rupees / item.cost_per_100g) * 100);
      setItems(items.map(i => i.id === id ? { ...i, grams: Math.max(0, calculatedGrams) } : i));
    }
  };
  
  // For ready-made dishes (plates)
  const updatePlates = (id: string, delta: number) => {
    setItems(items.map(i => {
      if (i.id !== id) return i;
      const newQty = Math.max(1, (i.quantity || 1) + delta);
      return { ...i, quantity: newQty, grams: (i.serving_grams || 300) * newQty };
    }));
  };
  
  // For editable ready-made dish ingredients
  const updateIngredientGrams = (itemId: string, ingIndex: number, newGrams: number) => {
    setItems(items.map(i => {
      if (i.id !== itemId) return i;
      const updatedIngredients = [...(i.customized_ingredients || i.ingredients || [])];
      updatedIngredients[ingIndex] = { 
        ...updatedIngredients[ingIndex], 
        grams_per_serving: Math.max(0, newGrams) 
      };
      return { ...i, customized_ingredients: updatedIngredients };
    }));
  };

  const removeItem = (id: string) => setItems(items.filter(i => i.id !== id));

  // Calculate totals for all items
  const totals = useMemo(() => {
    return items.reduce((a, i) => {
      let itemPrice, itemCal, itemProtein, itemCarbs, itemFat;
      
      if (i.product_type === 'ready_made') {
        const qty = i.quantity || 1;
        // Use fixed price or calculate from per plate
        itemPrice = (i.fixed_price || (i.cost_per_100g * (i.serving_grams || 300) / 100)) * qty;
        // Use total per serving or calculate
        itemCal = (i.total_calories_per_serving || i.calories_per_100g || 0) * qty;
        itemProtein = (i.total_protein_per_serving || i.protein_per_100g || 0) * qty;
        itemCarbs = (i.total_carbs_per_serving || i.carbs_per_100g || 0) * qty;
        itemFat = (i.total_fat_per_serving || i.fat_per_100g || 0) * qty;
      } else {
        const f = i.grams / 100;
        itemPrice = f * i.cost_per_100g;
        itemCal = f * (i.calories_per_100g || 0);
        itemProtein = f * (i.protein_per_100g || 0);
        itemCarbs = f * (i.carbs_per_100g || 0);
        itemFat = f * (i.fat_per_100g || 0);
      }
      
      return { 
        price: a.price + itemPrice, 
        calories: a.calories + itemCal, 
        protein: a.protein + itemProtein, 
        carbs: a.carbs + itemCarbs, 
        fat: a.fat + itemFat 
      };
    }, { price: 0, calories: 0, protein: 0, carbs: 0, fat: 0 });
  }, [items]);

  // Calculate how much over the calorie goal
  const projectedCalories = (consumedToday.calories || 0) + totals.calories;
  const calorieGoal = userGoals.daily_calories;
  const caloriesOver = Math.round(projectedCalories - calorieGoal);
  const isOverGoal = caloriesOver > 0;

  const extra = selectedOrderType === 'delivery' ? 30 : selectedOrderType === 'takeaway' ? 10 : 0;

  // Build scheduled ready time ISO string
  const getScheduledReadyTime = (): string | null => {
    if (!isScheduled || !scheduledHour || !scheduledMinute) return null;
    const now = new Date();
    const scheduled = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(scheduledHour), parseInt(scheduledMinute), 0);
    if (scheduled.getTime() <= now.getTime()) {
      scheduled.setDate(scheduled.getDate() + 1);
    }
    return scheduled.toISOString();
  };

  const getAiSuggestion = async () => {
    if (!goal) { Alert.alert('Set Goal', 'Select a fitness goal first'); return; }
    setAiLoading(true); setAiSuggestion(null);
    try {
      const result = await apiCall('/ai/suggest', { method: 'POST', body: { goal, budget: budget ? parseFloat(budget) : null, selected_items: items.map(i => ({ product_id: i.id, product_name: i.name, grams: i.grams, price: (i.grams / 100) * i.cost_per_100g })), current_nutrition: { ...totals } } });
      setAiSuggestion(result);
    } catch (e: any) { Alert.alert('Error', e.message); } finally { setAiLoading(false); }
  };

  const applySuggestion = async (s: any) => {
    const suggestedName = s.product_name?.toLowerCase().trim() || '';
    
    // Try to find the item by name (case insensitive, partial match)
    let item = items.find(i => {
      const itemName = i.name?.toLowerCase().trim() || '';
      return itemName === suggestedName ||
        itemName.includes(suggestedName) ||
        suggestedName.includes(itemName);
    });
    
    if (item) {
      // Item exists in cart - update grams
      const newGrams = s.suggested_grams || 100;
      setItems(items.map(i => i.id === item.id ? { ...i, grams: newGrams } : i));
      Alert.alert('Applied!', `${item.name} updated to ${newGrams}g`);
    } else {
      // Item not in cart - need to fetch it and add
      try {
        const allProducts = await apiCall('/products');
        const product = allProducts.find((p: any) => {
          const productName = p.name?.toLowerCase().trim() || '';
          return productName === suggestedName ||
            productName.includes(suggestedName) ||
            suggestedName.includes(productName);
        });
        
        if (product) {
          // Add to cart with suggested grams - ensure all required fields are present
          const newItem = {
            ...product,
            id: product.id,
            name: product.name,
            grams: s.suggested_grams || 100,
            cost_per_100g: product.cost_per_100g,
            calories_per_100g: product.calories_per_100g,
            protein_per_100g: product.protein_per_100g,
            carbs_per_100g: product.carbs_per_100g,
            fat_per_100g: product.fat_per_100g,
            category: product.category,
            diet_type: product.diet_type || 'veg',
            product_type: product.product_type || 'single'
          };
          setItems(prevItems => [...prevItems, newItem]);
          Alert.alert('Added!', `${product.name} added with ${s.suggested_grams}g`);
        } else {
          Alert.alert('Not Found', `Could not find "${s.product_name}" in menu`);
        }
      } catch (e) {
        Alert.alert('Error', 'Could not add item. Please try again.');
      }
    }
    setAiSuggestion(null);
  };

  const handlePlaceOrder = () => {
    if (items.length === 0 || items.every(i => i.grams === 0 && (i.quantity || 0) === 0)) { 
      Alert.alert('Empty', 'Add items with quantities'); 
      return; 
    }
    if (isOverGoal) {
      setShowCalorieWarning(true);
      setAdjustedItems(null);
      return;
    }
    confirmOrder();
  };

  const handleAiAdjust = async () => {
    setAiAdjusting(true);
    try {
      const payload = {
        items: items.filter(i => i.grams > 0).map(i => ({
          name: i.name,
          grams: i.grams,
          calories_per_100g: i.calories_per_100g,
          protein_per_100g: i.protein_per_100g,
        })),
        calorie_goal: calorieGoal,
        consumed_today: consumedToday.calories || 0,
      };
      const result = await apiCall('/ai/adjust-portions', { method: 'POST', body: payload });
      setAdjustedItems(result);
    } catch (e) {
      Alert.alert('Error', 'Could not get AI suggestions. Try adjusting manually.');
    } finally {
      setAiAdjusting(false);
    }
  };

  const applyAdjustments = () => {
    if (!adjustedItems?.adjusted_items) return;
    const newItems = items.map(item => {
      const adj = adjustedItems.adjusted_items.find(
        (a: any) => a.name.toLowerCase() === item.name.toLowerCase()
      );
      return adj ? { ...item, grams: adj.adjusted_grams } : item;
    });
    setItems(newItems);
    setShowCalorieWarning(false);
    setAdjustedItems(null);
  };

  const confirmOrder = async () => {
    setShowCalorieWarning(false);
    // Validate scheduled time if scheduling
    if (isScheduled) {
      if (!scheduledHour || !scheduledMinute) {
        Alert.alert('Set Time', 'Please select a ready time for your scheduled order');
        return;
      }
      const readyTime = getScheduledReadyTime();
      if (!readyTime) {
        Alert.alert('Invalid Time', 'Please select a valid future time');
        return;
      }
    }
    setOrdering(true);
    try {
      const orderItems = items.filter(i => i.grams > 0 || (i.quantity || 0) > 0).map(i => {
        if (i.product_type === 'ready_made') {
          const qty = i.quantity || 1;
          return {
            product_id: i.id || i.product_id,
            product_name: i.name,
            product_type: 'ready_made',
            quantity: qty,
            grams: (i.serving_grams || 300) * qty,
            price: (i.fixed_price || (i.cost_per_100g * (i.serving_grams || 300) / 100)) * qty,
            calories: (i.total_calories_per_serving || i.calories_per_100g) * qty,
            protein: (i.total_protein_per_serving || i.protein_per_100g) * qty,
            carbs: (i.total_carbs_per_serving || i.carbs_per_100g || 0) * qty,
            fat: (i.total_fat_per_serving || i.fat_per_100g || 0) * qty,
            customized_ingredients: i.customized_ingredients || null
          };
        } else {
          const f = i.grams / 100;
          return {
            product_id: i.id || i.product_id,
            product_name: i.name,
            product_type: 'single',
            grams: i.grams,
            price: f * i.cost_per_100g,
            calories: f * i.calories_per_100g,
            protein: f * i.protein_per_100g,
            carbs: f * (i.carbs_per_100g || 0),
            fat: f * (i.fat_per_100g || 0)
          };
        }
      });
      
      const orderBody: any = { 
        order_type: selectedOrderType, 
        items: orderItems, 
        total_price: totals.price, 
        total_calories: totals.calories, 
        total_protein: totals.protein, 
        total_carbs: totals.carbs, 
        total_fat: totals.fat, 
        fitness_goal: goal || null, 
        budget: budget ? parseFloat(budget) : null,
        delivery_address: selectedOrderType === 'delivery' ? (deliveryAddress || null) : null,
        is_scheduled: isScheduled,
      };
      if (isScheduled) {
        orderBody.scheduled_ready_time = getScheduledReadyTime();
      }

      const placeOrder = async (confirmDuplicate = false) => {
        if (confirmDuplicate) orderBody.confirm_duplicate = true;
        await apiCall('/orders', { method: 'POST', body: orderBody });
        const msg = isScheduled
          ? `Scheduled for ${scheduledHour}:${scheduledMinute.padStart(2, '0')}`
          : `Total: ₹${Math.round(totals.price + extra)}`;
        Alert.alert(isScheduled ? 'Order Scheduled!' : 'Order Placed!', msg);
        setTimeout(() => router.replace('/(tabs)/orders'), 1500);
      };

      try {
        await placeOrder(false);
      } catch (e: any) {
        // B3: duplicate-order guard -> ask the customer to confirm
        if (e?.status === 409 && e?.detail?.warning === 'duplicate_order') {
          setOrdering(false);
          Alert.alert(
            'Duplicate order?',
            e.detail.message || 'An identical order was just placed. Place it again?',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Place anyway', onPress: async () => { setOrdering(true); try { await placeOrder(true); } catch (er: any) { Alert.alert('Error', er.message); } finally { setOrdering(false); } } },
            ]
          );
          return;
        }
        throw e;
      }
    } catch (e: any) { Alert.alert('Error', e.message); } finally { setOrdering(false); }
  };

  // Render single product item (customizable by grams)
  const renderSingleProduct = (item: any) => {
    const mode = inputMode[item.id] || 'grams';
    const f = item.grams / 100;
    const currentRupees = Math.round(f * item.cost_per_100g);
    // Track rupee input value for display (synced with grams)
    const displayRupees = currentRupees;
    
    return (
      <View key={item.id} style={styles.itemCard} testID={`customize-item-${item.id}`}>
        <View style={styles.itemTop}>
          <View style={styles.itemHeader}>
            <View style={[styles.vegBox, { borderColor: item.diet_type === 'non-veg' ? Z_RED : GREEN }]}>
              <View style={[styles.vegDot, { backgroundColor: item.diet_type === 'non-veg' ? Z_RED : GREEN }]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemMeta}>{item.category} • ₹{item.cost_per_100g}/100g</Text>
            </View>
          </View>
          <TouchableOpacity testID={`remove-item-${item.id}`} onPress={() => removeItem(item.id)}>
            <Ionicons name="close-circle" size={22} color="#D0D0D0" />
          </TouchableOpacity>
        </View>
        <View style={styles.modeRow}>
          {(['grams', 'rupees'] as const).map(m => (
            <TouchableOpacity key={m} testID={`mode-${m}-${item.id}`} style={[styles.modeBtn, mode === m && styles.modeBtnActive]} onPress={() => setInputMode({ ...inputMode, [item.id]: m })}>
              <Text style={[styles.modeText, mode === m && { color: Z_RED }]}>{m === 'grams' ? 'Grams' : 'Rupees'}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.qtyRow}>
          <TouchableOpacity style={styles.qtyBtn} onPress={() => mode === 'grams' ? updateGrams(item.id, item.grams - 25) : updateByRupees(item.id, displayRupees - 10)}>
            <Ionicons name="remove" size={16} color={Z_RED} />
          </TouchableOpacity>
          <TextInput testID={`qty-input-${item.id}`} style={styles.qtyInput}
            value={mode === 'grams' ? String(item.grams) : String(displayRupees)}
            onChangeText={v => { const n = parseInt(v) || 0; mode === 'grams' ? updateGrams(item.id, n) : updateByRupees(item.id, n); }}
            keyboardType="number-pad" />
          <Text style={styles.qtyUnit}>{mode === 'grams' ? 'g' : '₹'}</Text>
          <TouchableOpacity style={[styles.qtyBtn, { backgroundColor: Z_RED }]} onPress={() => mode === 'grams' ? updateGrams(item.id, item.grams + 25) : updateByRupees(item.id, displayRupees + 10)}>
            <Ionicons name="add" size={16} color="#FFF" />
          </TouchableOpacity>
        </View>
        
        {/* Show conversion feedback - always show in rupees mode with calculated grams */}
        {mode === 'rupees' && (
          <View style={styles.conversionRow}>
            <Ionicons name="swap-horizontal" size={14} color="#5E97B8" />
            <Text style={styles.conversionText}>
              ₹{displayRupees} = <Text style={styles.conversionHighlight}>{item.grams}g</Text> of {item.name}
            </Text>
          </View>
        )}
        
        <View style={styles.nutriRow}>
          <Text style={styles.nutriText}>{Math.round(f * item.calories_per_100g)} cal</Text>
          <Text style={styles.nutriText}>P: {(f * item.protein_per_100g).toFixed(1)}g</Text>
          <Text style={styles.nutriText}>C: {(f * item.carbs_per_100g).toFixed(1)}g</Text>
          <Text style={styles.nutriText}>F: {(f * item.fat_per_100g).toFixed(1)}g</Text>
          <Text style={styles.priceText}>₹{currentRupees}</Text>
        </View>
      </View>
    );
  };

  // Render ready-made dish (plates - editable or fixed)
  const renderReadyMadeDish = (item: any) => {
    const qty = item.quantity || 1;
    const isEditable = item.is_editable;
    const ingredients = item.customized_ingredients || item.ingredients || [];
    const pricePerPlate = item.fixed_price || (item.cost_per_100g * (item.serving_grams || 300) / 100);
    
    return (
      <View key={item.id} style={[styles.itemCard, styles.readyMadeCard]} testID={`customize-item-${item.id}`}>
        <View style={styles.itemTop}>
          <View style={styles.itemHeader}>
            <View style={[styles.vegBox, { borderColor: item.diet_type === 'non-veg' ? Z_RED : GREEN }]}>
              <View style={[styles.vegDot, { backgroundColor: item.diet_type === 'non-veg' ? Z_RED : GREEN }]} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.nameRow}>
                <Text style={styles.itemName}>{item.name}</Text>
                <View style={[styles.typeBadge, isEditable ? styles.editableBadge : styles.fixedBadge]}>
                  <Ionicons name={isEditable ? 'create' : 'lock-closed'} size={9} color="#FFF" />
                  <Text style={styles.typeText}>{isEditable ? 'Editable' : 'Fixed'}</Text>
                </View>
              </View>
              <Text style={styles.itemMeta}>Ready-Made • ₹{Math.round(pricePerPlate)}/plate</Text>
            </View>
          </View>
          <TouchableOpacity testID={`remove-item-${item.id}`} onPress={() => removeItem(item.id)}>
            <Ionicons name="close-circle" size={22} color="#D0D0D0" />
          </TouchableOpacity>
        </View>

        {/* Plate quantity selector */}
        <View style={styles.plateRow}>
          <Text style={styles.plateLabel}>Plates</Text>
          <View style={styles.plateSelector}>
            <TouchableOpacity style={styles.plateBtn} onPress={() => updatePlates(item.id, -1)}>
              <Ionicons name="remove" size={16} color={PURPLE} />
            </TouchableOpacity>
            <Text style={styles.plateCount}>{qty}</Text>
            <TouchableOpacity style={[styles.plateBtn, { backgroundColor: PURPLE }]} onPress={() => updatePlates(item.id, 1)}>
              <Ionicons name="add" size={16} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Ingredients breakdown */}
        {ingredients.length > 0 && (
          <View style={styles.ingredientsBox}>
            <Text style={styles.ingredientsTitle}>
              <Ionicons name="list" size={12} color={PURPLE} /> Ingredients {isEditable ? '(tap to edit)' : ''}
            </Text>
            {ingredients.map((ing: any, idx: number) => (
              <View key={idx} style={styles.ingredientRow}>
                <Text style={styles.ingredientName}>{ing.name || ing}</Text>
                {isEditable ? (
                  <View style={styles.ingredientEdit}>
                    <TouchableOpacity 
                      style={styles.ingEditBtn} 
                      onPress={() => updateIngredientGrams(item.id, idx, (ing.grams_per_serving || 100) - 10)}
                    >
                      <Ionicons name="remove" size={12} color={PURPLE} />
                    </TouchableOpacity>
                    <Text style={styles.ingredientGrams}>{ing.grams_per_serving || 100}g</Text>
                    <TouchableOpacity 
                      style={styles.ingEditBtn} 
                      onPress={() => updateIngredientGrams(item.id, idx, (ing.grams_per_serving || 100) + 10)}
                    >
                      <Ionicons name="add" size={12} color={PURPLE} />
                    </TouchableOpacity>
                    <Text style={styles.ingredientTotal}>× {qty} = {((ing.grams_per_serving || 100) * qty)}g</Text>
                  </View>
                ) : (
                  <Text style={styles.ingredientGramsFixed}>
                    {ing.grams_per_serving || 100}g × {qty} = {((ing.grams_per_serving || 100) * qty)}g
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}

        <View style={styles.nutriRow}>
          <Text style={styles.nutriText}>{Math.round((item.total_calories_per_serving || item.calories_per_100g) * qty)} cal</Text>
          <Text style={styles.nutriText}>P: {Math.round((item.total_protein_per_serving || item.protein_per_100g) * qty)}g</Text>
          <Text style={styles.nutriText}>C: {Math.round((item.total_carbs_per_serving || item.carbs_per_100g) * qty)}g</Text>
          <Text style={styles.nutriText}>F: {Math.round((item.total_fat_per_serving || item.fat_per_100g) * qty)}g</Text>
          <Text style={[styles.priceText, { color: PURPLE }]}>₹{Math.round(pricePerPlate * qty)}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.topBar}>
          <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color="#15140F" />
          </TouchableOpacity>
          <Text style={styles.topTitle}>Customize Meal</Text>
          <View style={styles.orderTypeBadge}><Text style={styles.orderTypeBadgeText}>{selectedOrderType}</Text></View>
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Order Type Selector */}
          <Text style={styles.section}>Order Type</Text>
          <View style={styles.orderTypeRow} testID="order-type-selector">
            {[
              { key: 'dine-in', label: 'Dine-in', icon: 'restaurant' as const },
              { key: 'takeaway', label: 'Takeaway', icon: 'bag-handle' as const },
              { key: 'delivery', label: 'Delivery', icon: 'bicycle' as const },
            ].map(t => (
              <TouchableOpacity
                key={t.key}
                testID={`order-type-${t.key}`}
                style={[styles.orderTypeChip, selectedOrderType === t.key && styles.orderTypeChipActive]}
                onPress={() => setSelectedOrderType(t.key)}
              >
                <Ionicons name={t.icon} size={16} color={selectedOrderType === t.key ? '#FFF' : FUEL.muted} />
                <Text style={[styles.orderTypeChipText, selectedOrderType === t.key && { color: '#FFF' }]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* FIX 1: delivery address carried from Home (persisted) */}
          {selectedOrderType === 'delivery' && (
            <View style={styles.deliveryAddrCard} testID="customize-delivery-address">
              <Ionicons name="location" size={16} color={Z_RED} />
              <View style={{ flex: 1 }}>
                <Text style={styles.deliveryAddrLabel}>Deliver to</Text>
                <Text style={styles.deliveryAddrText} numberOfLines={2}>
                  {deliveryAddress || 'No address set — add one from the Home screen'}
                </Text>
              </View>
            </View>
          )}

          {/* Schedule Toggle */}
          <View style={styles.scheduleSection} testID="schedule-section">
            <View style={styles.scheduleToggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.scheduleLabel}>Schedule for later</Text>
                <Text style={styles.scheduleHint}>Set a specific meal ready time</Text>
              </View>
              <TouchableOpacity
                testID="schedule-toggle"
                style={[styles.scheduleToggle, isScheduled && styles.scheduleToggleActive]}
                onPress={() => { setIsScheduled(!isScheduled); if (!isScheduled) setShowTimePicker(true); }}
              >
                <View style={[styles.scheduleToggleThumb, isScheduled && styles.scheduleToggleThumbActive]} />
              </TouchableOpacity>
            </View>
            {isScheduled && (
              <View style={styles.timePickerContainer} testID="time-picker">
                <Text style={styles.timePickerLabel}>Ready at:</Text>
                <View style={styles.timeInputRow}>
                  <TextInput
                    testID="schedule-hour-input"
                    style={styles.timeInput}
                    value={scheduledHour}
                    onChangeText={(t) => { const v = t.replace(/[^0-9]/g, ''); if (parseInt(v) <= 23 || v === '') setScheduledHour(v.slice(0, 2)); }}
                    placeholder="HH"
                    placeholderTextColor="#B0B0B0"
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                  <Text style={styles.timeColon}>:</Text>
                  <TextInput
                    testID="schedule-minute-input"
                    style={styles.timeInput}
                    value={scheduledMinute}
                    onChangeText={(t) => { const v = t.replace(/[^0-9]/g, ''); if (parseInt(v) <= 59 || v === '') setScheduledMinute(v.slice(0, 2)); }}
                    placeholder="MM"
                    placeholderTextColor="#B0B0B0"
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                </View>
                {scheduledHour && scheduledMinute && (
                  <View style={styles.alertInfoRow}>
                    <Ionicons name="notifications" size={14} color="#5E97B8" />
                    <Text style={styles.alertInfoText}>
                      Kitchen will be alerted at {
                        (() => {
                          const alertMin = selectedOrderType === 'delivery' ? 20 : 10;
                          let h = parseInt(scheduledHour); let m = parseInt(scheduledMinute) - alertMin;
                          if (m < 0) { m += 60; h -= 1; } if (h < 0) h += 24;
                          return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
                        })()
                      } ({selectedOrderType === 'delivery' ? '20' : '10'} min before)
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {!cameFromAI && (
            <>
              <Text style={styles.section}>Fitness Goal</Text>
              <View style={styles.goalContainer}>
                <View style={styles.goalRow}>
                  {[
                    { key: 'fat_loss', label: 'Fat Loss' },
                    { key: 'muscle_gain', label: 'Muscle Gain' },
                    { key: 'maintenance', label: 'Maintain' }
                  ].map(g => (
                    <TouchableOpacity key={g.key} testID={`customize-goal-${g.key}`} style={[styles.goalChip, goal === g.key && styles.goalActive]} onPress={() => setGoal(g.key)}>
                      <Text style={[styles.goalText, goal === g.key && { color: '#FFF' }]}>{g.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.goalRow}>
                  {[
                    { key: 'beginner', label: 'Beginner' },
                    { key: 'recomposition', label: 'Recomp' },
                    { key: 'lean_bulk', label: 'Lean Bulk' }
                  ].map(g => (
                    <TouchableOpacity key={g.key} testID={`customize-goal-${g.key}`} style={[styles.goalChip, goal === g.key && styles.goalActive]} onPress={() => setGoal(g.key)}>
                      <Text style={[styles.goalText, goal === g.key && { color: '#FFF' }]}>{g.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={styles.budgetRow}>
                <Text style={styles.budgetLabel}>Budget</Text>
                <TextInput testID="budget-input" style={styles.budgetInput} value={budget} onChangeText={setBudget} placeholder="₹ optional" placeholderTextColor="#B0B0B0" keyboardType="number-pad" />
              </View>
            </>
          )}

          <Text style={styles.section}>Your Items</Text>
          {items.map(item => 
            item.product_type === 'ready_made' 
              ? renderReadyMadeDish(item) 
              : renderSingleProduct(item)
          )}

          <TouchableOpacity testID="ai-suggest-btn" style={styles.aiBtn} onPress={getAiSuggestion} disabled={aiLoading}>
            {aiLoading ? <ActivityIndicator color="#FFF" /> : <><Ionicons name="sparkles" size={18} color="#FFF" /><Text style={styles.aiBtnText}>AI Meal Suggestion</Text></>}
          </TouchableOpacity>

          {aiSuggestion && (
            <View style={styles.aiCard}>
              <Text style={styles.aiTitle}><Ionicons name="sparkles" size={14} color="#5E97B8" /> AI Recommendation</Text>
              <Text style={styles.aiSummary}>{aiSuggestion.summary}</Text>
              {aiSuggestion.suggestions?.map((s: any, i: number) => (
                <View key={i} style={styles.aiSugRow}>
                  <View style={{ flex: 1 }}><Text style={styles.aiSugName}>{s.product_name}: {s.suggested_grams}g</Text><Text style={styles.aiSugReason}>{s.reason}</Text></View>
                  <TouchableOpacity testID={`apply-suggestion-${i}`} style={styles.applyBtn} onPress={() => applySuggestion(s)}><Text style={styles.applyText}>Apply</Text></TouchableOpacity>
                </View>
              ))}
            </View>
          )}
          <View style={{ height: 120 }} />
        </ScrollView>

        {/* Calorie Goal Awareness Banner */}
        {items.length > 0 && (
          <View style={[styles.calorieBanner, isOverGoal ? styles.calorieBannerOver : styles.calorieBannerOk]} testID="calorie-goal-banner">
            <View style={styles.calorieBannerLeft}>
              <Ionicons name={isOverGoal ? 'alert-circle' : 'checkmark-circle'} size={18} color={isOverGoal ? FUEL.ink : '#3FA34D'} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.calorieBannerTitle, isOverGoal && { color: FUEL.ink }]}>
                  {isOverGoal ? `${caloriesOver} cal over your daily goal` : 'Within your calorie goal'}
                </Text>
                <Text style={styles.calorieBannerSub}>
                  {Math.round(consumedToday.calories || 0)} eaten + {Math.round(totals.calories)} this meal = {Math.round(projectedCalories)} / {calorieGoal} cal
                </Text>
              </View>
            </View>
            <View style={styles.calorieMiniBar}>
              <View style={[styles.calorieMiniBarFill, { width: `${Math.min((projectedCalories / calorieGoal) * 100, 100)}%` }, isOverGoal && styles.calorieMiniBarOver]} />
              {isOverGoal && <View style={[styles.calorieMiniBarExcess, { width: `${Math.min(((caloriesOver) / calorieGoal) * 100, 40)}%` }]} />}
            </View>
          </View>
        )}

        <View style={styles.bottomBar}>
          <View style={styles.bottomInfo}>
            <View style={styles.bottomRow}>
              <Text style={styles.bottomCal}>{Math.round(totals.calories)} cal</Text>
              <Text style={styles.bottomMacro}>P:{Math.round(totals.protein)}g C:{Math.round(totals.carbs)}g F:{Math.round(totals.fat)}g</Text>
            </View>
            <View style={styles.bottomRow}>
              <Text style={styles.bottomPrice}>₹{Math.round(totals.price + extra)}</Text>
              {extra > 0 && <Text style={styles.extraText}>incl. ₹{extra} {selectedOrderType}</Text>}
              {isScheduled && scheduledHour && scheduledMinute && (
                <Text style={styles.scheduledBadgeBottom}>
                  <Ionicons name="time" size={11} color="#5E97B8" /> {scheduledHour}:{scheduledMinute.padStart(2, '0')}
                </Text>
              )}
            </View>
          </View>
          <TouchableOpacity testID="place-order-btn" style={[styles.orderBtn, isScheduled && styles.orderBtnScheduled]} onPress={handlePlaceOrder} disabled={ordering}>
            {ordering ? <ActivityIndicator color="#FFF" /> : (
              <Text style={styles.orderBtnText}>{isScheduled ? 'Schedule Order' : 'Place Order'}</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Calorie Goal Exceeded Warning Modal */}
        <Modal visible={showCalorieWarning} transparent animationType="fade" testID="calorie-warning-modal">
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalIconRow}>
                <View style={styles.modalIconBg}>
                  <Ionicons name="fitness" size={28} color="#15140F" />
                </View>
              </View>
              <Text style={styles.modalTitle}>Calorie Goal Exceeded</Text>
              <Text style={styles.modalDesc}>
                This meal will put you <Text style={styles.modalHighlight}>{caloriesOver} calories</Text> over your daily goal of {calorieGoal} cal.
              </Text>
              <View style={styles.modalBreakdown}>
                <View style={styles.modalBreakdownRow}>
                  <Text style={styles.modalBreakdownLabel}>Already eaten today</Text>
                  <Text style={styles.modalBreakdownVal}>{Math.round(consumedToday.calories || 0)} cal</Text>
                </View>
                <View style={styles.modalBreakdownRow}>
                  <Text style={styles.modalBreakdownLabel}>This meal</Text>
                  <Text style={styles.modalBreakdownVal}>+{Math.round(totals.calories)} cal</Text>
                </View>
                <View style={[styles.modalBreakdownRow, styles.modalBreakdownTotal]}>
                  <Text style={styles.modalBreakdownTotalLabel}>Total today</Text>
                  <Text style={styles.modalBreakdownTotalVal}>{Math.round(projectedCalories)} / {calorieGoal} cal</Text>
                </View>
              </View>
              <TouchableOpacity testID="calorie-warning-adjust-btn" style={styles.modalAdjustBtn} onPress={() => setShowCalorieWarning(false)}>
                <Ionicons name="create" size={18} color="#5E97B8" />
                <Text style={styles.modalAdjustText}>Adjust Manually</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="ai-adjust-btn" style={styles.aiAdjustBtn} onPress={handleAiAdjust} disabled={aiAdjusting}>
                {aiAdjusting ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="sparkles" size={18} color="#FFF" />
                    <Text style={styles.aiAdjustText}>AI Auto-Adjust</Text>
                    <View style={styles.recommendedBadge}><Text style={styles.recommendedText}>Recommended</Text></View>
                  </>
                )}
              </TouchableOpacity>
              {/* AI Adjustment Results */}
              {adjustedItems && (
                <View style={styles.adjustResults} testID="ai-adjustment-results">
                  <Text style={styles.adjustTitle}>AI Suggestion</Text>
                  <Text style={styles.adjustSummary}>{adjustedItems.summary}</Text>
                  {adjustedItems.adjusted_items?.map((adj: any, idx: number) => (
                    <View key={idx} style={styles.adjustRow}>
                      <Text style={styles.adjustName}>{adj.name}</Text>
                      <View style={styles.adjustChange}>
                        <Text style={styles.adjustOld}>{adj.original_grams}g</Text>
                        <Ionicons name="arrow-forward" size={12} color="#9C9C9C" />
                        <Text style={styles.adjustNew}>{adj.adjusted_grams}g</Text>
                      </View>
                    </View>
                  ))}
                  <View style={styles.adjustSavings}>
                    <Ionicons name="trending-down" size={14} color="#3FA34D" />
                    <Text style={styles.adjustSavingsText}>Saves {adjustedItems.saved_calories} cal</Text>
                  </View>
                  <TouchableOpacity testID="apply-ai-adjust-btn" style={styles.applyBtn} onPress={applyAdjustments}>
                    <Ionicons name="checkmark-circle" size={18} color="#FFF" />
                    <Text style={styles.applyText}>Apply AI Adjustment</Text>
                  </TouchableOpacity>
                </View>
              )}
              <TouchableOpacity testID="calorie-warning-continue-btn" style={styles.modalContinueBtn} onPress={confirmOrder}>
                <Text style={styles.modalContinueText}>Continue & Place Order</Text>
              </TouchableOpacity>
              <Text style={styles.modalNote}>Your choice, always. Calorie goals are here to guide, not restrict.</Text>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: FUEL.sand },
  topBar: { flexDirection: 'row', alignItems: 'center', padding: SPACE.l, gap: SPACE.m, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: FUEL.sandBorder },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: FUEL.sand, alignItems: 'center', justifyContent: 'center' }, // circle
  topTitle: { flex: 1, fontSize: 18, fontFamily: FONT.bodyBold, color: FUEL.ink },
  orderTypeBadge: { backgroundColor: FUEL.proteinTint, paddingHorizontal: SPACE.m, paddingVertical: SPACE.xs, borderRadius: RADIUS.md },
  orderTypeBadgeText: { color: Z_RED, fontSize: 11, fontFamily: FONT.bodyBold, textTransform: 'capitalize' },
  scroll: { padding: SPACE.l },
  section: { fontSize: 16, fontFamily: FONT.bodyBold, color: FUEL.ink, marginBottom: SPACE.s, marginTop: SPACE.xs },
  goalContainer: { marginBottom: SPACE.s },
  goalRow: { flexDirection: 'row', gap: SPACE.s, marginBottom: SPACE.m },
  goalChip: { flex: 1, paddingVertical: SPACE.m, borderRadius: RADIUS.sm, alignItems: 'center', backgroundColor: '#FFF', borderWidth: 1, borderColor: FUEL.sandBorder },
  goalActive: { backgroundColor: Z_RED, borderColor: Z_RED },
  goalText: { fontSize: 12, fontFamily: FONT.bodySemibold, color: FUEL.muted },
  budgetRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.m, marginBottom: SPACE.l },
  budgetLabel: { color: FUEL.muted, fontSize: 13, fontFamily: FONT.bodySemibold },
  budgetInput: { flex: 1, backgroundColor: '#FFF', borderRadius: RADIUS.sm, padding: SPACE.m, color: FUEL.ink, fontSize: 15, borderWidth: 1, borderColor: FUEL.sandBorder },
  
  // Item cards
  itemCard: { backgroundColor: '#FFF', borderRadius: RADIUS.md, padding: SPACE.l, marginBottom: SPACE.m, borderWidth: 1, borderColor: FUEL.sandBorder },
  readyMadeCard: { borderColor: FUEL.sandBorder },
  itemTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: SPACE.m },
  itemHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.s, flex: 1 },
  vegBox: { width: 14, height: 14, borderRadius: RADIUS.xs, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 3 },
  vegDot: { width: 7, height: 7, borderRadius: RADIUS.xs },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, flexWrap: 'wrap' },
  itemName: { fontSize: 15, fontFamily: FONT.bodyBold, color: FUEL.ink },
  typeBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: SPACE.s, paddingVertical: 2, borderRadius: RADIUS.xs },
  fixedBadge: { backgroundColor: FUEL.muted },
  editableBadge: { backgroundColor: GREEN },
  typeText: { fontSize: 9, fontFamily: FONT.bodyBold, color: '#FFF' },
  itemMeta: { fontSize: 11, color: FUEL.muted, marginTop: 2 },
  
  // Single product controls
  modeRow: { flexDirection: 'row', gap: SPACE.s, marginBottom: SPACE.m },
  modeBtn: { paddingHorizontal: SPACE.l, paddingVertical: SPACE.s, borderRadius: RADIUS.xs, backgroundColor: FUEL.sand },
  modeBtnActive: { backgroundColor: FUEL.proteinTint },
  modeText: { fontSize: 12, fontFamily: FONT.bodySemibold, color: FUEL.muted },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, marginBottom: SPACE.m },
  qtyBtn: { width: 36, height: 36, borderRadius: RADIUS.sm, backgroundColor: FUEL.proteinTint, alignItems: 'center', justifyContent: 'center' },
  qtyInput: { flex: 1, backgroundColor: FUEL.sand, borderRadius: RADIUS.sm, padding: SPACE.m, color: FUEL.ink, fontSize: 20, fontFamily: FONT.bodyExtrabold, textAlign: 'center' },
  qtyUnit: { color: FUEL.muted, fontSize: 14, fontFamily: FONT.bodySemibold },
  
  // Conversion feedback row
  conversionRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, backgroundColor: FUEL.limeTint, paddingHorizontal: SPACE.m, paddingVertical: SPACE.s, borderRadius: RADIUS.sm, marginBottom: SPACE.m },
  conversionText: { fontSize: 12, color: FUEL.ink },
  conversionHighlight: { fontFamily: FONT.bodyExtrabold, color: FUEL.ink, fontSize: 14 },
  
  // Ready-made plate controls
  plateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE.m, backgroundColor: '#F7F4EC', padding: SPACE.m, borderRadius: RADIUS.sm },
  plateLabel: { fontSize: 14, fontFamily: FONT.bodyBold, color: PURPLE },
  plateSelector: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s },
  plateBtn: { width: 32, height: 32, borderRadius: RADIUS.sm, backgroundColor: FUEL.limeTint, alignItems: 'center', justifyContent: 'center' },
  plateCount: { fontSize: 22, fontFamily: FONT.bodyExtrabold, color: PURPLE, minWidth: 40, textAlign: 'center' },
  
  // Ingredients breakdown
  ingredientsBox: { backgroundColor: FUEL.sand, borderRadius: RADIUS.sm, padding: SPACE.m, marginBottom: SPACE.m },
  ingredientsTitle: { fontSize: 11, fontFamily: FONT.bodyBold, color: PURPLE, marginBottom: SPACE.s },
  ingredientRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SPACE.s, borderBottomWidth: 1, borderBottomColor: FUEL.sandBorder },
  ingredientName: { fontSize: 13, color: FUEL.ink, flex: 1 },
  ingredientEdit: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  ingEditBtn: { width: 24, height: 24, borderRadius: RADIUS.xs, backgroundColor: FUEL.limeTint, alignItems: 'center', justifyContent: 'center' },
  ingredientGrams: { fontSize: 13, fontFamily: FONT.bodyBold, color: PURPLE, minWidth: 40, textAlign: 'center' },
  ingredientTotal: { fontSize: 11, color: FUEL.muted, marginLeft: SPACE.xs },
  ingredientGramsFixed: { fontSize: 12, color: FUEL.muted },
  
  // Nutrition row
  nutriRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nutriText: { fontSize: 11, color: FUEL.muted },
  priceText: { fontSize: 14, fontFamily: FONT.bodyBold, color: Z_RED },
  
  // AI suggestion
  aiBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.s, backgroundColor: FUEL.ink, borderRadius: RADIUS.md, paddingVertical: SPACE.l, marginTop: SPACE.s },
  aiBtnText: { color: '#FFF', fontSize: 14, fontFamily: FONT.bodyBold },
  aiCard: { backgroundColor: '#FFF', borderRadius: RADIUS.md, padding: SPACE.l, marginTop: SPACE.m, borderWidth: 1, borderColor: FUEL.ink },
  aiTitle: { fontSize: 14, fontFamily: FONT.bodyBold, color: FUEL.ink, marginBottom: SPACE.s },
  aiSummary: { color: FUEL.muted, fontSize: 13, lineHeight: 18, marginBottom: SPACE.m },
  aiSugRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACE.s, borderTopWidth: 1, borderTopColor: FUEL.sandBorder },
  aiSugName: { color: FUEL.ink, fontSize: 13, fontFamily: FONT.bodySemibold },
  aiSugReason: { color: FUEL.muted, fontSize: 11, marginTop: 2 },
  applyBtn: { backgroundColor: FUEL.ink, paddingHorizontal: SPACE.m, paddingVertical: SPACE.s, borderRadius: RADIUS.xs },
  applyText: { color: '#FFF', fontSize: 12, fontFamily: FONT.bodyBold },
  
  // Bottom bar
  bottomBar: { backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: FUEL.sandBorder, padding: SPACE.l, paddingBottom: SPACE.xl, flexDirection: 'row', alignItems: 'center', gap: SPACE.l },
  bottomInfo: { flex: 1 },
  bottomRow: { flexDirection: 'row', alignItems: 'baseline', gap: SPACE.s },
  bottomCal: { fontSize: 14, fontFamily: FONT.bodyBold, color: FUEL.ink },
  bottomMacro: { fontSize: 11, color: FUEL.muted },
  bottomPrice: { fontSize: 20, fontFamily: FONT.bodyExtrabold, color: FUEL.ink },
  extraText: { fontSize: 10, color: FUEL.muted },
  orderBtn: { backgroundColor: Z_RED, borderRadius: RADIUS.md, paddingVertical: SPACE.l, paddingHorizontal: SPACE.xxl, alignItems: 'center' },
  orderBtnText: { color: '#FFF', fontSize: 15, fontFamily: FONT.bodyBold },

  // Calorie Goal Banner
  calorieBanner: { marginHorizontal: 0, paddingHorizontal: SPACE.l, paddingVertical: SPACE.m, borderTopWidth: 1 },
  calorieBannerOk: { backgroundColor: '#F1F7E9', borderTopColor: '#D8ECC0' },
  calorieBannerOver: { backgroundColor: '#F7F4EC', borderTopColor: FUEL.proteinTint },
  calorieBannerLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.s },
  calorieBannerTitle: { fontSize: 13, fontFamily: FONT.bodyBold, color: '#3FA34D' },
  calorieBannerSub: { fontSize: 11, color: FUEL.muted, marginTop: 2 },
  calorieMiniBar: { height: 4, backgroundColor: FUEL.sandBorder, borderRadius: RADIUS.pill, marginTop: SPACE.s, overflow: 'hidden', flexDirection: 'row' },
  calorieMiniBarFill: { height: '100%', backgroundColor: '#3FA34D', borderRadius: RADIUS.xs },
  calorieMiniBarOver: { backgroundColor: FUEL.ink },
  calorieMiniBarExcess: { height: '100%', backgroundColor: '#C0392B', borderRadius: RADIUS.xs },

  // Calorie Warning Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: SPACE.xl },
  modalCard: { backgroundColor: '#FFF', borderRadius: RADIUS.lg, padding: SPACE.xl, width: '100%', maxWidth: 360, alignItems: 'center' },
  modalIconRow: { marginBottom: SPACE.l },
  modalIconBg: { width: 56, height: 56, borderRadius: 28, backgroundColor: FUEL.proteinTint, alignItems: 'center', justifyContent: 'center' }, // circle
  modalTitle: { fontSize: 20, fontFamily: FONT.bodyExtrabold, color: FUEL.ink, marginBottom: SPACE.s },
  modalDesc: { fontSize: 14, color: FUEL.muted, textAlign: 'center', lineHeight: 20, marginBottom: SPACE.l },
  modalHighlight: { fontFamily: FONT.bodyExtrabold, color: FUEL.ink },
  modalBreakdown: { backgroundColor: FUEL.sand, borderRadius: RADIUS.md, padding: SPACE.l, width: '100%', marginBottom: SPACE.xl },
  modalBreakdownRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: SPACE.s },
  modalBreakdownLabel: { fontSize: 13, color: FUEL.muted },
  modalBreakdownVal: { fontSize: 13, fontFamily: FONT.bodySemibold, color: FUEL.ink },
  modalBreakdownTotal: { borderTopWidth: 1, borderTopColor: FUEL.sandBorder, marginTop: SPACE.xs, paddingTop: SPACE.m },
  modalBreakdownTotalLabel: { fontSize: 14, fontFamily: FONT.bodyBold, color: FUEL.ink },
  modalBreakdownTotalVal: { fontSize: 14, fontFamily: FONT.bodyExtrabold, color: FUEL.ink },
  modalAdjustBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, backgroundColor: FUEL.limeTint, borderRadius: RADIUS.md, paddingVertical: SPACE.l, paddingHorizontal: SPACE.xl, width: '100%', justifyContent: 'center', marginBottom: SPACE.m },
  modalAdjustText: { fontSize: 15, fontFamily: FONT.bodyBold, color: FUEL.ink },
  aiAdjustBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, backgroundColor: FUEL.ink, borderRadius: RADIUS.md, paddingVertical: SPACE.l, paddingHorizontal: SPACE.xl, width: '100%', justifyContent: 'center', marginBottom: SPACE.m },
  aiAdjustText: { fontSize: 15, fontFamily: FONT.bodyBold, color: '#FFF' },
  adjustResults: { backgroundColor: '#F1F7E9', borderRadius: RADIUS.md, padding: SPACE.l, width: '100%', marginBottom: SPACE.m, borderWidth: 1, borderColor: '#D8ECC0' },
  adjustTitle: { fontSize: 14, fontFamily: FONT.bodyBold, color: '#3FA34D', marginBottom: SPACE.xs },
  adjustSummary: { fontSize: 12, color: FUEL.muted, marginBottom: SPACE.m },
  adjustRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SPACE.s },
  adjustName: { fontSize: 13, fontFamily: FONT.bodySemibold, color: FUEL.ink },
  adjustChange: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s },
  adjustOld: { fontSize: 12, color: FUEL.muted, textDecorationLine: 'line-through' },
  adjustNew: { fontSize: 13, fontFamily: FONT.bodyBold, color: '#3FA34D' },
  adjustSavings: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, marginTop: SPACE.s, paddingTop: SPACE.s, borderTopWidth: 1, borderTopColor: '#D8ECC0' },
  adjustSavingsText: { fontSize: 13, fontFamily: FONT.bodyBold, color: '#3FA34D' },
  applyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.s, backgroundColor: '#3FA34D', borderRadius: RADIUS.sm, paddingVertical: SPACE.m, marginTop: SPACE.m },
  applyText: { fontSize: 14, fontFamily: FONT.bodyBold, color: '#FFF' },
  recommendedBadge: { backgroundColor: FUEL.ink, paddingHorizontal: SPACE.s, paddingVertical: 2, borderRadius: RADIUS.xs },
  recommendedText: { fontSize: 9, fontFamily: FONT.bodyBold, color: '#FFF' },
  modalContinueBtn: { backgroundColor: FUEL.ink, borderRadius: RADIUS.md, paddingVertical: SPACE.l, paddingHorizontal: SPACE.xl, width: '100%', alignItems: 'center', marginBottom: SPACE.m },
  modalContinueText: { fontSize: 15, fontFamily: FONT.bodyBold, color: '#FFF' },
  modalNote: { fontSize: 11, color: FUEL.muted, textAlign: 'center', fontStyle: 'italic' },

  // Order type selector
  orderTypeRow: { flexDirection: 'row', gap: SPACE.s, marginBottom: SPACE.l },
  deliveryAddrCard: { flexDirection: 'row', alignItems: 'center', gap: SPACE.m, backgroundColor: '#FFF', borderRadius: RADIUS.md, padding: SPACE.l, marginBottom: SPACE.l, borderWidth: 1.5, borderColor: FUEL.proteinTint },
  deliveryAddrLabel: { fontSize: 10, fontFamily: FONT.bodyBold, color: FUEL.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  deliveryAddrText: { fontSize: 13, fontFamily: FONT.bodySemibold, color: FUEL.ink, marginTop: 2 },
  orderTypeChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.s, paddingVertical: SPACE.m, borderRadius: RADIUS.md, backgroundColor: '#FFF', borderWidth: 1.5, borderColor: FUEL.sandBorder },
  orderTypeChipActive: { backgroundColor: Z_RED, borderColor: Z_RED },
  orderTypeChipText: { fontSize: 13, fontFamily: FONT.bodyBold, color: FUEL.muted },

  // Schedule section
  scheduleSection: { backgroundColor: '#FFF', borderRadius: RADIUS.md, padding: SPACE.l, marginBottom: SPACE.l, borderWidth: 1, borderColor: FUEL.sandBorder },
  scheduleToggleRow: { flexDirection: 'row', alignItems: 'center' },
  scheduleLabel: { fontSize: 15, fontFamily: FONT.bodyBold, color: FUEL.ink },
  scheduleHint: { fontSize: 11, color: FUEL.muted, marginTop: 2 },
  scheduleToggle: { width: 50, height: 28, borderRadius: RADIUS.pill, backgroundColor: FUEL.sandBorder, justifyContent: 'center', paddingHorizontal: 3 },
  scheduleToggleActive: { backgroundColor: FUEL.ink },
  scheduleToggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFF' }, // circle
  scheduleToggleThumbActive: { alignSelf: 'flex-end' },
  timePickerContainer: { marginTop: SPACE.l, paddingTop: SPACE.l, borderTopWidth: 1, borderTopColor: FUEL.sandBorder },
  timePickerLabel: { fontSize: 13, fontFamily: FONT.bodySemibold, color: FUEL.muted, marginBottom: SPACE.s },
  timeInputRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  timeInput: { width: 60, height: 48, backgroundColor: FUEL.sand, borderRadius: RADIUS.sm, fontSize: 22, fontFamily: FONT.bodyExtrabold, color: FUEL.ink, textAlign: 'center', borderWidth: 1.5, borderColor: FUEL.sandBorder },
  timeColon: { fontSize: 24, fontFamily: FONT.bodyExtrabold, color: FUEL.ink, marginHorizontal: SPACE.xs },
  alertInfoRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, marginTop: SPACE.m, backgroundColor: FUEL.limeTint, paddingHorizontal: SPACE.m, paddingVertical: SPACE.s, borderRadius: RADIUS.sm },
  alertInfoText: { fontSize: 12, color: FUEL.ink, fontFamily: FONT.bodyMedium, flex: 1 },
  scheduledBadgeBottom: { fontSize: 11, color: FUEL.ink, fontFamily: FONT.bodyBold, marginLeft: SPACE.s },
  orderBtnScheduled: { backgroundColor: FUEL.ink },
});
