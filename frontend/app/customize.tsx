import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { apiCall, getStoredUser } from '../utils/api';

const Z_RED = '#E23744';
const GREEN = '#267E3E';
const PURPLE = '#5B5FE0';

export default function CustomizeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const initialCart = params.cart ? JSON.parse(params.cart as string) : [];
  const orderType = (params.orderType as string) || 'dine-in';

  const [items, setItems] = useState<any[]>(initialCart);
  const [goal, setGoal] = useState('');
  const [budget, setBudget] = useState('');
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
        itemCal = (i.total_calories_per_serving || i.calories_per_100g) * qty;
        itemProtein = (i.total_protein_per_serving || i.protein_per_100g) * qty;
        itemCarbs = (i.total_carbs_per_serving || i.carbs_per_100g) * qty;
        itemFat = (i.total_fat_per_serving || i.fat_per_100g) * qty;
      } else {
        const f = i.grams / 100;
        itemPrice = f * i.cost_per_100g;
        itemCal = f * i.calories_per_100g;
        itemProtein = f * i.protein_per_100g;
        itemCarbs = f * i.carbs_per_100g;
        itemFat = f * i.fat_per_100g;
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
    setOrdering(true);
    try {
      const orderItems = items.filter(i => i.grams > 0 || (i.quantity || 0) > 0).map(i => {
        if (i.product_type === 'ready_made') {
          const qty = i.quantity || 1;
          return {
            product_id: i.id,
            product_name: i.name,
            product_type: 'ready_made',
            quantity: qty,
            grams: (i.serving_grams || 300) * qty,
            price: (i.fixed_price || (i.cost_per_100g * (i.serving_grams || 300) / 100)) * qty,
            calories: (i.total_calories_per_serving || i.calories_per_100g) * qty,
            protein: (i.total_protein_per_serving || i.protein_per_100g) * qty,
            carbs: (i.total_carbs_per_serving || i.carbs_per_100g) * qty,
            fat: (i.total_fat_per_serving || i.fat_per_100g) * qty,
            customized_ingredients: i.customized_ingredients || null
          };
        } else {
          const f = i.grams / 100;
          return {
            product_id: i.id,
            product_name: i.name,
            product_type: 'single',
            grams: i.grams,
            price: f * i.cost_per_100g,
            calories: f * i.calories_per_100g,
            protein: f * i.protein_per_100g,
            carbs: f * i.carbs_per_100g,
            fat: f * i.fat_per_100g
          };
        }
      });
      
      await apiCall('/orders', { 
        method: 'POST', 
        body: { 
          order_type: orderType, 
          items: orderItems, 
          total_price: totals.price, 
          total_calories: totals.calories, 
          total_protein: totals.protein, 
          total_carbs: totals.carbs, 
          total_fat: totals.fat, 
          fitness_goal: goal || null, 
          budget: budget ? parseFloat(budget) : null 
        } 
      });
      Alert.alert('Order Placed!', `Total: ₹${Math.round(totals.price + extra)}`);
      setTimeout(() => router.replace('/(tabs)/orders'), 1500);
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
            <Ionicons name="swap-horizontal" size={14} color="#5B5FE0" />
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
            <Ionicons name="arrow-back" size={20} color="#1C1C2E" />
          </TouchableOpacity>
          <Text style={styles.topTitle}>Customize Meal</Text>
          <View style={styles.orderTypeBadge}><Text style={styles.orderTypeBadgeText}>{orderType}</Text></View>
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.section}>Fitness Goal</Text>
          <View style={styles.goalRow}>
            {['fat_loss', 'muscle_gain', 'maintenance'].map(g => (
              <TouchableOpacity key={g} testID={`customize-goal-${g}`} style={[styles.goalChip, goal === g && styles.goalActive]} onPress={() => setGoal(g)}>
                <Text style={[styles.goalText, goal === g && { color: '#FFF' }]}>{g === 'fat_loss' ? 'Fat Loss' : g === 'muscle_gain' ? 'Muscle Gain' : 'Maintain'}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.budgetRow}>
            <Text style={styles.budgetLabel}>Budget</Text>
            <TextInput testID="budget-input" style={styles.budgetInput} value={budget} onChangeText={setBudget} placeholder="₹ optional" placeholderTextColor="#B0B0B0" keyboardType="number-pad" />
          </View>

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
              <Text style={styles.aiTitle}><Ionicons name="sparkles" size={14} color="#5B5FE0" /> AI Recommendation</Text>
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
              <Ionicons name={isOverGoal ? 'alert-circle' : 'checkmark-circle'} size={18} color={isOverGoal ? '#E23744' : '#267E3E'} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.calorieBannerTitle, isOverGoal && { color: '#E23744' }]}>
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
              {extra > 0 && <Text style={styles.extraText}>incl. ₹{extra} {orderType}</Text>}
            </View>
          </View>
          <TouchableOpacity testID="place-order-btn" style={styles.orderBtn} onPress={handlePlaceOrder} disabled={ordering}>
            {ordering ? <ActivityIndicator color="#FFF" /> : <Text style={styles.orderBtnText}>Place Order</Text>}
          </TouchableOpacity>
        </View>

        {/* Calorie Goal Exceeded Warning Modal */}
        <Modal visible={showCalorieWarning} transparent animationType="fade" testID="calorie-warning-modal">
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalIconRow}>
                <View style={styles.modalIconBg}>
                  <Ionicons name="fitness" size={28} color="#E23744" />
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
                <Ionicons name="create" size={18} color="#5B5FE0" />
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
                    <Ionicons name="trending-down" size={14} color="#267E3E" />
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
  safe: { flex: 1, backgroundColor: '#F8F8F8' },
  topBar: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#EFEFEF' },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center' },
  topTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: '#1C1C2E' },
  orderTypeBadge: { backgroundColor: '#FDE8EA', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  orderTypeBadgeText: { color: Z_RED, fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  scroll: { padding: 16 },
  section: { fontSize: 16, fontWeight: '700', color: '#1C1C2E', marginBottom: 8, marginTop: 4 },
  goalRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  goalChip: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E8E8E8' },
  goalActive: { backgroundColor: Z_RED, borderColor: Z_RED },
  goalText: { fontSize: 12, fontWeight: '600', color: '#696969' },
  budgetRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  budgetLabel: { color: '#696969', fontSize: 13, fontWeight: '600' },
  budgetInput: { flex: 1, backgroundColor: '#FFF', borderRadius: 8, padding: 10, color: '#1C1C2E', fontSize: 15, borderWidth: 1, borderColor: '#E8E8E8' },
  
  // Item cards
  itemCard: { backgroundColor: '#FFF', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#EFEFEF' },
  readyMadeCard: { borderColor: '#E8E0FF' },
  itemTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  itemHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, flex: 1 },
  vegBox: { width: 14, height: 14, borderRadius: 2, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 3 },
  vegDot: { width: 7, height: 7, borderRadius: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  itemName: { fontSize: 15, fontWeight: '700', color: '#1C1C2E' },
  typeBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  fixedBadge: { backgroundColor: '#9C9C9C' },
  editableBadge: { backgroundColor: GREEN },
  typeText: { fontSize: 9, fontWeight: '700', color: '#FFF' },
  itemMeta: { fontSize: 11, color: '#9C9C9C', marginTop: 2 },
  
  // Single product controls
  modeRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  modeBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6, backgroundColor: '#F5F5F5' },
  modeBtnActive: { backgroundColor: '#FDE8EA' },
  modeText: { fontSize: 12, fontWeight: '600', color: '#9C9C9C' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  qtyBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#FDE8EA', alignItems: 'center', justifyContent: 'center' },
  qtyInput: { flex: 1, backgroundColor: '#F5F5F5', borderRadius: 8, padding: 10, color: '#1C1C2E', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  qtyUnit: { color: '#9C9C9C', fontSize: 14, fontWeight: '600' },
  
  // Conversion feedback row
  conversionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F0F0FF', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginBottom: 10 },
  conversionText: { fontSize: 12, color: '#5B5FE0' },
  conversionHighlight: { fontWeight: '800', color: '#1C1C2E', fontSize: 14 },
  
  // Ready-made plate controls
  plateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, backgroundColor: '#F8F5FF', padding: 12, borderRadius: 10 },
  plateLabel: { fontSize: 14, fontWeight: '700', color: PURPLE },
  plateSelector: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  plateBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#F0E8FF', alignItems: 'center', justifyContent: 'center' },
  plateCount: { fontSize: 22, fontWeight: '800', color: PURPLE, minWidth: 40, textAlign: 'center' },
  
  // Ingredients breakdown
  ingredientsBox: { backgroundColor: '#FAFAFA', borderRadius: 8, padding: 10, marginBottom: 10 },
  ingredientsTitle: { fontSize: 11, fontWeight: '700', color: PURPLE, marginBottom: 8 },
  ingredientRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  ingredientName: { fontSize: 13, color: '#1C1C2E', flex: 1 },
  ingredientEdit: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ingEditBtn: { width: 24, height: 24, borderRadius: 6, backgroundColor: '#F0E8FF', alignItems: 'center', justifyContent: 'center' },
  ingredientGrams: { fontSize: 13, fontWeight: '700', color: PURPLE, minWidth: 40, textAlign: 'center' },
  ingredientTotal: { fontSize: 11, color: '#9C9C9C', marginLeft: 4 },
  ingredientGramsFixed: { fontSize: 12, color: '#9C9C9C' },
  
  // Nutrition row
  nutriRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nutriText: { fontSize: 11, color: '#9C9C9C' },
  priceText: { fontSize: 14, fontWeight: '700', color: Z_RED },
  
  // AI suggestion
  aiBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#5B5FE0', borderRadius: 12, paddingVertical: 14, marginTop: 8 },
  aiBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  aiCard: { backgroundColor: '#FFF', borderRadius: 12, padding: 14, marginTop: 12, borderWidth: 1, borderColor: '#5B5FE0' },
  aiTitle: { fontSize: 14, fontWeight: '700', color: '#5B5FE0', marginBottom: 6 },
  aiSummary: { color: '#696969', fontSize: 13, lineHeight: 18, marginBottom: 10 },
  aiSugRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#EFEFEF' },
  aiSugName: { color: '#1C1C2E', fontSize: 13, fontWeight: '600' },
  aiSugReason: { color: '#9C9C9C', fontSize: 11, marginTop: 2 },
  applyBtn: { backgroundColor: '#5B5FE0', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  applyText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  
  // Bottom bar
  bottomBar: { backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#EFEFEF', padding: 16, paddingBottom: 24, flexDirection: 'row', alignItems: 'center', gap: 14 },
  bottomInfo: { flex: 1 },
  bottomRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  bottomCal: { fontSize: 14, fontWeight: '700', color: '#1C1C2E' },
  bottomMacro: { fontSize: 11, color: '#9C9C9C' },
  bottomPrice: { fontSize: 20, fontWeight: '800', color: '#1C1C2E' },
  extraText: { fontSize: 10, color: '#9C9C9C' },
  orderBtn: { backgroundColor: Z_RED, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28, alignItems: 'center' },
  orderBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },

  // Calorie Goal Banner
  calorieBanner: { marginHorizontal: 0, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1 },
  calorieBannerOk: { backgroundColor: '#F0FFF4', borderTopColor: '#C6F6D5' },
  calorieBannerOver: { backgroundColor: '#FFF5F5', borderTopColor: '#FED7D7' },
  calorieBannerLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  calorieBannerTitle: { fontSize: 13, fontWeight: '700', color: '#267E3E' },
  calorieBannerSub: { fontSize: 11, color: '#696969', marginTop: 2 },
  calorieMiniBar: { height: 4, backgroundColor: '#E8E8E8', borderRadius: 2, marginTop: 8, overflow: 'hidden', flexDirection: 'row' },
  calorieMiniBarFill: { height: '100%', backgroundColor: '#267E3E', borderRadius: 2 },
  calorieMiniBarOver: { backgroundColor: '#E23744' },
  calorieMiniBarExcess: { height: '100%', backgroundColor: '#FF6B6B', borderRadius: 2 },

  // Calorie Warning Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 24, width: '100%', maxWidth: 360, alignItems: 'center' },
  modalIconRow: { marginBottom: 16 },
  modalIconBg: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FDE8EA', alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#1C1C2E', marginBottom: 8 },
  modalDesc: { fontSize: 14, color: '#696969', textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  modalHighlight: { fontWeight: '800', color: '#E23744' },
  modalBreakdown: { backgroundColor: '#FAFAFA', borderRadius: 12, padding: 14, width: '100%', marginBottom: 20 },
  modalBreakdownRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  modalBreakdownLabel: { fontSize: 13, color: '#696969' },
  modalBreakdownVal: { fontSize: 13, fontWeight: '600', color: '#1C1C2E' },
  modalBreakdownTotal: { borderTopWidth: 1, borderTopColor: '#E8E8E8', marginTop: 4, paddingTop: 10 },
  modalBreakdownTotalLabel: { fontSize: 14, fontWeight: '700', color: '#1C1C2E' },
  modalBreakdownTotalVal: { fontSize: 14, fontWeight: '800', color: '#E23744' },
  modalAdjustBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F0F0FF', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20, width: '100%', justifyContent: 'center', marginBottom: 10 },
  modalAdjustText: { fontSize: 15, fontWeight: '700', color: '#5B5FE0' },
  aiAdjustBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#5B5FE0', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20, width: '100%', justifyContent: 'center', marginBottom: 10 },
  aiAdjustText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  adjustResults: { backgroundColor: '#F0FFF4', borderRadius: 12, padding: 14, width: '100%', marginBottom: 10, borderWidth: 1, borderColor: '#C6F6D5' },
  adjustTitle: { fontSize: 14, fontWeight: '700', color: '#267E3E', marginBottom: 4 },
  adjustSummary: { fontSize: 12, color: '#696969', marginBottom: 10 },
  adjustRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  adjustName: { fontSize: 13, fontWeight: '600', color: '#1C1C2E' },
  adjustChange: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  adjustOld: { fontSize: 12, color: '#9C9C9C', textDecorationLine: 'line-through' },
  adjustNew: { fontSize: 13, fontWeight: '700', color: '#267E3E' },
  adjustSavings: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#C6F6D5' },
  adjustSavingsText: { fontSize: 13, fontWeight: '700', color: '#267E3E' },
  applyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#267E3E', borderRadius: 10, paddingVertical: 12, marginTop: 10 },
  applyText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  recommendedBadge: { backgroundColor: '#5B5FE0', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  recommendedText: { fontSize: 9, fontWeight: '700', color: '#FFF' },
  modalContinueBtn: { backgroundColor: '#1C1C2E', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20, width: '100%', alignItems: 'center', marginBottom: 12 },
  modalContinueText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  modalNote: { fontSize: 11, color: '#B0B0B0', textAlign: 'center', fontStyle: 'italic' },
});
