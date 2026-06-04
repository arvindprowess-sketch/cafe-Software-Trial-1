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

const Z_RED = '#15140F';
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

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    
    const userMsg: Message = {
      id: Date.now().toString(),
      text: input.trim(),
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
          message: input.trim(),
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

  const quickPrompts = [
    "Build me a high protein meal under ₹150",
    "I want to lose weight, suggest something",
    "What's good for muscle gain?",
    "Show me veg options only",
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

          {/* Quick Prompts (show at start) */}
          {messages.length === 1 && (
            <View style={styles.quickPrompts}>
              <Text style={styles.quickPromptsLabel}>Try asking:</Text>
              {quickPrompts.map((prompt, i) => (
                <TouchableOpacity 
                  key={i} 
                  style={styles.promptChip}
                  onPress={() => setInput(prompt)}
                >
                  <Text style={styles.promptText}>{prompt}</Text>
                </TouchableOpacity>
              ))}
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
            onPress={sendMessage}
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
  safe: { flex: 1, backgroundColor: '#F4F1E9' },
  flex1: { flex: 1 },
  
  // Header
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E6E1D4' },
  backBtn: { padding: 8 },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  aiAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: PURPLE, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#15140F' },
  headerSub: { fontSize: 11, color: '#6B6A5E' },
  
  // Budget Bar
  budgetBar: { backgroundColor: '#FFF', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E6E1D4' },
  budgetInputGroup: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  budgetLabel: { fontSize: 14, fontWeight: '600', color: '#6B6A5E' },
  budgetInputBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F4F1E9', borderRadius: 8, paddingHorizontal: 10 },
  rupee: { fontSize: 16, fontWeight: '700', color: Z_RED },
  budgetInput: { fontSize: 18, fontWeight: '700', color: '#15140F', width: 70, textAlign: 'right', paddingVertical: 6 },
  budgetStats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  spent: { fontSize: 12, color: '#6B6A5E' },
  remaining: { fontSize: 13, fontWeight: '700', color: GREEN },
  progressBar: { height: 4, backgroundColor: '#E6E1D4', borderRadius: 2, marginTop: 6, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: PURPLE, borderRadius: 2 },
  
  // Cart Preview
  cartPreview: { backgroundColor: '#FFF', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E6E1D4' },
  cartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cartTitle: { fontSize: 14, fontWeight: '700', color: '#15140F' },
  cartMacros: { fontSize: 11, color: PURPLE },
  cartChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F4F1E9', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8 },
  vegDot: { width: 8, height: 8, borderRadius: 4 },
  cartChipName: { fontSize: 12, fontWeight: '600', color: '#15140F' },
  cartChipGrams: { fontSize: 11, color: '#6B6A5E' },
  
  // Messages
  messages: { flex: 1 },
  messagesContent: { padding: 16 },
  msgRow: { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-start' },
  msgRowUser: { justifyContent: 'flex-end' },
  aiMsgAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: PURPLE, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  msgBubble: { maxWidth: '80%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  userBubble: { backgroundColor: Z_RED, borderBottomRightRadius: 4 },
  aiBubble: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E6E1D4', borderBottomLeftRadius: 4 },
  msgText: { fontSize: 14, color: '#15140F', lineHeight: 20 },
  
  // Action buttons in AI message
  actionButtons: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E6E1D4' },
  actionLabel: { fontSize: 11, color: GREEN, fontWeight: '600', marginBottom: 6 },
  addedItem: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  addedItemText: { fontSize: 12, color: '#15140F' },
  aiAddBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#D9F26E', borderRadius: 12, paddingVertical: 10, marginTop: 8 },
  aiAddText: { fontSize: 13, fontWeight: '800', color: '#15140F', textTransform: 'uppercase', letterSpacing: 0.3 },
  
  // Quick prompts
  quickPrompts: { marginTop: 10, padding: 12, backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#E6E1D4' },
  quickPromptsLabel: { fontSize: 12, color: '#6B6A5E', marginBottom: 8 },
  promptChip: { backgroundColor: '#F4F1E9', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 8 },
  promptText: { fontSize: 13, color: PURPLE, fontWeight: '500' },
  
  // Input
  inputContainer: { flexDirection: 'row', alignItems: 'flex-end', padding: 12, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E6E1D4' },
  input: { flex: 1, backgroundColor: '#F4F1E9', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, maxHeight: 100, color: '#15140F' },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: PURPLE, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  sendBtnDisabled: { backgroundColor: '#D0D0D0' },
  
  // Checkout
  checkoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Z_RED, marginHorizontal: 12, marginBottom: 12, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 },
  checkoutLeft: { flex: 1 },
  checkoutTotal: { fontSize: 20, fontWeight: '800', color: '#FFF' },
  checkoutItems: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  checkoutRight: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.15)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  checkoutText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
});
