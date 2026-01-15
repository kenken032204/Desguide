import React, { useRef, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Animated,
  StatusBar,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width, height } = Dimensions.get("window");

export function WelcomeScreen() {
  const router = useRouter();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Animation refs
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    checkAutoLogin();
  }, []);

  const checkAutoLogin = async () => {
    try {
      // Check if user credentials are stored
      const credentialsString = await AsyncStorage.getItem("userCredentials");
      
      if (credentialsString) {
        const credentials = JSON.parse(credentialsString);
        
        // If user is logged in, redirect to dashboard
        if (credentials.isLoggedIn && credentials.userId) {
          // Optional: You can also verify the user still exists in the database
          router.replace("(tabs)/dashboard");
          return;
        }
      }
      
      // No stored credentials, show welcome screen
      setIsCheckingAuth(false);
    } catch (error) {
      console.error("Error checking auto-login:", error);
      setIsCheckingAuth(false);
    }
  };

  useEffect(() => {
    if (!isCheckingAuth) {
      Animated.stagger(300, [
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 800,
          useNativeDriver: true,
        }),
      ]).start();

      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.05, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [isCheckingAuth]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#667eea" />
      <LinearGradient colors={["#667eea", "#764ba2"]} style={styles.gradient}>
        {isCheckingAuth ? (
          // Show loading spinner while checking authentication
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        ) : (
          <>
            {/* Logo */}
            <Animated.View style={[styles.logoWrapper, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
              <View style={styles.logoCircle}>
                <Ionicons name="car-sport" size={150} color="#fff" />
              </View>
            </Animated.View>

            {/* Text Section */}
            <Animated.View style={[styles.textContainer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
              <Text style={styles.title}>DesGuide</Text>
              <Text style={styles.subtitle}>Your Destination Companion</Text>
              <Text style={styles.description}>
                Safe, reliable, and convenient transportation for students and families.
              </Text>
            </Animated.View>

            {/* Features */}
            <Animated.View style={[styles.featuresContainer, { opacity: fadeAnim }]}>
              <FeatureItem icon="shield-checkmark" text="Safe & Secure" />
              <FeatureItem icon="time" text="Real-time Tracking" />
              <FeatureItem icon="notifications" text="Smart Notifications" />
            </Animated.View>

            {/* Buttons */}
            <View style={styles.buttonContainer}>
              <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <TouchableOpacity style={styles.getStartedButton} onPress={() => router.replace("/quickstart")}>
                  <LinearGradient colors={["#ff6b6b", "#ee5a24"]} style={styles.buttonGradient}>
                    <Ionicons name="rocket" size={22} color="#fff" />
                    <Text style={styles.buttonText}>Get Started</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>

              <TouchableOpacity style={styles.loginButton} onPress={() => router.replace("/login")}>
                <Ionicons name="log-in-outline" size={20} color="#fff" />
                <Text style={styles.loginText}>Already have an account? Login</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </LinearGradient>
    </SafeAreaView>
  );
}

function FeatureItem({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.featureItem}>
      <View style={styles.featureIcon}>
        <Ionicons name={icon as any} size={20} color="#fff" />
      </View>
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  gradient: { flex: 1, justifyContent: "space-between", alignItems: "center", paddingVertical: 100, paddingHorizontal: 30 },
  logoWrapper: { marginBottom: 5 },
  logoCircle: {
    justifyContent: "center",
    alignItems: "center",
  },
  textContainer: { alignItems: "center", marginBottom: 10 },
  title: { fontSize: 42, fontWeight: "700", color: "#fff", textAlign: "center", marginBottom: 10, textShadowColor: "rgba(0,0,0,0.3)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 },
  subtitle: { fontSize: 18, color: "rgba(255,255,255,0.9)", textAlign: "center", marginBottom: 10, fontWeight: "500" },
  description: { fontSize: 16, color: "rgba(255,255,255,0.8)", textAlign: "center", lineHeight: 22, paddingHorizontal: 15 },
  featuresContainer: { flexDirection: "row", justifyContent: "space-around", width: "100%", marginVertical: 5 },
  featureItem: { alignItems: "center", flex: 1 },
  featureIcon: { width: 50, height: 50, borderRadius: 25, backgroundColor: "rgba(255,255,255,0.2)", justifyContent: "center", alignItems: "center", marginBottom: 6 },
  featureText: { color: "#fff", fontSize: 12, fontWeight: "600", textAlign: "center" },
  
  buttonContainer: {
    width: "100%",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  
  getStartedButton: {
    borderRadius: 15,
    overflow: "hidden",
    marginBottom: 15,
    shadowColor: "#ff6b6b",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
    width: "100%",
    maxWidth: 350,
  },
  
  buttonGradient: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 30,
  },
  
  buttonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    marginLeft: 8,
  },
  
  loginButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    width: "100%",
    maxWidth: 350,
  },
  
  loginText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "500",
    marginLeft: 8,
  },
  
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  
  loadingText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
    marginTop: 15,
  },
  
});

export default WelcomeScreen;