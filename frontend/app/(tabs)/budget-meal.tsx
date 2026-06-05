import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { FUEL, GOALS } from '../../utils/theme';
import { DIET_TAGS, DIET_LABEL, toggleDietTag } from '../../utils/diet';

const Z_RED = '#15140F';
const GREEN = '#3FA34D';

export default function BudgetMealScreen() {
  const router = useRouter();
  const [budget, setBudget] = useState('200');
  const [dietPref, setDietPref] = useState('both');
  const [goal, setGoal] = useState('maintenance');
  const orderType = 'dine-in';

  const budgetNum = parseFloat(budget) || 0;

  // Smart Fill is the ONLY action: configure budget/diet/goal, then auto-build on smart-fill.tsx.
  const goToSmartFill = () => {
    if (budgetNum < 50) {
      Alert.alert('Set a budget', 'Enter a budget of at least ₹50 to use Smart Fill.');
      return;
    }
    router.push({ pathname: '/smart-fill', params: { budget: String(budgetNum), dietPref: dietPref.join(','), goal, orderType } });
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Budget Meal Builder</Text>
          <Text style={styles.subtitle}>Set budget, diet & goal — then Smart Fill</Text>
        </View>
        <TouchableOpacity style={styles.aiHelpBtn} onPress={goToSmartFill} testID="smart-fill-btn">
          <Ionicons name="sparkles" size={20} color="#FFF" />
          <Text style={styles.aiHelpText}>Smart Fill</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Budget Input Section */}
        <View style={styles.budgetSection}>
          <View style={styles.budgetInputRow}>
            <Text style={styles.budgetLabel}>My Budget</Text>
            <View style={styles.budgetInputBox}>
              <Text style={styles.rupeeSign}>₹</Text>
              <TextInput
                testID="budget-input"
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
                testID={`budget-preset-${amount}`}
                style={[styles.presetBtn, budget === String(amount) && styles.presetBtnActive]}
                onPress={() => setBudget(String(amount))}
              >
                <Text style={[styles.presetText, budget === String(amount) && styles.presetTextActive]}>
                  ₹{amount}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Spent / left bar — full budget available until you build on Smart Fill */}
          <View style={styles.budgetProgress}>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: '0%' }]} />
            </View>
            <View style={styles.budgetStats}>
              <Text style={styles.budgetSpent}>₹0 spent</Text>
              <Text style={styles.budgetRemaining} testID="budget-left">₹{Math.round(budgetNum)} left</Text>
            </View>
          </View>
        </View>

        {/* Diet Preference filter — multi-select */}
        <View style={styles.filterRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
            <TouchableOpacity
              testID="budget-diet-all"
              style={[styles.filterChip, dietPref.length === 0 && { backgroundColor: '#15140F', borderColor: '#15140F' }]}
              onPress={() => setDietPref([])}
            >
              <Ionicons name="apps" size={14} color={dietPref.length === 0 ? '#FFF' : '#6B6A5E'} />
              <Text style={[styles.filterText, dietPref.length === 0 && { color: '#FFF' }]}>All</Text>
            </TouchableOpacity>
            {DIET_TAGS.map(tag => {
              const on = dietPref.includes(tag);
              const color = tag === 'non-veg' ? Z_RED : GREEN;
              return (
                <TouchableOpacity
                  key={tag}
                  testID={`budget-diet-${tag}`}
                  style={[styles.filterChip, on && { backgroundColor: color, borderColor: color }]}
                  onPress={() => setDietPref(prev => toggleDietTag(prev, tag))}
                >
                  <View style={[styles.vegDotSmall, { backgroundColor: on ? '#FFF' : color }]} />
                  <Text style={[styles.filterText, on && { color: '#FFF' }]}>{DIET_LABEL[tag]}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Fitness Goal selector — all 6 canonical goals, fixed (no horizontal scroll) */}
        <View style={styles.goalSection}>
          <Text style={styles.goalFilterLabel}>Goal</Text>
          <View style={styles.goalWrap}>
            {GOALS.map(g => (
              <TouchableOpacity
                key={g.key}
                testID={`budget-goal-${g.key}`}
                style={[styles.goalFilterChip, goal === g.key && { backgroundColor: g.color, borderColor: g.color }]}
                onPress={() => setGoal(g.key)}
              >
                <Ionicons name={g.icon as any} size={14} color={goal === g.key ? '#FFF' : g.color} />
                <Text style={[styles.filterText, goal === g.key && { color: '#FFF' }]}>{g.shortLabel}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Primary Smart Fill CTA */}
        <TouchableOpacity style={styles.smartFillCta} onPress={goToSmartFill} testID="smart-fill-cta" activeOpacity={0.9}>
          <Ionicons name="flash" size={22} color={FUEL.ink} />
          <Text style={styles.smartFillCtaText}>Smart Fill My Meal</Text>
        </TouchableOpacity>
        <Text style={styles.ctaHint}>
          We'll auto-pick dishes that fit your ₹{Math.round(budgetNum)} budget for your{' '}
          {dietPref.length ? dietPref.map(t => DIET_LABEL[t]).join(' + ') : 'any-diet'} {goal.replace('_', ' ')} goal. You can swap or remove items on the next screen.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F1E9' },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  title: { fontSize: 22, fontWeight: '800', color: '#15140F' },
  subtitle: { fontSize: 12, color: '#6B6A5E', marginTop: 2 },
  aiHelpBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, backgroundColor: '#15140F', paddingHorizontal: 12, paddingVertical: 10 },
  aiHelpText: { fontSize: 11, fontWeight: '700', color: '#FFF', textTransform: 'uppercase' },

  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40 },

  // Budget Section
  budgetSection: { backgroundColor: '#FFF', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#E6E1D4' },
  budgetInputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  budgetLabel: { fontSize: 16, fontWeight: '700', color: '#15140F' },
  budgetInputBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F4F1E9', borderRadius: 12, paddingHorizontal: 12, borderWidth: 2, borderColor: Z_RED, width: 132 },
  rupeeSign: { fontSize: 18, fontWeight: '800', color: Z_RED },
  budgetInput: { flex: 1, minWidth: 0, fontSize: 20, fontWeight: '800', color: '#15140F', textAlign: 'center', paddingVertical: 8 },
  presetsRow: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  presetBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F4F1E9', borderWidth: 1, borderColor: '#E6E1D4' },
  presetBtnActive: { backgroundColor: Z_RED, borderColor: Z_RED },
  presetText: { fontSize: 12, fontWeight: '700', color: '#6B6A5E' },
  presetTextActive: { color: '#FFF' },
  budgetProgress: {},
  progressBar: { height: 8, backgroundColor: '#E6E1D4', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: GREEN, borderRadius: 4 },
  budgetStats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  budgetSpent: { fontSize: 12, color: '#6B6A5E' },
  budgetRemaining: { fontSize: 14, fontWeight: '700', color: GREEN },

  // Filters
  filterRow: { backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E6E1D4' },
  filterScroll: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F4F1E9', borderWidth: 1, borderColor: '#E8E8E8' },
  filterText: { fontSize: 12, fontWeight: '600', color: '#6B6A5E' },
  vegDotSmall: { width: 10, height: 10, borderRadius: 5 },

  // Goal selector (fixed wrap — no horizontal scroll)
  goalSection: { backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E6E1D4', paddingHorizontal: 16, paddingVertical: 12 },
  goalFilterLabel: { fontSize: 12, fontWeight: '800', color: '#15140F', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  goalWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  goalFilterChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F4F1E9', borderWidth: 1.5, borderColor: '#E8E8E8' },

  // Smart Fill CTA
  smartFillCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: FUEL.lime, marginHorizontal: 16, marginTop: 24, borderRadius: 16, paddingVertical: 18 },
  smartFillCtaText: { fontSize: 16, fontWeight: '900', color: FUEL.ink, textTransform: 'uppercase', letterSpacing: 0.5 },
  ctaHint: { fontSize: 12, color: '#6B6A5E', textAlign: 'center', marginHorizontal: 28, marginTop: 12, lineHeight: 18 },
});
