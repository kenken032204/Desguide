import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ActivityIndicator, View } from "react-native";

export default function Layout() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const checkUser = async () => {
      try {
        const savedUser = await AsyncStorage.getItem("userProfile");
        if (savedUser) {
          setUser(JSON.parse(savedUser));
        } else {
          router.replace("/login"); // redirect if no user
        }
      } catch (error) {
        console.error("Error checking user:", error);
        router.replace("/login");
      } finally {
        setLoading(false);
      }
    };
    checkUser();
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!user) return null; // no tabs until user is verified

  return (
    <SafeAreaProvider>
      <Tabs
        screenOptions={({ route }) => {
          const icons: Record<string, { focused: string; unfocused: string }> = {
            dashboard: { focused: "home", unfocused: "home-outline" },
            profile: { focused: "person", unfocused: "person-outline" },
            camera: { focused: "camera", unfocused: "camera-outline" },
          };

          const icon = icons[route.name] || {
            focused: "ellipse",
            unfocused: "ellipse-outline",
          };

          return {
            headerShown: false,
            tabBarShowLabel: false,
            tabBarIcon: ({ focused, color, size }) => (
              <Ionicons
                name={focused ? icon.focused : icon.unfocused}
                size={size}
                color={color}
              />
            ),
            tabBarActiveTintColor: "#007AFF",
            tabBarInactiveTintColor: "gray",
            tabBarStyle: {
              elevation: 0,
              shadowOpacity: 0,
              borderTopWidth: 0,
              backgroundColor: "white",
              flexDirection: "row",
              justifyContent: "space-around",
              alignItems: "center",
            },
          };
        }}
      >
        <Tabs.Screen name="dashboard" />
        <Tabs.Screen name="camera" />
      </Tabs>
    </SafeAreaProvider>
  );
}
