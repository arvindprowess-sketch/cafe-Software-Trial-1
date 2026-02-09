import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Image, ActivityIndicator, Alert, Dimensions, Animated
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiCall, getStoredUser } from '../../utils/api';

const Z_RED = '#D62300';
const GREEN = '#509E2F';
const PURPLE = '#FF8732';
const { width } = Dimensions.get('window');

export default function BudgetMealScreen() {
  const router = useRouter();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [budget, setBudget] = useState('200');
  const [goal, setGoal] = useState('maintenance');
  const [dietPref, setDietPref] = useState('both');
  const [cart, setCart] = useState<any[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);
  const [orderType, setOrderType] = useState('dine-in');
  const [userGoals, setUserGoals] = useState<any>({ daily_calories: 2000 });
  const [consumedToday, setConsumedToday] = useState(0);
  const [userOrderHistory, setUserOrderHistory] = useState<any[]>([]);

  useEffect(() => {
    loadProducts();
    loadCalorieContext();
    loadUserOrderHistory();
  }, []);

  const loadCalorieContext = async () => {
    try {
      const [user, summary] = await Promise.all([
        apiCall('/auth/me').catch(() => null),
        apiCall('/user/nutrition-summary').catch(() => null),
      ]);
      if (user) setUserGoals({ daily_calories: user.daily_calories || 2000 });
      if (summary?.consumed) setConsumedToday(summary.consumed.calories || 0);
    } catch {}
  };

  const loadUserOrderHistory = async () => {
    try {
      const orders = await apiCall('/orders').catch(() => []);
      // Extract product IDs from all orders and count frequency
      const productFrequency: { [key: string]: number } = {};
      orders.forEach((order: any) => {
        order.items?.forEach((item: any) => {
          const productId = item.product_id;
          if (productId) {
            productFrequency[productId] = (productFrequency[productId] || 0) + 1;
          }
        });
      });
      setUserOrderHistory(Object.entries(productFrequency).map(([id, count]) => ({ id, count })));
    } catch {}
  };

  const loadProducts = async () => {
    try {
      const data = await apiCall('/products');
      setProducts(data.filter((p: any) => p.available_qty_grams > 0));
    } catch (e) {} finally { setLoading(false); }
  };

  // Filter products: only single products (no ready-made meals), filtered by diet
  // Sort by: New Arrivals first, then Frequently Ordered, then rest
  const filteredProducts = useMemo(() => {
    const filtered = products.filter(p => {
      // Exclude ready-made meals - only show single products
      if (p.product_type === 'ready_made') return false;
      
      // Diet filter
      if (dietPref === 'both') return true;
      return p.diet_type === dietPref;
    });

    // Sort products by priority
    return filtered.sort((a, b) => {
      // Priority 1: New Arrivals (created in last 7 days)
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      const aIsNew = a.created_at && new Date(a.created_at).getTime() > sevenDaysAgo;
      const bIsNew = b.created_at && new Date(b.created_at).getTime() > sevenDaysAgo;
      if (aIsNew && !bIsNew) return -1;
      if (!aIsNew && bIsNew) return 1;

      // Priority 2: Frequently ordered by user
      const aFreq = userOrderHistory.find(h => h.id === a.id)?.count || 0;
      const bFreq = userOrderHistory.find(h => h.id === b.id)?.count || 0;
      if (aFreq !== bFreq) return bFreq - aFreq;

      // Priority 3: Alphabetical
      return a.name.localeCompare(b.name);
    });
  }, [products, dietPref, userOrderHistory]);

  // Calculate cart totals
  const totals = useMemo(() => {
    return cart.reduce((a, i) => {
      const f = i.grams / 100;
      return {
        price: a.price + f * i.cost_per_100g,
        calories: a.calories + f * i.calories_per_100g,
        protein: a.protein + f * i.protein_per_100g,
        carbs: a.carbs + f * i.carbs_per_100g,
        fat: a.fat + f * i.fat_per_100g,
      };
    }, { price: 0, calories: 0, protein: 0, carbs: 0, fat: 0 });
  }, [cart]);

  const budgetNum = parseFloat(budget) || 0;
  const remaining = budgetNum - totals.price;
  const budgetUsedPercent = budgetNum > 0 ? Math.min((totals.price / budgetNum) * 100, 100) : 0;

  // Add/update item in cart
  const updateItem = (product: any, grams: number) => {
    const exists = cart.find(c => c.id === product.id);
    if (grams <= 0) {
      setCart(cart.filter(c => c.id !== product.id));
    } else if (exists) {
      setCart(cart.map(c => c.id === product.id ? { ...c, grams } : c));
    } else {
      setCart([...cart, { ...product, grams }]);
    }
  };

  // Quick add by price
  const addByPrice = (product: any, priceToAdd: number) => {
    const gramsToAdd = Math.round((priceToAdd / product.cost_per_100g) * 100);
    const exists = cart.find(c => c.id === product.id);
    const currentGrams = exists?.grams || 0;
    updateItem(product, currentGrams + gramsToAdd);
  };

  // Get AI suggestions for remaining budget
  const getAiSuggestions = async () => {
    if (remaining <= 10) {
      Alert.alert('Budget Full', 'You\'ve used most of your budget!');
      return;
    }
    setAiLoading(true);
    try {
      const result = await apiCall('/ai/quick-meal', {
        method: 'POST',
        body: {
          diet_preference: dietPref,
          goal: goal,
          budget: remaining,
          order_type: orderType,
        },
      });
      if (result.meal_items?.length > 0) {
        setAiSuggestions(result.meal_items);
      } else {
        Alert.alert('No suggestions', result.summary || 'Try adjusting your budget');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setAiLoading(false); }
  };

  // Add AI suggestion to cart
  const addSuggestion = (item: any) => {
    const product = products.find(p => p.id === item.product_id);
    if (product) {
      updateItem(product, item.grams);
      setAiSuggestions(aiSuggestions.filter(s => s.product_id !== item.product_id));
    }
  };

  // Proceed to checkout
  const proceedToCheckout = () => {
    if (cart.length === 0) {
      Alert.alert('Empty Cart', 'Add some items first!');
      return;
    }
    router.push({
      pathname: '/customize',
      params: { cart: JSON.stringify(cart), orderType }
    });
  };

  // What can fit in remaining budget
  const fitsInBudget = useMemo(() => {
    return filteredProducts
      .filter(p => !cart.find(c => c.id === p.id)) // Not already in cart
      .map(p => ({
        ...p,
        maxGrams: Math.floor((remaining / p.cost_per_100g) * 100),
        suggestedGrams: Math.min(100, Math.floor((remaining / p.cost_per_100g) * 100)),
      }))
      .filter(p => p.maxGrams >= 25) // At least 25g purchasable
      .sort((a, b) => {
        // Sort by protein per rupee (best value first)
        const aValue = (a.protein_per_100g / a.cost_per_100g);
        const bValue = (b.protein_per_100g / b.cost_per_100g);
        return bValue - aValue;
      })
      .slice(0, 5);
  }, [filteredProducts, cart, remaining]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Z_RED} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Budget Meal Builder</Text>
          <Text style={styles.subtitle}>Build your perfect meal within budget</Text>
        </View>
        <TouchableOpacity style={styles.aiHelpBtn} onPress={getAiSuggestions} disabled={aiLoading}>
          {aiLoading ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <Ionicons name="sparkles" size={20} color="#FFF" />
              <Text style={styles.aiHelpText}>Smart Fill</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Budget Input Section */}
      <View style={styles.budgetSection}>
        <View style={styles.budgetInputRow}>
          <Text style={styles.budgetLabel}>My Budget</Text>
          <View style={styles.budgetInputBox}>
            <Text style={styles.rupeeSign}>₹</Text>
            <TextInput
              style={styles.budgetInput}
              value={budget}
              onChangeText={setBudget}
              keyboardType="number-pad"
              placeholder="200"
              placeholderTextColor="#B0B0B0"
            />
          </View>
        </View>
        
        {/* Quick Budget Presets */}
        <View style={styles.presetsRow}>
          {[100, 150, 200, 250, 300, 400].map(amount => (
            <TouchableOpacity
              key={amount}
              style={[styles.presetBtn, budget === String(amount) && styles.presetBtnActive]}
              onPress={() => setBudget(String(amount))}
            >
              <Text style={[styles.presetText, budget === String(amount) && styles.presetTextActive]}>
                ₹{amount}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        
        {/* Budget Progress Bar */}
        <View style={styles.budgetProgress}>
          <View style={styles.progressBar}>
            <View style={[
              styles.progressFill, 
              { width: `${budgetUsedPercent}%` },
              budgetUsedPercent > 90 && styles.progressFillFull
            ]} />
          </View>
          <View style={styles.budgetStats}>
            <Text style={styles.budgetSpent}>₹{Math.round(totals.price)} spent</Text>
            <Text style={[styles.budgetRemaining, remaining < 20 && { color: Z_RED }]}>
              ₹{Math.round(Math.max(0, remaining))} left
            </Text>
          </View>
        </View>

        {/* Savings Indicator */}
        {cart.length > 0 && (() => {
          const fullPrice = cart.reduce((sum, item) => {
            const factor = item.grams / 100;
            return sum + (factor * item.cost_per_100g * 1.15); // Assume 15% markup if buying separately
          }, 0);
          const savings = fullPrice - totals.price;
          const savingsPercent = ((savings / fullPrice) * 100).toFixed(0);
          return savings > 5 ? (
            <View style={styles.savingsCard}>
              <Ionicons name="pricetag" size={16} color={GREEN} />
              <Text style={styles.savingsText}>
                You're saving ₹{Math.round(savings)} ({savingsPercent}%) with smart choices! 🎉
              </Text>
            </View>
          ) : null;
        })()}
      </View>

      {/* Quick Filters */}
      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {/* Diet Preference */}
          {[
            { key: 'both', label: 'All', icon: 'apps' },
            { key: 'veg', label: 'Veg', color: GREEN },
            { key: 'non-veg', label: 'Non-Veg', color: Z_RED },
          ].map(d => (
            <TouchableOpacity
              key={d.key}
              style={[styles.filterChip, dietPref === d.key && { backgroundColor: d.color || '#502314', borderColor: d.color || '#502314' }]}
              onPress={() => setDietPref(d.key)}
            >
              {d.icon ? (
                <Ionicons name={d.icon as any} size={14} color={dietPref === d.key ? '#FFF' : '#8B6F61'} />
              ) : (
                <View style={[styles.vegDotSmall, { backgroundColor: d.color }]} />
              )}
              <Text style={[styles.filterText, dietPref === d.key && { color: '#FFF' }]}>{d.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Your Cart Section */}
        {cart.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Meal ({cart.length} items)</Text>
            {cart.map(item => {
              const f = item.grams / 100;
              const itemPrice = f * item.cost_per_100g;
              return (
                <View key={item.id} style={styles.cartItem}>
                  <View style={styles.cartItemLeft}>
                    <View style={[styles.vegIndicator, { borderColor: item.diet_type === 'non-veg' ? Z_RED : GREEN }]}>
                      <View style={[styles.vegDot, { backgroundColor: item.diet_type === 'non-veg' ? Z_RED : GREEN }]} />
                    </View>
                    <View style={styles.cartItemInfo}>
                      <Text style={styles.cartItemName}>{item.name}</Text>
                      <Text style={styles.cartItemMacros}>
                        {Math.round(f * item.calories_per_100g)} cal • P:{Math.round(f * item.protein_per_100g)}g
                      </Text>
                    </View>
                  </View>
                  
                  {/* Grams/Price Control */}
                  <View style={styles.cartItemRight}>
                    <View style={styles.gramsControl}>
                      <TouchableOpacity 
                        style={styles.gramsBtn}
                        onPress={() => updateItem(item, item.grams - 25)}
                      >
                        <Ionicons name="remove" size={16} color={Z_RED} />
                      </TouchableOpacity>
                      <View style={styles.gramsDisplay}>
                        <Text style={styles.gramsText}>{item.grams}g</Text>
                        <Text style={styles.priceText}>₹{Math.round(itemPrice)}</Text>
                      </View>
                      <TouchableOpacity 
                        style={[styles.gramsBtn, styles.gramsBtnPlus]}
                        onPress={() => updateItem(item, item.grams + 25)}
                      >
                        <Ionicons name="add" size={16} color="#FFF" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })}
            
            {/* Cart Nutrition Summary */}
            <View style={styles.cartSummary}>
              <View style={styles.macroRow}>
                <View style={styles.macroItem}>
                  <Text style={styles.macroValue}>{Math.round(totals.calories)}</Text>
                  <Text style={styles.macroLabel}>Calories</Text>
                </View>
                <View style={styles.macroItem}>
                  <Text style={[styles.macroValue, { color: Z_RED }]}>{Math.round(totals.protein)}g</Text>
                  <Text style={styles.macroLabel}>Protein</Text>
                </View>
                <View style={styles.macroItem}>
                  <Text style={[styles.macroValue, { color: '#FF9F0A' }]}>{Math.round(totals.carbs)}g</Text>
                  <Text style={styles.macroLabel}>Carbs</Text>
                </View>
                <View style={styles.macroItem}>
                  <Text style={[styles.macroValue, { color: PURPLE }]}>{Math.round(totals.fat)}g</Text>
                  <Text style={styles.macroLabel}>Fat</Text>
                </View>
              </View>

              {/* Interactive Macro Balance Indicator */}
              <View style={styles.macroBalanceSection}>
                <Text style={styles.macroBalanceTitle}>Macro Balance</Text>
                <View style={styles.macroBarContainer}>
                  {(() => {
                    const totalMacros = totals.protein + totals.carbs + totals.fat;
                    const proteinPct = totalMacros > 0 ? (totals.protein / totalMacros) * 100 : 0;
                    const carbsPct = totalMacros > 0 ? (totals.carbs / totalMacros) * 100 : 0;
                    const fatPct = totalMacros > 0 ? (totals.fat / totalMacros) * 100 : 0;
                    return (
                      <>
                        <View style={styles.macroBar}>
                          <View style={[styles.macroBarSegment, { width: `${proteinPct}%`, backgroundColor: Z_RED }]} />
                          <View style={[styles.macroBarSegment, { width: `${carbsPct}%`, backgroundColor: '#FF9F0A' }]} />
                          <View style={[styles.macroBarSegment, { width: `${fatPct}%`, backgroundColor: PURPLE }]} />
                        </View>
                        <View style={styles.macroLegend}>
                          <View style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: Z_RED }]} />
                            <Text style={styles.legendText}>P: {proteinPct.toFixed(0)}%</Text>
                          </View>
                          <View style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: '#FF9F0A' }]} />
                            <Text style={styles.legendText}>C: {carbsPct.toFixed(0)}%</Text>
                          </View>
                          <View style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: PURPLE }]} />
                            <Text style={styles.legendText}>F: {fatPct.toFixed(0)}%</Text>
                          </View>
                        </View>
                      </>
                    );
                  })()}
                </View>
              </View>

              {/* Calorie Goal Context */}
              {(() => {
                const projected = consumedToday + totals.calories;
                const dailyCal = userGoals.daily_calories;
                const isOver = projected > dailyCal;
                const overBy = Math.round(projected - dailyCal);
                return (
                  <View style={[styles.calorieGoalRow, isOver && styles.calorieGoalRowOver]} testID="budget-calorie-goal">
                    <Ionicons name={isOver ? 'alert-circle' : 'checkmark-circle'} size={14} color={isOver ? Z_RED : GREEN} />
                    <Text style={[styles.calorieGoalText, isOver && { color: Z_RED }]}>
                      {isOver 
                        ? `${overBy} cal over daily goal (${dailyCal})` 
                        : `${Math.round(dailyCal - projected)} cal remaining today`}
                    </Text>
                  </View>
                );
              })()}
            </View>
          </View>
        )}

        {/* AI Suggestions */}
        {aiSuggestions.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="sparkles" size={16} color={PURPLE} />
              <Text style={styles.sectionTitle}>AI Suggestions</Text>
              <TouchableOpacity onPress={() => setAiSuggestions([])}>
                <Ionicons name="close-circle" size={20} color="#D0D0D0" />
              </TouchableOpacity>
            </View>
            {aiSuggestions.map((item, i) => (
              <TouchableOpacity 
                key={i} 
                style={styles.suggestionItem}
                onPress={() => addSuggestion(item)}
              >
                <View style={styles.suggestionLeft}>
                  <View style={[styles.vegIndicator, { borderColor: item.diet_type === 'non-veg' ? Z_RED : GREEN }]}>
                    <View style={[styles.vegDot, { backgroundColor: item.diet_type === 'non-veg' ? Z_RED : GREEN }]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.suggestionName} numberOfLines={1}>{item.product_name}</Text>
                    <Text style={styles.suggestionReason} numberOfLines={2}>{item.reason}</Text>
                  </View>
                </View>
                <View style={styles.suggestionRight}>
                  <View style={styles.suggestionGramsBox}>
                    <Text style={styles.suggestionGrams}>{item.grams}g</Text>
                    <Text style={styles.suggestionPrice}>₹{Math.round(item.price)}</Text>
                  </View>
                  <Ionicons name="add-circle" size={24} color={PURPLE} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* What Fits in Your Budget */}
        {remaining > 10 && fitsInBudget.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Fits in ₹{Math.round(remaining)}</Text>
            <Text style={styles.sectionSubtitle}>Quick add with one tap</Text>
            
            <View style={styles.quickAddGrid}>
              {fitsInBudget.map(product => (
                <TouchableOpacity 
                  key={product.id}
                  style={styles.quickAddCard}
                  onPress={() => addByPrice(product, Math.min(remaining, product.cost_per_100g))}
                >
                  {product.image_url ? (
                    <Image source={{ uri: product.image_url }} style={styles.quickAddImg} />
                  ) : (
                    <View style={[styles.quickAddImg, styles.imgPlaceholder]}>
                      <Ionicons name="restaurant" size={20} color="#D0D0D0" />
                    </View>
                  )}
                  <View style={[styles.vegBadge, { borderColor: product.diet_type === 'non-veg' ? Z_RED : GREEN }]}>
                    <View style={[styles.vegDotTiny, { backgroundColor: product.diet_type === 'non-veg' ? Z_RED : GREEN }]} />
                  </View>
                  <View style={styles.quickAddInfo}>
                    <Text style={styles.quickAddName} numberOfLines={1}>{product.name}</Text>
                    <Text style={styles.quickAddMacro}>P:{product.protein_per_100g}g/100g</Text>
                    <View style={styles.quickAddAction}>
                      <Text style={styles.quickAddGrams}>+{product.suggestedGrams}g</Text>
                      <Text style={styles.quickAddPrice}>₹{Math.round(product.suggestedGrams / 100 * product.cost_per_100g)}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* All Products */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>All Items</Text>
          {filteredProducts.map((product, index) => {
            const inCart = cart.find(c => c.id === product.id);
            
            // Check if this is the first item in a category
            const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
            const isNew = product.created_at && new Date(product.created_at).getTime() > sevenDaysAgo;
            const orderCount = userOrderHistory.find(h => h.id === product.id)?.count || 0;
            
            // Show section headers
            const prevProduct = index > 0 ? filteredProducts[index - 1] : null;
            const prevIsNew = prevProduct?.created_at && new Date(prevProduct.created_at).getTime() > sevenDaysAgo;
            const prevOrderCount = prevProduct ? (userOrderHistory.find(h => h.id === prevProduct.id)?.count || 0) : 0;
            
            let sectionHeader = null;
            if (index === 0 && isNew) {
              sectionHeader = (
                <View style={styles.subSectionHeader}>
                  <Ionicons name="sparkles" size={14} color={PURPLE} />
                  <Text style={styles.subSectionTitle}>New Arrivals</Text>
                </View>
              );
            } else if (prevIsNew && !isNew && orderCount > 0) {
              sectionHeader = (
                <View style={styles.subSectionHeader}>
                  <Ionicons name="heart" size={14} color={Z_RED} />
                  <Text style={styles.subSectionTitle}>Your Favorites</Text>
                </View>
              );
            } else if ((prevIsNew || prevOrderCount > 0) && !isNew && orderCount === 0) {
              sectionHeader = (
                <View style={styles.subSectionHeader}>
                  <Ionicons name="list" size={14} color="#8B6F61" />
                  <Text style={styles.subSectionTitle}>All Products</Text>
                </View>
              );
            }
            
            return (
              <React.Fragment key={product.id}>
                {sectionHeader}
                <View style={styles.productRow}>
                  <View style={styles.productLeft}>
                    <View style={[styles.vegIndicator, { borderColor: product.diet_type === 'non-veg' ? Z_RED : GREEN }]}>
                      <View style={[styles.vegDot, { backgroundColor: product.diet_type === 'non-veg' ? Z_RED : GREEN }]} />
                    </View>
                    <View style={styles.productInfo}>
                      <View style={styles.productNameRow}>
                        <Text style={styles.productName}>{product.name}</Text>
                        {isNew && <View style={styles.newBadge}><Text style={styles.newBadgeText}>NEW</Text></View>}
                        {orderCount > 0 && !isNew && <Ionicons name="heart" size={12} color={Z_RED} style={{ marginLeft: 4 }} />}
                      </View>
                      <Text style={styles.productMeta}>₹{product.cost_per_100g}/100g • {product.calories_per_100g} cal</Text>
                    </View>
                  </View>
                  
                  {inCart ? (
                    <View style={styles.inCartBadge}>
                      <Text style={styles.inCartText}>{inCart.grams}g added</Text>
                    </View>
                  ) : (
                    <View style={styles.addOptions}>
                      {[50, 100].map(g => {
                        const price = (g / 100) * product.cost_per_100g;
                        const canAfford = price <= remaining;
                        return (
                          <TouchableOpacity
                            key={g}
                            style={[styles.addOptionBtn, !canAfford && styles.addOptionDisabled]}
                            onPress={() => canAfford && updateItem(product, g)}
                            disabled={!canAfford}
                          >
                            <Text style={[styles.addOptionGrams, !canAfford && { color: '#B0B0B0' }]}>+{g}g</Text>
                            <Text style={[styles.addOptionPrice, !canAfford && { color: '#B0B0B0' }]}>₹{Math.round(price)}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              </React.Fragment>
            );
          })}
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Bottom Bar */}
      <View style={styles.bottomBar}>
        <View style={styles.bottomLeft}>
          <Text style={styles.bottomTotal}>₹{Math.round(totals.price)}</Text>
          <Text style={styles.bottomItems}>{cart.length} items • {Math.round(totals.calories)} cal</Text>
        </View>
        <TouchableOpacity 
          style={[styles.checkoutBtn, cart.length === 0 && styles.checkoutBtnDisabled]}
          onPress={proceedToCheckout}
          disabled={cart.length === 0}
        >
          <Text style={styles.checkoutText}>Review Order</Text>
          <Ionicons name="arrow-forward" size={18} color="#FFF" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5EBDC' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  title: { fontSize: 22, fontWeight: '800', color: '#502314' },
  subtitle: { fontSize: 12, color: '#8B6F61', marginTop: 2 },
  aiHelpBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, backgroundColor: PURPLE, paddingHorizontal: 12, paddingVertical: 10 },
  aiHelpText: { fontSize: 11, fontWeight: '700', color: '#FFF', textTransform: 'uppercase' },
  
  // Budget Section
  budgetSection: { backgroundColor: '#FFF', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#E8DDD4' },
  budgetInputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  budgetLabel: { fontSize: 16, fontWeight: '700', color: '#502314' },
  budgetInputBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5EBDC', borderRadius: 12, paddingHorizontal: 14, borderWidth: 2, borderColor: Z_RED },
  rupeeSign: { fontSize: 20, fontWeight: '800', color: Z_RED },
  budgetInput: { fontSize: 24, fontWeight: '800', color: '#502314', minWidth: 80, textAlign: 'center', paddingVertical: 8 },
  presetsRow: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  presetBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F5EBDC', borderWidth: 1, borderColor: '#E8DDD4' },
  presetBtnActive: { backgroundColor: Z_RED, borderColor: Z_RED },
  presetText: { fontSize: 12, fontWeight: '700', color: '#8B6F61' },
  presetTextActive: { color: '#FFF' },
  budgetProgress: { },
  progressBar: { height: 8, backgroundColor: '#E8DDD4', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: GREEN, borderRadius: 4 },
  progressFillFull: { backgroundColor: Z_RED },
  budgetStats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  budgetSpent: { fontSize: 12, color: '#8B6F61' },
  budgetRemaining: { fontSize: 14, fontWeight: '700', color: GREEN },
  savingsCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E8F5E1', borderRadius: 10, padding: 10, marginTop: 10 },
  savingsText: { fontSize: 12, fontWeight: '600', color: GREEN, flex: 1 },
  
  // Filters
  filterRow: { backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E8DDD4' },
  filterScroll: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F5EBDC', borderWidth: 1, borderColor: '#E8E8E8' },
  filterChipActive: { backgroundColor: Z_RED, borderColor: Z_RED },
  filterText: { fontSize: 12, fontWeight: '600', color: '#8B6F61' },
  filterDivider: { width: 1, height: 24, backgroundColor: '#E8E8E8', marginHorizontal: 4 },
  vegDotSmall: { width: 10, height: 10, borderRadius: 5 },
  
  // Scroll
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  
  // Section
  section: { marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#502314', flex: 1 },
  sectionSubtitle: { fontSize: 12, color: '#8B6F61', marginTop: -8, marginBottom: 10 },
  
  // Cart Item
  cartItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFF', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#E8DDD4' },
  cartItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  cartItemInfo: { flex: 1 },
  cartItemName: { fontSize: 14, fontWeight: '700', color: '#502314' },
  cartItemMacros: { fontSize: 11, color: '#8B6F61', marginTop: 2 },
  cartItemRight: { },
  gramsControl: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  gramsBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#FDE8E4', alignItems: 'center', justifyContent: 'center' },
  gramsBtnPlus: { backgroundColor: Z_RED },
  gramsDisplay: { alignItems: 'center', minWidth: 50 },
  gramsText: { fontSize: 15, fontWeight: '800', color: '#502314' },
  priceText: { fontSize: 11, color: Z_RED, fontWeight: '600' },
  
  // Cart Summary
  cartSummary: { backgroundColor: '#FAFAFA', borderRadius: 10, padding: 12, marginTop: 8 },
  macroRow: { flexDirection: 'row', justifyContent: 'space-around' },
  macroItem: { alignItems: 'center' },
  macroValue: { fontSize: 18, fontWeight: '800', color: '#502314' },
  macroLabel: { fontSize: 10, color: '#8B6F61', marginTop: 2 },
  macroBalanceSection: { marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#E8DDD4' },
  macroBalanceTitle: { fontSize: 11, fontWeight: '700', color: '#8B6F61', marginBottom: 8, textTransform: 'uppercase' },
  macroBarContainer: { },
  macroBar: { height: 10, backgroundColor: '#E8DDD4', borderRadius: 5, flexDirection: 'row', overflow: 'hidden' },
  macroBarSegment: { height: '100%' },
  macroLegend: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 10, color: '#8B6F61', fontWeight: '600' },
  
  // Calorie Goal Context
  calorieGoalRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, backgroundColor: '#F0FFF4', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  calorieGoalRowOver: { backgroundColor: '#FFF5F5' },
  calorieGoalText: { fontSize: 12, fontWeight: '600', color: GREEN, flex: 1 },
  
  // Veg indicator
  vegIndicator: { width: 16, height: 16, borderRadius: 3, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  vegDot: { width: 8, height: 8, borderRadius: 4 },
  vegBadge: { position: 'absolute', top: 6, left: 6, width: 14, height: 14, borderRadius: 2, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  vegDotTiny: { width: 6, height: 6, borderRadius: 3 },
  
  // AI Suggestions
  suggestionItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F8F5FF', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#E8E0FF', gap: 10 },
  suggestionLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1, flexShrink: 1 },
  suggestionName: { fontSize: 14, fontWeight: '700', color: '#502314' },
  suggestionReason: { fontSize: 11, color: PURPLE, marginTop: 2, lineHeight: 15 },
  suggestionRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  suggestionGramsBox: { alignItems: 'flex-end' },
  suggestionGrams: { fontSize: 14, fontWeight: '700', color: '#502314' },
  suggestionPrice: { fontSize: 11, color: '#8B6F61', marginTop: 1 },
  
  // Quick Add Grid
  quickAddGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickAddCard: { width: (width - 42) / 2, backgroundColor: '#FFF', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#E8DDD4' },
  quickAddImg: { width: '100%', height: 80, backgroundColor: '#F5EBDC' },
  imgPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  quickAddInfo: { padding: 10 },
  quickAddName: { fontSize: 13, fontWeight: '700', color: '#502314' },
  quickAddMacro: { fontSize: 10, color: '#8B6F61', marginTop: 2 },
  quickAddAction: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, backgroundColor: '#FDE8E4', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5 },
  quickAddGrams: { fontSize: 12, fontWeight: '700', color: Z_RED },
  quickAddPrice: { fontSize: 12, fontWeight: '600', color: '#8B6F61' },
  
  // Product Row
  productRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFF', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#E8DDD4' },
  productLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  productInfo: { flex: 1 },
  productNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  productName: { fontSize: 14, fontWeight: '600', color: '#502314' },
  productMeta: { fontSize: 11, color: '#8B6F61', marginTop: 2 },
  newBadge: { backgroundColor: PURPLE, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  newBadgeText: { fontSize: 9, fontWeight: '800', color: '#FFF', letterSpacing: 0.5 },
  subSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, marginBottom: 8 },
  subSectionTitle: { fontSize: 13, fontWeight: '700', color: '#502314' },
  addOptions: { flexDirection: 'row', gap: 6 },
  addOptionBtn: { backgroundColor: '#FDE8E4', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center' },
  addOptionDisabled: { backgroundColor: '#F5EBDC' },
  addOptionGrams: { fontSize: 12, fontWeight: '700', color: Z_RED },
  addOptionPrice: { fontSize: 10, color: '#8B6F61' },
  inCartBadge: { backgroundColor: GREEN, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  inCartText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  
  // Bottom Bar
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E8DDD4', padding: 16, paddingBottom: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bottomLeft: { },
  bottomTotal: { fontSize: 22, fontWeight: '800', color: '#502314' },
  bottomItems: { fontSize: 11, color: '#8B6F61', marginTop: 2 },
  checkoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Z_RED, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 14 },
  checkoutBtnDisabled: { backgroundColor: '#D0D0D0' },
  checkoutText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
});
