import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Animated,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { db } from "../../config/firebaseConfig";
import { ref, update, get } from "firebase/database";
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

interface UserProfile {
  id: string;
  fullName: string;
  mobile: string;
  permanentAddress: string;
  role: string;
  email?: string;
  dateOfBirth?: string;
  emergencyContact?: string;
}

export default function EditProfile() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile>({
    id: "",
    fullName: "",
    mobile: "",
    permanentAddress: "",
    role: "",
    email: "",
    dateOfBirth: "",
    emergencyContact: "",
  });
  const [originalProfile, setOriginalProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Form validation states
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  
  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    loadProfile();
    startAnimations();
  }, []);

  useEffect(() => {
    checkForChanges();
  }, [profile, originalProfile]);

  const startAnimations = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const loadProfile = async () => {
    try {
      const stored = await AsyncStorage.getItem("userProfile");
      if (stored) {
        const localProfile = JSON.parse(stored);
        
        // Load latest from database
        const snapshot = await get(ref(db, `users/${localProfile.id}`));
        if (snapshot.exists()) {
          const data = snapshot.val();
          const fullProfile: UserProfile = {
            id: localProfile.id,
            fullName: data.fullName || "",
            mobile: data.mobile || "",
            permanentAddress: data.permanentAddress || "",
            role: data.role || localProfile.role,
            email: data.email || "",
            dateOfBirth: data.dateOfBirth || "",
            emergencyContact: data.emergencyContact || "",
          };
          
          setProfile(fullProfile);
          setOriginalProfile(fullProfile);
        } else {
          setProfile(localProfile);
          setOriginalProfile(localProfile);
        }
      } else {
        Alert.alert("Error", "No profile data found", [
          { text: "OK", onPress: () => router.back() }
        ]);
      }
    } catch (error) {
      console.error("Error loading profile:", error);
      Alert.alert("Error", "Failed to load profile data");
    } finally {
      setLoading(false);
    }
  };

  const checkForChanges = () => {
    if (!originalProfile) return;
    
    const changed = 
      profile.fullName !== originalProfile.fullName ||
      profile.mobile !== originalProfile.mobile ||
      profile.permanentAddress !== originalProfile.permanentAddress ||
      profile.email !== originalProfile.email ||
      profile.dateOfBirth !== originalProfile.dateOfBirth ||
      profile.emergencyContact !== originalProfile.emergencyContact;
    
    setHasChanges(changed);
  };

  const validateForm = (): boolean => {
    const newErrors: {[key: string]: string} = {};

    // Full Name validation
    if (!profile.fullName.trim()) {
      newErrors.fullName = "Full name is required";
    } else if (profile.fullName.trim().length < 2) {
      newErrors.fullName = "Name must be at least 2 characters";
    }

    // Mobile validation
    if (!profile.mobile.trim()) {
      newErrors.mobile = "Mobile number is required";
    } else if (!/^\+?[\d\s\-\(\)]{10,}$/.test(profile.mobile.trim())) {
      newErrors.mobile = "Please enter a valid mobile number";
    }

    // Address validation
    if (!profile.permanentAddress.trim()) {
      newErrors.permanentAddress = "Address is required";
    }

    // Email validation (optional but must be valid if provided)
    if (profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      Alert.alert("Validation Error", "Please fix the errors below");
      return;
    }

    if (!hasChanges) {
      Alert.alert("No Changes", "No changes were made to save");
      return;
    }

    setSaving(true);

    try {
      const updates = {
        fullName: profile.fullName.trim(),
        mobile: profile.mobile.trim(),
        permanentAddress: profile.permanentAddress.trim(),
        email: profile.email?.trim() || "",
        dateOfBirth: profile.dateOfBirth || "",
        emergencyContact: profile.emergencyContact?.trim() || "",
        lastUpdated: new Date().toISOString(),
      };

      // Update in Firebase
      await update(ref(db, `users/${profile.id}`), updates);

      // Update local storage
      const updatedProfile = { ...profile, ...updates };
      await AsyncStorage.setItem("userProfile", JSON.stringify(updatedProfile));
      
      setOriginalProfile(updatedProfile);
      
      Alert.alert(
        "✅ Success", 
        "Your profile has been updated successfully!",
        [
          { 
            text: "OK", 
            onPress: () => router.back()
          }
        ]
      );
      
    } catch (error) {
      console.error("Error updating profile:", error);
      Alert.alert("❌ Error", "Could not update profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    if (!hasChanges) {
      router.back();
      return;
    }

    Alert.alert(
      "Discard Changes",
      "You have unsaved changes. Are you sure you want to discard them?",
      [
        { text: "Keep Editing", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => router.back(),
        },
      ]
    );
  };

  const updateProfile = (field: keyof UserProfile, value: string) => {
    setProfile(prev => ({ ...prev, [field]: value }));
    
    // Clear error for this field when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: "" }));
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centeredContainer}>
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          style={styles.loadingGradient}
        >
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.loadingText}>Loading your profile...</Text>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#667eea" />
      
      {/* Header */}
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={handleDiscard}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          
          <Text style={styles.headerTitle}>Edit Profile</Text>
          
          <TouchableOpacity
            style={[styles.saveButton, (!hasChanges || saving) && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={!hasChanges || saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="checkmark" size={24} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View
            style={[
              styles.formContainer,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            {/* Personal Information Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="person" size={20} color="#667eea" />
                <Text style={styles.sectionTitle}>Personal Information</Text>
              </View>

              <FormField
                icon="person-outline"
                label="Full Name"
                placeholder="Enter your full name"
                value={profile.fullName}
                onChangeText={(value) => updateProfile('fullName', value)}
                error={errors.fullName}
                required
              />

              <FormField
                icon="call-outline"
                label="Mobile Number"
                placeholder="Enter your mobile number"
                value={profile.mobile}
                onChangeText={(value) => updateProfile('mobile', value)}
                error={errors.mobile}
                keyboardType="phone-pad"
                required
              />

              <FormField
                icon="mail-outline"
                label="Email Address"
                placeholder="Enter your email (optional)"
                value={profile.email || ""}
                onChangeText={(value) => updateProfile('email', value)}
                error={errors.email}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <FormField
                icon="calendar-outline"
                label="Date of Birth"
                placeholder="DD/MM/YYYY (optional)"
                value={profile.dateOfBirth || ""}
                onChangeText={(value) => updateProfile('dateOfBirth', value)}
                keyboardType="numeric"
              />
            </View>

            {/* Contact Information Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="location" size={20} color="#667eea" />
                <Text style={styles.sectionTitle}>Contact Information</Text>
              </View>

              <FormField
                icon="location-outline"
                label="Address"
                placeholder="Enter your complete address"
                value={profile.permanentAddress}
                onChangeText={(value) => updateProfile('permanentAddress', value)}
                error={errors.permanentAddress}
                multiline
                numberOfLines={3}
                required
              />

              <FormField
                icon="call-outline"
                label="Emergency Contact"
                placeholder="Emergency contact number (optional)"
                value={profile.emergencyContact || ""}
                onChangeText={(value) => updateProfile('emergencyContact', value)}
                keyboardType="phone-pad"
              />
            </View>

            {/* Role Information (Read-only) */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="shield-checkmark" size={20} color="#667eea" />
                <Text style={styles.sectionTitle}>Account Information</Text>
              </View>

              <View style={styles.readOnlyField}>
                <View style={styles.fieldHeader}>
                  <Ionicons name="card-outline" size={20} color="#6c757d" />
                  <Text style={styles.fieldLabel}>User ID</Text>
                </View>
                <Text style={styles.readOnlyValue}>{profile.id}</Text>
              </View>

              <View style={styles.readOnlyField}>
                <View style={styles.fieldHeader}>
                  <Ionicons name="shield-outline" size={20} color="#6c757d" />
                  <Text style={styles.fieldLabel}>Role</Text>
                </View>
                <Text style={[styles.readOnlyValue, styles.roleValue]}>{profile.role}</Text>
              </View>
            </View>

            {/* Save/Cancel Buttons */}
            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[styles.actionButton, styles.cancelButton]}
                onPress={handleDiscard}
              >
                <Ionicons name="close" size={20} color="#6c757d" />
                <Text style={[styles.buttonText, styles.cancelButtonText]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.actionButton,
                  styles.saveActionButton,
                  (!hasChanges || saving) && styles.saveActionButtonDisabled
                ]}
                onPress={handleSave}
                disabled={!hasChanges || saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="save" size={20} color="#fff" />
                )}
                <Text style={[styles.buttonText, styles.saveButtonText]}>
                  {saving ? "Saving..." : "Save Changes"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Changes Indicator */}
            {hasChanges && (
              <View style={styles.changesIndicator}>
                <Ionicons name="information-circle" size={16} color="#ffc107" />
                <Text style={styles.changesText}>You have unsaved changes</Text>
              </View>
            )}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Helper Components
interface FormFieldProps {
  icon: string;
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  keyboardType?: any;
  autoCapitalize?: any;
  multiline?: boolean;
  numberOfLines?: number;
  required?: boolean;
}

function FormField({
  icon,
  label,
  placeholder,
  value,
  onChangeText,
  error,
  keyboardType = "default",
  autoCapitalize = "words",
  multiline = false,
  numberOfLines = 1,
  required = false,
}: FormFieldProps) {
  return (
    <View style={styles.fieldContainer}>
      <View style={styles.fieldHeader}>
        <Ionicons name={icon as any} size={20} color="#6c757d" />
        <Text style={styles.fieldLabel}>
          {label}
          {required && <Text style={styles.requiredStar}> *</Text>}
        </Text>
      </View>
      
      <TextInput
        style={[
          styles.textInput,
          multiline && styles.textInputMultiline,
          error && styles.textInputError,
        ]}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        numberOfLines={numberOfLines}
        textAlignVertical={multiline ? "top" : "center"}
      />
      
      {error && (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={16} color="#dc3545" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 12,
    fontWeight: '500',
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 10 : 20,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 20,
  },
  saveButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  formContainer: {
    padding: 20,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f8f9fa',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2c3e50',
    marginLeft: 10,
  },
  fieldContainer: {
    marginBottom: 20,
  },
  fieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginLeft: 8,
  },
  requiredStar: {
    color: '#dc3545',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#374151',
    backgroundColor: '#fff',
  },
  textInputMultiline: {
    minHeight: 80,
    paddingTop: 12,
  },
  textInputError: {
    borderColor: '#dc3545',
    backgroundColor: '#fef2f2',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  errorText: {
    fontSize: 14,
    color: '#dc3545',
    marginLeft: 6,
  },
  readOnlyField: {
    marginBottom: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  readOnlyValue: {
    fontSize: 16,
    color: '#6c757d',
    marginTop: 4,
    fontWeight: '500',
  },
  roleValue: {
    textTransform: 'capitalize',
    color: '#667eea',
    fontWeight: '600',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 10,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cancelButton: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  saveActionButton: {
    backgroundColor: '#28a745',
  },
  saveActionButtonDisabled: {
    backgroundColor: '#6c757d',
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  cancelButtonText: {
    color: '#6c757d',
  },
  saveButtonText: {
    color: '#fff',
  },
  changesIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#fff3cd',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffeaa7',
  },
  changesText: {
    fontSize: 14,
    color: '#856404',
    marginLeft: 6,
    fontWeight: '500',
  },
});