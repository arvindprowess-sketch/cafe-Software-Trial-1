import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { FUEL, GOALS, FONT, RADIUS, SPACE } from '../../utils/theme';
import { DIET_TAGS, DIET_LABEL, toggleDietTag } from '../../utils/diet';

const Z_RED = FUEL.ink;
const GREEN = '#3FA34D';

export default function BudgetMealScreen() {
  const router = useRouter();
  const [budget, setBudget] = useState('200');
  const [dietPref, setDietPref] = useState<string[]>([]);
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
              style={[styles.filterChip, dietPref.length === 0 && { backgroundColor: FUEL.ink, borderColor: FUEL.ink }]}
              onPress={() => setDietPref([])}
            >
              <Ionicons name="apps" size={14} color={dietPref.length === 0 ? '#FFF' : FUEL.muted} />
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
  safe: { flex: 1, backgroundColor: FUEL.sand },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: SPACE.l, paddingTop: SPACE.s, paddingBottom: SPACE.m },
  title: { fontSize: 22, fontFamily: FONT.bodyExtrabold, color: FUEL.ink },
  subtitle: { fontSize: 12, color: FUEL.muted, marginTop: 2 },
  aiHelpBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, borderRadius: RADIUS.md, backgroundColor: FUEL.ink, paddingHorizontal: SPACE.m, paddingVertical: SPACE.m },
  aiHelpText: { fontSize: 11, fontFamily: FONT.bodyBold, color: '#FFF', textTransform: 'uppercase' },

  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 120 }, // clears the absolute tab bar

  // Budget Section
  budgetSection: { backgroundColor: '#FFF', paddingHorizontal: SPACE.l, paddingVertical: SPACE.l, borderBottomWidth: 1, borderBottomColor: FUEL.sandBorder },
  budgetInputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE.m },
  budgetLabel: { fontSize: 16, fontFamily: FONT.bodyBold, color: FUEL.ink },
  budgetInputBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: FUEL.sand, borderRadius: RADIUS.md, paddingHorizontal: SPACE.m, borderWidth: 2, borderColor: Z_RED, width: 132 },
  rupeeSign: { fontSize: 18, fontFamily: FONT.bodyExtrabold, color: Z_RED },
  budgetInput: { flex: 1, minWidth: 0, fontSize: 20, fontFamily: FONT.bodyExtrabold, color: FUEL.ink, textAlign: 'center', paddingVertical: SPACE.s },
  presetsRow: { flexDirection: 'row', gap: SPACE.s, marginBottom: SPACE.m, flexWrap: 'wrap' },
  presetBtn: { paddingHorizontal: SPACE.l, paddingVertical: SPACE.s, borderRadius: RADIUS.lg, backgroundColor: FUEL.sand, borderWidth: 1, borderColor: FUEL.sandBorder },
  presetBtnActive: { backgroundColor: Z_RED, borderColor: Z_RED },
  presetText: { fontSize: 12, fontFamily: FONT.bodyBold, color: FUEL.muted },
  presetTextActive: { color: '#FFF' },
  budgetProgress: {},
  progressBar: { height: 8, backgroundColor: FUEL.sandBorder, borderRadius: RADIUS.xs, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: GREEN, borderRadius: RADIUS.xs },
  budgetStats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACE.s },
  budgetSpent: { fontSize: 12, color: FUEL.muted },
  budgetRemaining: { fontSize: 14, fontFamily: FONT.bodyBold, color: GREEN },

  // Filters
  filterRow: { backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: FUEL.sandBorder },
  filterScroll: { paddingHorizontal: SPACE.l, paddingVertical: SPACE.m, gap: SPACE.s },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, paddingHorizontal: SPACE.m, paddingVertical: SPACE.s, borderRadius: RADIUS.lg, backgroundColor: FUEL.sand, borderWidth: 1, borderColor: FUEL.sandBorder },
  filterText: { fontSize: 12, fontFamily: FONT.bodySemibold, color: FUEL.muted },
  vegDotSmall: { width: 10, height: 10, borderRadius: RADIUS.xs },

  // Goal selector (fixed wrap — no horizontal scroll)
  goalSection: { backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: FUEL.sandBorder, paddingHorizontal: SPACE.l, paddingVertical: SPACE.m },
  goalFilterLabel: { fontSize: 12, fontFamily: FONT.bodyExtrabold, color: FUEL.ink, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: SPACE.m },
  goalWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.s },
  goalFilterChip: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, paddingHorizontal: SPACE.m, paddingVertical: SPACE.s, borderRadius: RADIUS.lg, backgroundColor: FUEL.sand, borderWidth: 1.5, borderColor: FUEL.sandBorder },

  // Smart Fill CTA
  smartFillCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.m, backgroundColor: FUEL.lime, marginHorizontal: SPACE.l, marginTop: SPACE.xl, borderRadius: RADIUS.md, paddingVertical: SPACE.l },
  smartFillCtaText: { fontSize: 16, fontFamily: FONT.bodyExtrabold, color: FUEL.ink, textTransform: 'uppercase', letterSpacing: 0.5 },
  ctaHint: { fontSize: 12, color: FUEL.muted, textAlign: 'center', marginHorizontal: SPACE.xxl, marginTop: SPACE.m, lineHeight: 18 },
});
