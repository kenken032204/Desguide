import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Dimensions,
  StatusBar,
  ScrollView,
  Animated,
} from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { db } from "../config/firebaseConfig";
import { ref, get, child, set } from "firebase/database";
import { Ionicons } from "@expo/vector-icons";

const { width } = Dimensions.get('window');

export default function QuickSetup() {
  const router = useRouter();

  // States
  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"Student" | "Driver" | "Parent" | null>(null);
  const [studentID, setStudentID] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Animation values
  const fadeAnim = new Animated.Value(1);
  const slideAnim = new Animated.Value(0);

  const nextStep = () => {
    // Required field checks
    if (
      (step === 0 && !fullName.trim()) ||
      (step === 1 && !role) ||
      (step === 2 && role === "Student" && !studentID.trim()) ||
      (step === 2 && role === "Driver" && !licenseNumber.trim()) ||
      (step === 2 && role === "Parent" && !contactNumber.trim()) ||
      (step === 3 && !mobile.trim()) ||
      (step === 4 && (!password.trim() || !confirmPassword.trim()))
    ) {
      setError("Please fill in this field.");
      return;
    }

    // Name must be at least 3 chars
    if (step === 0 && fullName.trim().length < 3) {
      setError("Full name must be at least 3 characters long.");
      return;
    }

    // ID length rules
    if (step === 2) {
      if (role === "Student" && studentID.trim().length < 4) {
        setError("Student ID must be at least 4 characters.");
        return;
      }
      if (role === "Driver" && licenseNumber.trim().length < 5) {
        setError("License number must be at least 5 characters.");
        return;
      }
      if (role === "Parent" && contactNumber.trim().length < 5) {
        setError("Contact number must be at least 5 characters.");
        return;
      }
    }

    // Mobile format PH style (09xxxxxxxxx)
    if (step === 3 && !/^09\d{9}$/.test(mobile)) {
      setError("Enter a valid mobile number (e.g. 09xxxxxxxxx).");
      return;
    }

    // Password strength + match
    if (step === 4) {
      if (password.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
    }

    setError("");
    
    // Animate to next step
    if (step < 4) {
      animateStep(() => setStep(step + 1));
    } else {
      handleFinish();
    }
  };

  const animateStep = (callback: () => void) => {
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 20,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      callback();
      slideAnim.setValue(-20);
      Animated.sequence([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    });
  };

  const handleFinish = async () => {
    setLoading(true);

    const id =
      role === "Student"
        ? studentID
        : role === "Driver"
        ? licenseNumber
        : contactNumber;

    try {
      const dbRef = ref(db);
      const snapshot = await get(child(dbRef, `users/${id}`));

      if (snapshot.exists()) {
        setLoading(false);
        setError(
          role === "Student"
            ? "Student ID already exists."
            : role === "Driver"
            ? "License Number already exists."
            : "Contact Number already exists."
        );
        return;
      }

      // check for fullName uniqueness
      const usersSnapshot = await get(child(dbRef, "users"));
      if (usersSnapshot.exists()) {
        const users = usersSnapshot.val();
        const nameExists = Object.values(users).some(
          (user: any) => user.fullName?.toLowerCase() === fullName.toLowerCase()
        );

        if (nameExists) {
          setLoading(false);
          setError("A user with this full name already exists.");
          return;
        }
      }

      const profile = {
        fullName,
        role,
        mobile,
        id,
        password,
        checkInStatus: false,
      };

      await set(ref(db, `users/${id}`), profile);
      await AsyncStorage.setItem("userProfile", JSON.stringify(profile));

      setTimeout(() => {
        setLoading(false);
        Alert.alert("🎉 Success", "Welcome to DesGuide! Your account is ready.", [
          {
            text: "Get Started",
            onPress: () => router.replace("(tabs)/dashboard"),
          },
        ]);
      }, 1000);
    } catch (e) {
      console.log("Error checking or saving profile:", e);
      setLoading(false);
      Alert.alert("❌ Error", "Something went wrong. Please try again.");
    }
  };

  const getStepInfo = () => {
    const steps = [
      { title: "Personal Info", subtitle: "Tell us your name", icon: "person-outline", color: "#3b82f6" },
      { title: "Your Role", subtitle: "How will you use DesGuide?", icon: "people-circle-outline", color: "#8b5cf6" },
      { title: "Identification", subtitle: "Your unique identifier", icon: "card-outline", color: "#10b981" },
      { title: "Contact", subtitle: "Stay connected with us", icon: "call-outline", color: "#f59e0b" },
      { title: "Security", subtitle: "Protect your account", icon: "shield-checkmark-outline", color: "#ef4444" }
    ];
    return steps[step];
  };

  const renderProgressBar = () => {
    const progress = ((step + 1) / 5) * 100;
    return (
      <View style={styles.progressContainer}>
        <View style={styles.progressBackground}>
          <Animated.View 
            style={[
              styles.progressFill, 
              { width: `${progress}%`, backgroundColor: getStepInfo().color }
            ]} 
          />
        </View>
        <Text style={styles.progressText}>{step + 1} of 5</Text>
      </View>
    );
  };

  const renderStepContent = () => {
    switch (step) {
      case 0:
        return (
          <Animated.View 
            style={[
              styles.stepContainer,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
            ]}
          >
            <View style={styles.stepHeader}>
              <View style={[styles.iconContainer, { backgroundColor: getStepInfo().color }]}>
                <Ionicons name={getStepInfo().icon as any} size={32} color="#fff" />
              </View>
              <Text style={styles.stepTitle}>{getStepInfo().title}</Text>
              <Text style={styles.stepSubtitle}>{getStepInfo().subtitle}</Text>
            </View>
            
            <View style={styles.inputContainer}>
              <TextInput
                placeholder="Enter your full name"
                placeholderTextColor="#94a3b8"
                style={styles.modernInput}
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
                autoFocus
              />
              <Text style={styles.inputHint}>This will be displayed on your profile</Text>
            </View>
          </Animated.View>
        );

      case 1:
        return (
          <Animated.View 
            style={[
              styles.stepContainer,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
            ]}
          >
            <View style={styles.stepHeader}>
              <View style={[styles.iconContainer, { backgroundColor: getStepInfo().color }]}>
                <Ionicons name={getStepInfo().icon as any} size={32} color="#fff" />
              </View>
              <Text style={styles.stepTitle}>{getStepInfo().title}</Text>
              <Text style={styles.stepSubtitle}>{getStepInfo().subtitle}</Text>
            </View>
            
            <View style={styles.roleContainer}>
              <TouchableOpacity
                style={[
                  styles.modernRoleButton,
                  role === "Student" && styles.selectedRoleButton,
                  { borderColor: role === "Student" ? "#3b82f6" : "#e2e8f0" }
                ]}
                onPress={() => setRole("Student")}
              >
                <View style={[
                  styles.roleIconContainer,
                  { backgroundColor: role === "Student" ? "#3b82f6" : "#f1f5f9" }
                ]}>
                  <Ionicons 
                    name="school-outline" 
                    size={28} 
                    color={role === "Student" ? "#fff" : "#64748b"} 
                  />
                </View>
                <Text style={[
                  styles.roleButtonText,
                  { color: role === "Student" ? "#3b82f6" : "#64748b" }
                ]}>
                  Student
                </Text>
                <Text style={styles.roleButtonSubtext}>
                  Track your rides and stay connected
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modernRoleButton,
                  role === "Driver" && styles.selectedRoleButton,
                  { borderColor: role === "Driver" ? "#10b981" : "#e2e8f0" }
                ]}
                onPress={() => setRole("Driver")}
              >
                <View style={[
                  styles.roleIconContainer,
                  { backgroundColor: role === "Driver" ? "#10b981" : "#f1f5f9" }
                ]}>
                  <Ionicons 
                    name="car-outline" 
                    size={28} 
                    color={role === "Driver" ? "#fff" : "#64748b"} 
                  />
                </View>
                <Text style={[
                  styles.roleButtonText,
                  { color: role === "Driver" ? "#10b981" : "#64748b" }
                ]}>
                  Driver
                </Text>
                <Text style={styles.roleButtonSubtext}>
                  Manage passengers and routes
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modernRoleButton,
                  role === "Parent" && styles.selectedRoleButton,
                  { borderColor: role === "Parent" ? "#f59e0b" : "#e2e8f0" }
                ]}
                onPress={() => setRole("Parent")}
              >
                <View style={[
                  styles.roleIconContainer,
                  { backgroundColor: role === "Parent" ? "#f59e0b" : "#f1f5f9" }
                ]}>
                  <Ionicons 
                    name="people-outline" 
                    size={28} 
                    color={role === "Parent" ? "#fff" : "#64748b"} 
                  />
                </View>
                <Text style={[
                  styles.roleButtonText,
                  { color: role === "Parent" ? "#f59e0b" : "#64748b" }
                ]}>
                  Parent
                </Text>
                <Text style={styles.roleButtonSubtext}>
                  Monitor your child's journey
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        );

      case 2:
        return (
          <Animated.View 
            style={[
              styles.stepContainer,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
            ]}
          >
            <View style={styles.stepHeader}>
              <View style={[styles.iconContainer, { backgroundColor: getStepInfo().color }]}>
                <Ionicons name={getStepInfo().icon as any} size={32} color="#fff" />
              </View>
              <Text style={styles.stepTitle}>
                {role === "Student" ? "Student ID" : role === "Driver" ? "License Number" : "Contact Number"}
              </Text>
              <Text style={styles.stepSubtitle}>
                {role === "Student" 
                  ? "Your unique student identifier"
                  : role === "Driver" 
                  ? "Your driver's license number"
                  : "Your primary contact number"
                }
              </Text>
            </View>
            
            <View style={styles.inputContainer}>
              <View style={styles.inputWithIcon}>
                <Ionicons 
                  name={role === "Student" ? "school" : role === "Driver" ? "car" : "call"} 
                  size={20} 
                  color="#64748b" 
                  style={styles.inputIcon}
                />
                <TextInput
                  placeholder={
                    role === "Student"
                      ? "e.g., 2024001234"
                      : role === "Driver"
                      ? "e.g., ABC-123-456"
                      : "e.g., +63901234567"
                  }
                  placeholderTextColor="#94a3b8"
                  style={styles.modernInputWithIcon}
                  value={
                    role === "Student"
                      ? studentID
                      : role === "Driver"
                      ? licenseNumber
                      : contactNumber
                  }
                  onChangeText={
                    role === "Student"
                      ? setStudentID
                      : role === "Driver"
                      ? setLicenseNumber
                      : setContactNumber
                  }
                  autoFocus
                />
              </View>
              <Text style={styles.inputHint}>
                {role === "Student" 
                  ? "This ID will be used for check-ins"
                  : role === "Driver" 
                  ? "Must be a valid license number"
                  : "Used for account verification"
                }
              </Text>
            </View>
          </Animated.View>
        );

      case 3:
        return (
          <Animated.View 
            style={[
              styles.stepContainer,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
            ]}
          >
            <View style={styles.stepHeader}>
              <View style={[styles.iconContainer, { backgroundColor: getStepInfo().color }]}>
                <Ionicons name={getStepInfo().icon as any} size={32} color="#fff" />
              </View>
              <Text style={styles.stepTitle}>{getStepInfo().title}</Text>
              <Text style={styles.stepSubtitle}>{getStepInfo().subtitle}</Text>
            </View>
            
            <View style={styles.inputContainer}>
              <View style={styles.inputWithIcon}>
                <Ionicons name="call" size={20} color="#64748b" style={styles.inputIcon} />
                <TextInput
                  placeholder="09xxxxxxxxx"
                  placeholderTextColor="#94a3b8"
                  style={styles.modernInputWithIcon}
                  keyboardType="phone-pad"
                  value={mobile}
                  onChangeText={setMobile}
                  maxLength={11}
                  autoFocus
                />
              </View>
              <Text style={styles.inputHint}>Philippine mobile number format</Text>
              
              {mobile.length > 0 && (
                <View style={styles.validationContainer}>
                  <Ionicons 
                    name={/^09\d{9}$/.test(mobile) ? "checkmark-circle" : "close-circle"} 
                    size={16} 
                    color={/^09\d{9}$/.test(mobile) ? "#10b981" : "#ef4444"} 
                  />
                  <Text style={[
                    styles.validationText,
                    { color: /^09\d{9}$/.test(mobile) ? "#10b981" : "#ef4444" }
                  ]}>
                    {/^09\d{9}$/.test(mobile) ? "Valid format" : "Invalid format"}
                  </Text>
                </View>
              )}
            </View>
          </Animated.View>
        );

      case 4:
        return (
          <Animated.View 
            style={[
              styles.stepContainer,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
            ]}
          >
            <View style={styles.stepHeader}>
              <View style={[styles.iconContainer, { backgroundColor: getStepInfo().color }]}>
                <Ionicons name={getStepInfo().icon as any} size={32} color="#fff" />
              </View>
              <Text style={styles.stepTitle}>{getStepInfo().title}</Text>
              <Text style={styles.stepSubtitle}>{getStepInfo().subtitle}</Text>
            </View>
            
            <View style={styles.inputContainer}>
              <View style={styles.inputWithIcon}>
                <Ionicons name="lock-closed" size={20} color="#64748b" style={styles.inputIcon} />
                <TextInput
                  placeholder="Create password"
                  placeholderTextColor="#94a3b8"
                  secureTextEntry
                  style={styles.modernInputWithIcon}
                  value={password}
                  onChangeText={setPassword}
                  autoFocus
                />
              </View>
              
              <View style={styles.inputWithIcon}>
                <Ionicons name="lock-closed" size={20} color="#64748b" style={styles.inputIcon} />
                <TextInput
                  placeholder="Confirm password"
                  placeholderTextColor="#94a3b8"
                  secureTextEntry
                  style={styles.modernInputWithIcon}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                />
              </View>
              
              {/* Password Strength Indicator */}
              {password.length > 0 && (
                <View style={styles.passwordStrength}>
                  <Text style={styles.strengthLabel}>Password Strength:</Text>
                  <View style={styles.strengthBars}>
                    <View style={[
                      styles.strengthBar,
                      { backgroundColor: password.length >= 2 ? "#ef4444" : "#e5e7eb" }
                    ]} />
                    <View style={[
                      styles.strengthBar,
                      { backgroundColor: password.length >= 4 ? "#f59e0b" : "#e5e7eb" }
                    ]} />
                    <View style={[
                      styles.strengthBar,
                      { backgroundColor: password.length >= 6 ? "#10b981" : "#e5e7eb" }
                    ]} />
                  </View>
                  <Text style={styles.strengthText}>
                    {password.length < 4 ? "Weak" : password.length < 6 ? "Fair" : "Strong"}
                  </Text>
                </View>
              )}

              {/* Password Match Indicator */}
              {confirmPassword.length > 0 && (
                <View style={styles.validationContainer}>
                  <Ionicons 
                    name={password === confirmPassword ? "checkmark-circle" : "close-circle"} 
                    size={16} 
                    color={password === confirmPassword ? "#10b981" : "#ef4444"} 
                  />
                  <Text style={[
                    styles.validationText,
                    { color: password === confirmPassword ? "#10b981" : "#ef4444" }
                  ]}>
                    {password === confirmPassword ? "Passwords match" : "Passwords don't match"}
                  </Text>
                </View>
              )}
            </View>
          </Animated.View>
        );

      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1e40af" />
      
      <Modal animationType="slide" transparent={false} visible={true}>
        <View style={styles.modernModalOverlay}>
          {/* Header */}
          <View style={styles.modernHeader}>
            <TouchableOpacity
              style={styles.modernCancelButton}
              onPress={() => router.replace("/")}
            >
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
            
            <Text style={styles.modernTitle}>Quick Setup</Text>
            
            <View style={styles.headerSpacer} />
          </View>

          {/* Progress Bar */}
          {renderProgressBar()}

          {/* Content */}
          <ScrollView 
            style={styles.contentContainer}
            contentContainerStyle={styles.contentContainerStyle}
            showsVerticalScrollIndicator={false}
          >
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#3b82f6" />
                <Text style={styles.loadingText}>Setting up your account...</Text>
              </View>
            ) : (
              <>
                {renderStepContent()}

                {error ? (
                  <View style={styles.errorContainer}>
                    <Ionicons name="warning" size={20} color="#ef4444" />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}
              </>
            )}
          </ScrollView>

          {/* Bottom Button */}
          {!loading && (
            <View style={styles.bottomContainer}>
              <TouchableOpacity
                style={[
                  styles.modernNextButton,
                  { backgroundColor: getStepInfo().color }
                ]}
                onPress={nextStep}
                disabled={loading}
              >
                <Text style={styles.modernButtonText}>
                  {step < 4 ? "Continue" : "Create Account"}
                </Text>
                <Ionicons 
                  name={step < 4 ? "arrow-forward" : "checkmark"} 
                  size={20} 
                  color="#fff" 
                />
              </TouchableOpacity>
              
              {step > 0 && (
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={() => setStep(step - 1)}
                >
                  <Ionicons name="arrow-back" size={20} color="#64748b" />
                  <Text style={styles.backButtonText}>Back</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1 
  },
  
  // Modern Modal Styles
  modernModalOverlay: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  
  modernHeader: {
    backgroundColor: "#1e40af",
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    elevation: 4,
    shadowColor: "#1e40af",
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  
  modernCancelButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  
  modernTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
  },
  
  headerSpacer: {
    width: 40,
  },
  
  // Progress Bar
  progressContainer: {
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  
  progressBackground: {
    flex: 1,
    height: 6,
    backgroundColor: "#e5e7eb",
    borderRadius: 3,
    marginRight: 12,
  },
  
  progressFill: {
    height: "100%",
    borderRadius: 3,
    transition: "width 0.3s ease",
  },
  
  progressText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748b",
  },
  
  // Content
  contentContainer: {
    flex: 1,
  },
  
  contentContainerStyle: {
    padding: 10,
    paddingBottom: 50,
  },
  
  stepContainer: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  
  stepHeader: {
    alignItems: "center",
    marginBottom: 32,
  },
  
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  
  stepTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1e293b",
    marginBottom: 8,
    textAlign: "center",
  },
  
  stepSubtitle: {
    fontSize: 16,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 24,
  },
  
  // Input Styles
  inputContainer: {
    gap: 10,
  },
  
  modernInput: {
    borderWidth: 2,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: "#1e293b",
    backgroundColor: "#f8fafc",
    fontWeight: "500",
  },
  
  inputWithIcon: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 16,
  },
  
  inputIcon: {
    marginRight: 12,
  },
  
  modernInputWithIcon: {
    flex: 1,
    paddingVertical: 16,
    fontSize: 16,
    color: "#1e293b",
    fontWeight: "500",
  },
  
  inputHint: {
    fontSize: 14,
    color: "#64748b",
    fontStyle: "italic",
  },
  
  // Role Selection
  roleContainer: {
    gap: 16,
  },
  
  modernRoleButton: {
    borderWidth: 2,
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    backgroundColor: "#fff",
    elevation: 1,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  
  selectedRoleButton: {
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    transform: [{ scale: 1.02 }],
  },
  
  roleIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  
  roleButtonText: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  
  roleButtonSubtext: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 20,
  },
  
  // Validation
  validationContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  
  validationText: {
    fontSize: 14,
    fontWeight: "500",
  },
  
  // Password Strength
  passwordStrength: {
    backgroundColor: "#f8fafc",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  
  strengthLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  
  strengthBars: {
    flexDirection: "row",
    gap: 4,
    marginBottom: 8,
  },
  
  strengthBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  
  strengthText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    textAlign: "center",
  },
  
  // Error Styles
  errorContainer: {
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 16,
  },
  
  errorText: {
    flex: 1,
    fontSize: 14,
    color: "#dc2626",
    fontWeight: "500",
  },
  
  // Loading
  loadingContainer: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  
  loadingText: {
    fontSize: 16,
    color: "#64748b",
    fontWeight: "500",
    marginTop: 16,
    textAlign: "center",
  },
  
  // Bottom Container
  bottomContainer: {
    backgroundColor: "#fff",
    padding: 20,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  
  modernNextButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 12,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    gap: 8,
    marginBottom: 12,
  },
  
  modernButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 8,
  },
  
  backButtonText: {
    fontSize: 16,
    color: "#64748b",
    fontWeight: "500",
  },
});