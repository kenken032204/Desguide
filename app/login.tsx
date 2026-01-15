import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ScrollView,
} from "react-native";
import { db } from "../config/firebaseConfig";
import { ref, get } from "firebase/database";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

export function LoginScreen() {
  const router = useRouter();
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [showPassword, setShowPassword] = useState(false);

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};
    if (!id.trim()) newErrors.id = "ID is required";
    if (!password.trim()) newErrors.password = "Password is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => {
    if (!validateForm()) return;
    setLoading(true);

    try {
      const snapshot = await get(ref(db, `users/${id}`));
      if (snapshot.exists()) {
        const user = snapshot.val();
        if (user.password === password) {
          // Store user profile
          await AsyncStorage.setItem("userProfile", JSON.stringify(user));
          
          // Store login credentials for auto sign-in
          await AsyncStorage.setItem("userCredentials", JSON.stringify({
            userId: id,
            isLoggedIn: true,
            lastLogin: new Date().toISOString()
          }));
          
          Alert.alert("✅ Login Successful!", `Welcome back, ${user.fullName}!`, [
            { text: "Continue", onPress: () => router.replace("(tabs)/dashboard") },
          ]);
        } else {
          Alert.alert("❌ Login Failed", "Incorrect password");
        }
      } else {
        Alert.alert("❌ Login Failed", "User not found");
      }
    } catch (error) {
      Alert.alert("⚠️ Error", "Something went wrong. Check your internet connection.");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const clearError = (field: string) => {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#667eea" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.logoContainer}>
            <Ionicons name="car-sport" size={80} color="#fff" />
            <Text style={styles.title}>Login to Desguide</Text>
          </View>

          <View style={styles.form}>
            {/* ID Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>User ID</Text>
              <View style={[styles.inputWrapper, errors.id && styles.inputError]}>
                <Ionicons name="person-outline" size={20} color="#6c757d" />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your ID"
                  placeholderTextColor="#9ca3af"
                  value={id}
                  onChangeText={(text) => {
                    setId(text);
                    clearError("id");
                  }}
                  autoCapitalize="none"
                />
              </View>
              {errors.id && <Text style={styles.error}>{errors.id}</Text>}
            </View>

            {/* Password Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Password</Text>
              <View style={[styles.inputWrapper, errors.password && styles.inputError]}>
                <Ionicons name="lock-closed-outline" size={20} color="#6c757d" />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your password"
                  placeholderTextColor="#9ca3af"
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    clearError("password");
                  }}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons
                    name={showPassword ? "eye-outline" : "eye-off-outline"}
                    size={20}
                    color="#6c757d"
                  />
                </TouchableOpacity>
              </View>
              {errors.password && <Text style={styles.error}>{errors.password}</Text>}
            </View>

            {/* Login Button */}
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Sign In</Text>
              )}
            </TouchableOpacity>

            {/* Create Account Button */}
            <TouchableOpacity
              style={styles.createAccountButton}
              onPress={() => router.push("/quickstart")}
            >
              <Text style={styles.createAccountText}>Create Account</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#667eea" },
  scrollContent: { flexGrow: 1, justifyContent: "center", padding: 30 },
  logoContainer: { alignItems: "center", marginBottom: 40 },
  title: {
    color: "#fff",
    fontSize: 32,
    fontWeight: "700",
    marginTop: 20,
    textAlign: "center",
  },
  form: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 25,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  inputContainer: { marginBottom: 20 },
  label: { fontSize: 16, fontWeight: "600", color: "#374151", marginBottom: 6 },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
  },
  inputError: { borderColor: "#dc3545" },
  input: { flex: 1, marginLeft: 8, fontSize: 16, color: "#374151" },
  error: { color: "#dc3545", marginTop: 4, fontSize: 14 },
  button: {
    backgroundColor: "#28a745",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 10,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  createAccountButton: {
    marginTop: 12,
    alignItems: "center",
    paddingVertical: 12,
  },
  createAccountText: {
    color: "#667eea",
    fontSize: 16,
    fontWeight: "600",
  },
  
});

export default LoginScreen;