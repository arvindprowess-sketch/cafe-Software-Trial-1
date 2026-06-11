import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { apiCall } from '../utils/api';
import { useCart } from '../utils/CartContext';
import CartPill from './components/CartPill';

import { FUEL, FONT, RADIUS, SPACE } from '../utils/theme';
const Z_RED = FUEL.ink;
const PURPLE = '#15140F';
const GREEN = '#3FA34D';

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  actions?: any;
  timestamp: Date;
}

interface CartItem {
  id?: string;
  product_id?: string;
  name: string;
  grams: number;
  cost_per_100g: number;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g?: number;
  fat_per_100g?: number;
  diet_type?: string;
  image_url?: string;
}

export default function AIChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const scrollRef = useRef<ScrollView>(null);
  
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: "Hi! I'm your AI diet assistant. Tell me your budget and what you're craving, and I'll help you build the perfect meal! 💪",
      isUser: false,
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const { items: cart, addMeal, removeItem, subtotal, calories: cartCalories, protein: cartProtein, count: cartCount } = useCart();
  const [budget, setBudget] = useState(params.budget?.toString() || '200');
  const [goal, setGoal] = useState(params.goal?.toString() || 'maintenance');
  const [dietPref, setDietPref] = useState(params.diet?.toString() || 'both');

  const cartTotal = { price: subtotal, calories: cartCalories, protein: cartProtein };
  const remaining = parseFloat(budget || '0') - subtotal;

  // Add an AI-suggested meal (with the EXACT grams/portions the AI specified) to the shared cart.
  const addSuggestionToCart = (addItems: any[]) => {
    if (!Array.isArray(addItems) || addItems.length === 0) return;
    addMeal(addItems.map((item: any) => ({
      id: item.product_id || item.id,
      product_id: item.product_id || item.id,
      name: item.name || item.product_name,
      product_type: 'single',
      grams: item.grams || 100,
      cost_per_100g: item.cost_per_100g || 0,
      calories_per_100g: item.calories_per_100g ?? item.calories ?? 0,
      protein_per_100g: item.protein_per_100g ?? item.protein ?? 0,
      carbs_per_100g: item.carbs_per_100g ?? item.carbs ?? 0,
      fat_per_100g: item.fat_per_100g ?? item.fat ?? 0,
      diet_type: item.diet_type || 'veg',
      image_url: item.image_url,
    })));
  };

  // PR-E: optional `textOverride` lets the empty-state chips send through this
  // exact same pipeline as the send button.
  const sendMessage = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || loading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      text,
      isUser: true,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    Keyboard.dismiss();
    setLoading(true);

    try {
      const result = await apiCall('/ai/chat', {
        method: 'POST',
        body: {
          message: text,
          budget: parseFloat(budget) || 200,
          goal,
          diet_preference: dietPref,
          current_cart: cart,
        }
      });

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: result.message || "I couldn't process that. Try again!",
        isUser: false,
        actions: result.actions,
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, aiMsg]);

      // AI suggestions are shown with an explicit "Add" button per message (see renderer).
      // We do NOT auto-add. Only honor an explicit checkout intent → unified cart.
      if (result.actions?.action === 'checkout') {
        router.push('/cart');
      }
    } catch (e: any) {
      const errMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: "Sorry, I'm having trouble connecting. Please try again!",
        isUser: false,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }

    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const removeFromCart = (id?: string) => { if (id) removeItem(id); };

  // PR-E: empty-state suggestion chips — tapping one sends it as a user
  // message through the same send pipeline; hidden once history is non-empty.
  const suggestionChips = [
    "₹300 me high-protein meal?",
    "What fits my goal today?",
    "Best veg protein here?",
    "Plan my full day",
  ];

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#15140F" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.aiAvatar}>
            <Ionicons name="sparkles" size={18} color="#FFF" />
          </View>
          <View>
            <Text style={styles.headerTitle}>AI Diet Assistant</Text>
            <Text style={styles.headerSub}>Ask me anything about your meal!</Text>
          </View>
        </View>
      </View>

      {/* Budget Bar */}
      <View style={styles.budgetBar}>
        <View style={styles.budgetInputGroup}>
          <Text style={styles.budgetLabel}>Budget</Text>
          <View style={styles.budgetInputBox}>
            <Text style={styles.rupee}>₹</Text>
            <TextInput
              style={styles.budgetInput}
              value={budget}
              onChangeText={setBudget}
              keyboardType="number-pad"
            />
          </View>
        </View>
        <View style={styles.budgetStats}>
          <Text style={styles.spent}>Spent: ₹{Math.round(cartTotal.price)}</Text>
          <Text style={[styles.remaining, remaining < 0 && { color: Z_RED }]}>
            Left: ₹{Math.round(Math.max(0, remaining))}
          </Text>
        </View>
        <View style={styles.progressBar}>
          <View 
            style={[
              styles.progressFill, 
              { width: `${Math.min(100, (cartTotal.price / parseFloat(budget || '1')) * 100)}%` }
            ]} 
          />
        </View>
      </View>

      {/* Cart Preview */}
      {cart.length > 0 && (
        <View style={styles.cartPreview}>
          <View style={styles.cartHeader}>
            <Text style={styles.cartTitle}>Cart ({cart.length})</Text>
            <Text style={styles.cartMacros}>{Math.round(cartTotal.calories)} cal • {Math.round(cartTotal.protein)}g protein</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {cart.map((item, i) => (
              <View key={item.id || i} style={styles.cartChip}>
                <View style={[styles.vegDot, { backgroundColor: item.diet_type === 'non-veg' ? Z_RED : GREEN }]} />
                <Text style={styles.cartChipName}>{item.name}</Text>
                <Text style={styles.cartChipGrams}>{item.grams}g</Text>
                <TouchableOpacity onPress={() => removeFromCart(item.id)}>
                  <Ionicons name="close-circle" size={18} color="#D0D0D0" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      <KeyboardAvoidingView 
        style={styles.flex1} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={10}
      >
        {/* Messages */}
        <ScrollView 
          ref={scrollRef} 
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.map(msg => (
            <View 
              key={msg.id} 
              style={[styles.msgRow, msg.isUser && styles.msgRowUser]}
            >
              {!msg.isUser && (
                <View style={styles.aiMsgAvatar}>
                  <Ionicons name="sparkles" size={14} color="#FFF" />
                </View>
              )}
              <View style={[styles.msgBubble, msg.isUser ? styles.userBubble : styles.aiBubble]}>
                <Text style={[styles.msgText, msg.isUser && { color: '#FFF' }]}>{msg.text}</Text>
                
                {/* Explicit Add button under each AI meal suggestion */}
                {msg.actions?.add && msg.actions.add.length > 0 && (
                  <View style={styles.actionButtons}>
                    <Text style={styles.actionLabel}>Suggested meal</Text>
                    {msg.actions.add.map((item: any, i: number) => (
                      <View key={i} style={styles.addedItem}>
                        <View style={[styles.vegDot, { backgroundColor: item.diet_type === 'non-veg' ? Z_RED : GREEN }]} />
                        <Text style={styles.addedItemText}>{item.name} · {item.grams}g · ₹{Math.round(item.price || 0)}</Text>
                      </View>
                    ))}
                    <TouchableOpacity
                      testID={`ai-add-meal-${msg.id}`}
                      style={styles.aiAddBtn}
                      onPress={() => addSuggestionToCart(msg.actions.add)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="add-circle" size={18} color="#15140F" />
                      <Text style={styles.aiAddText}>Add to cart</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          ))}
          
          {loading && (
            <View style={styles.msgRow}>
              <View style={styles.aiMsgAvatar}>
                <Ionicons name="sparkles" size={14} color="#FFF" />
              </View>
              <View style={[styles.msgBubble, styles.aiBubble]}>
                <ActivityIndicator size="small" color={PURPLE} />
              </View>
            </View>
          )}

          {/* PR-E: suggestion chips (empty history only) — tap sends directly */}
          {messages.length === 1 && (
            <View style={styles.chipWrap}>
              <Text style={styles.quickPromptsLabel}>Try asking:</Text>
              <View style={styles.chipRow}>
                {suggestionChips.map((prompt, i) => (
                  <TouchableOpacity
                    key={i}
                    testID={`chat-chip-${i}`}
                    style={styles.suggestionChip}
                    onPress={() => sendMessage(prompt)}
                    disabled={loading}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.suggestionChipText}>{prompt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </ScrollView>

        {/* Input */}
        <View style={styles.inputContainer}>
          <TextInput
            testID="ai-chat-input"
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask about your meal..."
            placeholderTextColor="#B0B0B0"
            multiline
            maxLength={500}
          />
          <TouchableOpacity 
            testID="ai-send-btn"
            style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
            onPress={() => sendMessage()}
            disabled={!input.trim() || loading}
          >
            <Ionicons name="send" size={20} color="#FFF" />
          </TouchableOpacity>
        </View>

        {/* Checkout Button → unified cart */}
        {cartCount > 0 && (
          <TouchableOpacity 
            testID="ai-view-cart-btn"
            style={styles.checkoutBtn}
            onPress={() => router.push('/cart')}
          >
            <View style={styles.checkoutLeft}>
              <Text style={styles.checkoutTotal}>₹{Math.round(cartTotal.price)}</Text>
              <Text style={styles.checkoutItems}>{cart.length} items • {Math.round(cartTotal.calories)} cal</Text>
            </View>
            <View style={styles.checkoutRight}>
              <Text style={styles.checkoutText}>View Cart</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFF" />
            </View>
          </TouchableOpacity>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: FUEL.sand },
  flex1: { flex: 1 },
  
  // Header
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: SPACE.m, paddingVertical: SPACE.m, borderBottomWidth: 1, borderBottomColor: FUEL.sandBorder },
  backBtn: { padding: SPACE.s },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: SPACE.m },
  aiAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: PURPLE, alignItems: 'center', justifyContent: 'center' }, // circle
  headerTitle: { fontSize: 16, fontFamily: FONT.bodyBold, color: FUEL.ink },
  headerSub: { fontSize: 11, color: FUEL.muted },
  
  // Budget Bar
  budgetBar: { backgroundColor: '#FFF', paddingHorizontal: SPACE.l, paddingVertical: SPACE.m, borderBottomWidth: 1, borderBottomColor: FUEL.sandBorder },
  budgetInputGroup: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  budgetLabel: { fontSize: 14, fontFamily: FONT.bodySemibold, color: FUEL.muted },
  budgetInputBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: FUEL.sand, borderRadius: RADIUS.sm, paddingHorizontal: SPACE.m },
  rupee: { fontSize: 16, fontFamily: FONT.bodyBold, color: Z_RED },
  budgetInput: { fontSize: 18, fontFamily: FONT.bodyBold, color: FUEL.ink, width: 70, textAlign: 'right', paddingVertical: SPACE.s },
  budgetStats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACE.s },
  spent: { fontSize: 12, color: FUEL.muted },
  remaining: { fontSize: 13, fontFamily: FONT.bodyBold, color: GREEN },
  progressBar: { height: 4, backgroundColor: FUEL.sandBorder, borderRadius: RADIUS.pill, marginTop: SPACE.s, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: PURPLE, borderRadius: RADIUS.xs },
  
  // Cart Preview
  cartPreview: { backgroundColor: '#FFF', paddingHorizontal: SPACE.l, paddingVertical: SPACE.m, borderBottomWidth: 1, borderBottomColor: FUEL.sandBorder },
  cartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.s },
  cartTitle: { fontSize: 14, fontFamily: FONT.bodyBold, color: FUEL.ink },
  cartMacros: { fontSize: 11, color: PURPLE },
  cartChip: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, backgroundColor: FUEL.sand, borderRadius: RADIUS.lg, paddingHorizontal: SPACE.m, paddingVertical: SPACE.s, marginRight: SPACE.s },
  vegDot: { width: 8, height: 8, borderRadius: 4 }, // circle
  cartChipName: { fontSize: 12, fontFamily: FONT.bodySemibold, color: FUEL.ink },
  cartChipGrams: { fontSize: 11, color: FUEL.muted },
  
  // Messages
  messages: { flex: 1 },
  messagesContent: { padding: SPACE.l },
  msgRow: { flexDirection: 'row', marginBottom: SPACE.m, alignItems: 'flex-start' },
  msgRowUser: { justifyContent: 'flex-end' },
  aiMsgAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: PURPLE, alignItems: 'center', justifyContent: 'center', marginRight: SPACE.s }, // circle
  msgBubble: { maxWidth: '80%', borderRadius: RADIUS.md, paddingHorizontal: SPACE.l, paddingVertical: SPACE.m },
  userBubble: { backgroundColor: Z_RED, borderBottomRightRadius: RADIUS.xs },
  aiBubble: { backgroundColor: '#FFF', borderWidth: 1, borderColor: FUEL.sandBorder, borderBottomLeftRadius: RADIUS.xs },
  msgText: { fontSize: 14, color: FUEL.ink, lineHeight: 20 },
  
  // Action buttons in AI message
  actionButtons: { marginTop: SPACE.m, paddingTop: SPACE.m, borderTopWidth: 1, borderTopColor: FUEL.sandBorder },
  actionLabel: { fontSize: 11, color: GREEN, fontFamily: FONT.bodySemibold, marginBottom: SPACE.s },
  addedItem: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, marginBottom: SPACE.xs },
  addedItemText: { fontSize: 12, color: FUEL.ink },
  aiAddBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.s, backgroundColor: '#D9F26E', borderRadius: RADIUS.md, paddingVertical: SPACE.m, marginTop: SPACE.s },
  aiAddText: { fontSize: 13, fontFamily: FONT.bodyExtrabold, color: FUEL.ink, textTransform: 'uppercase', letterSpacing: 0.3 },
  
  // PR-E: empty-state suggestion chips (FUEL: white / sandBorder / ink)
  chipWrap: { marginTop: SPACE.m },
  quickPromptsLabel: { fontSize: 12, color: FUEL.muted, marginBottom: SPACE.s },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.s },
  suggestionChip: { backgroundColor: FUEL.white, borderWidth: 1, borderColor: FUEL.sandBorder, borderRadius: RADIUS.pill, paddingHorizontal: SPACE.l, paddingVertical: SPACE.m },
  suggestionChipText: { fontSize: 13, color: FUEL.ink, fontFamily: FONT.bodySemibold },
  
  // Input
  inputContainer: { flexDirection: 'row', alignItems: 'flex-end', padding: SPACE.m, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: FUEL.sandBorder },
  input: { flex: 1, backgroundColor: FUEL.sand, borderRadius: RADIUS.lg, paddingHorizontal: SPACE.l, paddingVertical: SPACE.m, fontSize: 14, maxHeight: 100, color: FUEL.ink },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: PURPLE, alignItems: 'center', justifyContent: 'center', marginLeft: SPACE.s }, // circle
  sendBtnDisabled: { backgroundColor: FUEL.sandBorder },
  
  // Checkout
  checkoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Z_RED, marginHorizontal: SPACE.m, marginBottom: SPACE.m, borderRadius: RADIUS.md, paddingHorizontal: SPACE.l, paddingVertical: SPACE.l, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 },
  checkoutLeft: { flex: 1 },
  checkoutTotal: { fontSize: 20, fontFamily: FONT.bodyExtrabold, color: '#FFF' },
  checkoutItems: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  checkoutRight: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, backgroundColor: 'rgba(0,0,0,0.15)', paddingHorizontal: SPACE.l, paddingVertical: SPACE.s, borderRadius: RADIUS.sm },
  checkoutText: { fontSize: 16, fontFamily: FONT.bodyBold, color: '#FFF' },
});
