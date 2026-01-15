import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Alert, Platform } from "react-native";
import { db } from "../../config/firebaseConfig";
import { ref, update } from "firebase/database";

export async function registerForPushNotificationsAsync(userId: string) {
  if (!Device.isDevice) {
    Alert.alert("Physical device required", "Push notifications require a real device.");
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    Alert.alert("Permission denied", "Cannot get push token!");
    return null;
  }

  const token = (await Notifications.getExpoPushTokenAsync()).data;
  console.log("Expo Push Token:", token);

  // Save the token to Firebase
  if (userId && token) {
    await update(ref(db, `users/${userId}`), { expoPushToken: token });
  }

  // Android notification channel setup
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  return token;
}

// ✅ Optional helper to send a push notification
export async function sendPushNotification(token: string, title: string, body: string) {
  if (!token) return;

  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: token,
      sound: "default",
      title,
      body,
    }),
  });
}

// Notify student if assigned driver is unavailable
export async function notifyStudentDriverUnavailable(studentToken: string, driverName: string) {
    if (!studentToken) return;
  
    await sendPushNotification(
      studentToken,
      "🚫 Driver Unavailable",
      `Your assigned driver, ${driverName}, is not available for carpool today.`
    );
  }
  