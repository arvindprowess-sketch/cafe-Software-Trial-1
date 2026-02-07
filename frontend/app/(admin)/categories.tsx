import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image,
  RefreshControl, Alert, ActivityIndicator, Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiCall } from '../../utils/api';

const Z_RED = '#E23744';
const GREEN = '#267E3E';
const PURPLE = '#5B5FE0';

// Available icons for categories
const ICON_OPTIONS = [
  'grid', 'barbell', 'leaf', 'water', 'fast-food', 'nutrition', 'flame', 
  'restaurant', 'cafe', 'pizza', 'ice-cream', 'beer', 'fish', 'egg'
];

// Preset colors
const COLOR_OPTIONS = [
  '#E23744', '#267E3E', '#5B5FE0', '#FF9F0A', '#4CAF50', '#2196F3', 
  '#9C27B0', '#795548', '#607D8B', '#FF5722', '#00BCD4', '#E91E63'
];

export default function AdminCategoriesScreen() {
  const router = useRouter();
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Modal states
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  
  // Form states
  const [name, setName] = useState('');
  const [label, setLabel] = useState('');
  const [icon, setIcon] = useState('grid');
  const [color, setColor] = useState('#E23744');
  const [imageUrl, setImageUrl] = useState('');
  const [description, setDescription] = useState('');
  const [sortOrder, setSortOrder] = useState('0');

  const loadCategories = useCallback(async () => {
    try {
      const data = await apiCall('/categories/all');
      setCategories(data);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCategories(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadCategories();
    setRefreshing(false);
  };

  const openModal = (category?: any) => {
    if (category) {
      setEditingCategory(category);
      setName(category.name || '');
      setLabel(category.label || '');
      setIcon(category.icon || 'grid');
      setColor(category.color || '#E23744');
      setImageUrl(category.image_url || '');
      setDescription(category.description || '');
      setSortOrder(String(category.sort_order || 0));
    } else {
      setEditingCategory(null);
      setName('');
      setLabel('');
      setIcon('grid');
      setColor('#E23744');
      setImageUrl('');
      setDescription('');
      setSortOrder(String(categories.length + 1));
    }
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingCategory(null);
  };

  const saveCategory = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Category name is required');
      return;
    }
    
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        label: label.trim() || name.trim(),
        icon,
        color,
        image_url: imageUrl.trim() || null,
        description: description.trim() || null,
        sort_order: parseInt(sortOrder) || 0,
      };
      
      if (editingCategory) {
        await apiCall(`/categories/${editingCategory.id}`, { method: 'PUT', body: payload });
        Alert.alert('Success', 'Category updated');
      } else {
        await apiCall('/categories', { method: 'POST', body: payload });
        Alert.alert('Success', 'Category created');
      }
      
      closeModal();
      loadCategories();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteCategory = async (category: any) => {
    Alert.alert(
      'Delete Category',
      `Are you sure you want to delete "${category.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiCall(`/categories/${category.id}`, { method: 'DELETE' });
              loadCategories();
            } catch (e: any) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ]
    );
  };

  const seedDefaults = async () => {
    try {
      const result = await apiCall('/categories/seed-defaults', { method: 'POST' });
      Alert.alert('Success', result.message);
      loadCategories();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

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
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#1C1C2E" />
        </TouchableOpacity>
        <Text style={styles.title}>Manage Categories</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => openModal()}>
          <Ionicons name="add" size={24} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* Seed Defaults Button (if no categories) */}
      {categories.length === 0 && (
        <TouchableOpacity style={styles.seedBtn} onPress={seedDefaults}>
          <Ionicons name="flash" size={20} color="#FFF" />
          <Text style={styles.seedBtnText}>Seed Default Categories</Text>
        </TouchableOpacity>
      )}

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Z_RED} />}
        contentContainerStyle={styles.content}
      >
        {categories.map((cat, index) => (
          <View key={cat.id} style={[styles.categoryCard, !cat.is_active && styles.categoryInactive]}>
            <View style={styles.categoryLeft}>
              {cat.image_url ? (
                <Image source={{ uri: cat.image_url }} style={styles.categoryImage} />
              ) : (
                <View style={[styles.categoryIcon, { backgroundColor: cat.color }]}>
                  <Ionicons name={cat.icon as any} size={24} color="#FFF" />
                </View>
              )}
              <View style={styles.categoryInfo}>
                <Text style={styles.categoryName}>{cat.name}</Text>
                <Text style={styles.categoryLabel}>{cat.label}</Text>
                <View style={styles.categoryMeta}>
                  <View style={[styles.colorDot, { backgroundColor: cat.color }]} />
                  <Text style={styles.categoryKey}>Key: {cat.key}</Text>
                  <Text style={styles.categoryOrder}>Order: {cat.sort_order}</Text>
                </View>
              </View>
            </View>
            <View style={styles.categoryActions}>
              <TouchableOpacity style={styles.editBtn} onPress={() => openModal(cat)}>
                <Ionicons name="pencil" size={18} color={PURPLE} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteCategory(cat)}>
                <Ionicons name="trash" size={18} color={Z_RED} />
              </TouchableOpacity>
            </View>
          </View>
        ))}
        
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingCategory ? 'Edit Category' : 'New Category'}
              </Text>
              <TouchableOpacity onPress={closeModal}>
                <Ionicons name="close" size={24} color="#696969" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {/* Name */}
              <Text style={styles.inputLabel}>Category Name *</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g., High Protein"
                placeholderTextColor="#B0B0B0"
              />

              {/* Label */}
              <Text style={styles.inputLabel}>Display Label</Text>
              <TextInput
                style={styles.input}
                value={label}
                onChangeText={setLabel}
                placeholder="Shown in menu sidebar"
                placeholderTextColor="#B0B0B0"
              />

              {/* Icon Picker */}
              <Text style={styles.inputLabel}>Icon</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.iconPicker}>
                {ICON_OPTIONS.map((iconName) => (
                  <TouchableOpacity
                    key={iconName}
                    style={[styles.iconOption, icon === iconName && { backgroundColor: color }]}
                    onPress={() => setIcon(iconName)}
                  >
                    <Ionicons name={iconName as any} size={20} color={icon === iconName ? '#FFF' : '#696969'} />
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Color Picker */}
              <Text style={styles.inputLabel}>Color</Text>
              <View style={styles.colorPicker}>
                {COLOR_OPTIONS.map((colorOption) => (
                  <TouchableOpacity
                    key={colorOption}
                    style={[
                      styles.colorOption,
                      { backgroundColor: colorOption },
                      color === colorOption && styles.colorOptionActive
                    ]}
                    onPress={() => setColor(colorOption)}
                  >
                    {color === colorOption && <Ionicons name="checkmark" size={16} color="#FFF" />}
                  </TouchableOpacity>
                ))}
              </View>

              {/* Image URL */}
              <Text style={styles.inputLabel}>Image URL (optional)</Text>
              <TextInput
                style={styles.input}
                value={imageUrl}
                onChangeText={setImageUrl}
                placeholder="https://example.com/image.jpg"
                placeholderTextColor="#B0B0B0"
                autoCapitalize="none"
              />
              {imageUrl ? (
                <Image source={{ uri: imageUrl }} style={styles.imagePreview} />
              ) : null}

              {/* Description */}
              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={description}
                onChangeText={setDescription}
                placeholder="Category description..."
                placeholderTextColor="#B0B0B0"
                multiline
                numberOfLines={3}
              />

              {/* Sort Order */}
              <Text style={styles.inputLabel}>Sort Order</Text>
              <TextInput
                style={styles.input}
                value={sortOrder}
                onChangeText={setSortOrder}
                placeholder="1"
                placeholderTextColor="#B0B0B0"
                keyboardType="number-pad"
              />
            </ScrollView>

            {/* Save Button */}
            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={saveCategory}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={20} color="#FFF" />
                  <Text style={styles.saveBtnText}>
                    {editingCategory ? 'Update Category' : 'Create Category'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F8F8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '800', color: '#1C1C2E' },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Z_RED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  seedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: PURPLE,
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
  },
  seedBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  
  content: { padding: 16 },
  
  categoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  categoryInactive: { opacity: 0.5 },
  categoryLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  categoryImage: { width: 50, height: 50, borderRadius: 10 },
  categoryIcon: {
    width: 50,
    height: 50,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryInfo: { flex: 1 },
  categoryName: { fontSize: 16, fontWeight: '700', color: '#1C1C2E' },
  categoryLabel: { fontSize: 12, color: '#696969', marginTop: 2 },
  categoryMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  colorDot: { width: 12, height: 12, borderRadius: 6 },
  categoryKey: { fontSize: 10, color: '#9C9C9C' },
  categoryOrder: { fontSize: 10, color: '#9C9C9C' },
  categoryActions: { flexDirection: 'row', gap: 8 },
  editBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#F0F0FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#FDE8EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C2E' },
  modalBody: { padding: 16 },
  
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#696969', marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1C1C2E',
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  textArea: { height: 80, textAlignVertical: 'top' },
  
  iconPicker: { flexDirection: 'row', marginBottom: 8 },
  iconOption: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  
  colorPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorOption: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorOptionActive: { borderWidth: 3, borderColor: '#FFF', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 },
  
  imagePreview: {
    width: '100%',
    height: 100,
    borderRadius: 10,
    marginTop: 10,
    backgroundColor: '#F5F5F5',
  },
  
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Z_RED,
    margin: 16,
    paddingVertical: 16,
    borderRadius: 12,
  },
  saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
