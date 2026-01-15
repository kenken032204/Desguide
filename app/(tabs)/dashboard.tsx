import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  Alert,
  StyleSheet,
  Image,
  ScrollView,
  Animated,
  SafeAreaView,
  Dimensions,
  StatusBar,
  Linking,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import QRCode from "react-native-qrcode-svg";
import { db } from "../../config/firebaseConfig";
import { ref, onValue, set, get, query, orderByChild, limitToLast, equalTo, push} from "firebase/database";
import * as Location from "expo-location";
import MapView, { Marker } from "react-native-maps";
import AnimatedHighlight from "../components/AnimatedHighlight";
import { registerForPushNotificationsAsync, sendPushNotification, notifyStudentDriverUnavailable } from "../components/Notifications";

const { width } = Dimensions.get('window');

export default function DashboardScreen() {
  const [role, setRole] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [showQR, setShowQR] = useState(false);
  const [isModalVisible, setModalVisible] = useState(false);
  const [permanentAddressSaved, setPermanentAddressSaved] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [isStudentModalVisible, setStudentModalVisible] = useState(false);
  const [studentDataForQR, setStudentDataForQR] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [recentHistory, setRecentHistory] = useState<any[]>([]);
  const [isDrivingModeVisible, setDrivingModeVisible] = useState(false);
  const [schoolLocation, setSchoolLocation] = useState<{latitude: number, longitude: number} | null>(null);
  const [tripDirection, setTripDirection] = useState<"toSchool" | "toHome">("toSchool");
  const [driverLocation, setDriverLocation] = useState<{latitude: number, longitude: number} | null>(null);
  const [nearestStudent, setNearestStudent] = useState<NearestStudent | null>(null);
  const [showRecent, setShowRecent] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  
  useEffect(() => {
    const pulse = () => {
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.05, // slightly bigger
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1, // back to original
          duration: 500,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setTimeout(pulse, 5000); // wait 5 seconds before next pulse
      });
    };

    pulse();
  }, [scaleAnim]);

  // Student
  const [rideToday, setRideToday] = useState(null); // null = not chosen, true/false = yes/no

  // Driver
  const [availableToday, setAvailableToday] = useState<boolean | null>(null);

  useEffect(() => {
    if (profile?.id) {
      registerForPushNotificationsAsync(profile.id);
    }
  }, [profile]);
  
  interface UserProfile {
    fullName: string;
    id: string;
    mobile: string;
    permanentAddress: string;
    role: string;
    status?: string;
    checkInStatus: boolean;
    checkInInfo?: {
      status: boolean;
      driverId: string;
      driverName?: string;
      timestamp?: number;
    } | null;
    assignedDriverName: string;
    expoPushToken: string;
  }

  interface Student {
    fullName: string;
    id: string;
    mobile: string;
    permanentAddress: string;
    checkInInfo?: {
      status: boolean;
      driverId: string;
      driverName?: string;
      timestamp?: number;
    } | null;
    checkInStatus: boolean;
    latitude: number | null;
    longitude: number | null;
  }
  
  interface NearestStudent extends Student {
    distanceToDestination: number;
  }

  const SCHOOL_COORDINATES = {
    latitude: 8.470648,
    longitude: 124.679594,
    name: "Gusa Regional Science High School"
  };


  // fetch day available

  useEffect(() => {
    const fetchAvailability = async () => {
      if (!profile?.id) return;
  
      const dbRef = ref(db, `users/${profile.id}/availabilityInfo`);
      const snapshot = await get(dbRef);
  
      if (snapshot.exists()) {
        const data = snapshot.val();
        const todayDate = new Date().toISOString().split("T")[0];
  
        if (data.lastUpdated === todayDate) {
          // Same day → keep current status
          setAvailableToday(data.availableToday);
        } else {
          // New day → reset so driver must choose again
          setAvailableToday(null);
        }
      } else {
        setAvailableToday(null);
      }
    };
  
    fetchAvailability();
  }, [profile]);
  
  useEffect(() => {
    setSchoolLocation(SCHOOL_COORDINATES);
  }, []);

  // Helper function to geocode address with retry logic
  const geocodeAddressWithRetry = async (addressToGeocode: string, retries = 2): Promise<{latitude: number, longitude: number} | null> => {
    for (let i = 0; i <= retries; i++) {
      try {
        const geocoded = await Location.geocodeAsync(addressToGeocode);
        if (geocoded && geocoded.length > 0 && geocoded[0].latitude && geocoded[0].longitude) {
          return {
            latitude: geocoded[0].latitude,
            longitude: geocoded[0].longitude
          };
        }
      } catch (error) {
        if (i === retries) {
          return null;
        }
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    return null;
  };

  useEffect(() => {
    if (!profile?.id) return;

    const historyRef = ref(db, `${profile.id}/checkInHistory`);
    const unsubscribe = onValue(historyRef, async (snapshot) => {
      if (snapshot.exists()) {
        const allData = snapshot.val();
        const lastEntry = Object.values(allData).slice(-1)[0] as any;

        await Notifications.scheduleNotificationAsync({
          content: {
            title: "🚌 Check-in Successful",
            body: `Hi ${lastEntry.studentName}, you just checked in.`,
          },
          trigger: null,
        });
      }
    });

    return () => unsubscribe();
  }, [profile?.id]);

  
  useEffect(() => {
    (async () => {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission required", "Enable notifications in settings");
      }
    })();
  }, []);

  async function scheduleNotification() {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "👋 Dropped Off",
        body: "You've been dropped off, Thank you for riding!",
      },
      trigger: { seconds: 5 },
    });
  }
  
  useEffect(() => {
    const studentsRef = ref(db, "users");
  
    const unsubscribe = onValue(studentsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const studentsArray = Object.values(data);
  
        const onlyStudents: Student[] = studentsArray
          .filter((user: any) => user.role === "Student")
          .map((student: any): Student => ({
            fullName: student.fullName ?? "",
            id: student.id ?? "",
            mobile: student.mobile ?? "",
            permanentAddress: student.permanentAddress ?? "",
            checkInInfo: student.checkInInfo ?? null,
            checkInStatus: student.checkInStatus ?? false,
            latitude: student.latitude ?? null,
            longitude: student.longitude ?? null
          }));
  
        setStudents(onlyStudents);
      } else {
        setStudents([]);
      }
    });
  
    return () => unsubscribe();
  }, []);
  
  useEffect(() => {
    if (role === "Student" && profile?.id) {
      
      const historyRef = ref(db, `users/${profile.id}/checkInHistory`);
      
      const unsubscribe = onValue(historyRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          const historyArray = Object.values(data);
          const sorted = historyArray.sort(
            (a: any, b: any) => b.timestamp - a.timestamp
          );
          setRecentHistory(sorted.slice(0, 5));
        } else {
          setRecentHistory([]);
        }
      }, (error) => {
        setRecentHistory([]);
      });

      return () => unsubscribe();
    }
  }, [role, profile?.id]);

  const handleDropOff = async (student: any) => {
    try {
      const historyId = Date.now().toString();
      
      const historyData = {
        driverId: profile?.id || "unknown",
        driverName: profile?.fullName || "Unknown Driver",
        status: "Dropped Off",
        timestamp: Date.now(),
        location: student.permanentAddress || "Unknown Location",
        action: "dropOff"
      };
  
      // Save drop-off history to Firebase
      await set(ref(db, `users/${student.id}/checkInHistory/${historyId}`), historyData);
      
      // Update student's check-in status
      await set(ref(db, `users/${student.id}/checkInStatus`), false);
      await set(ref(db, `users/${student.id}/checkInInfo`), null);
  
      Alert.alert("✅ Success", `${student.fullName} has been dropped off.`);
      
      // ========== REFRESH NEAREST STUDENT IMMEDIATELY ==========
      if (isDrivingModeVisible && driverLocation) {
        // Filter out the student we just dropped off
        const remainingPassengers = filteredStudents.filter(
          (s: Student) => 
            s.id !== student.id &&  // Exclude the dropped student
            s.checkInInfo?.status && 
            s.checkInInfo.driverId === profile?.id
        );
  
        // If no passengers left, clear the nearest student
        if (remainingPassengers.length === 0) {
          setNearestStudent(null);
          return;
        }
  
        // Find the nearest student from remaining passengers
        let nearest: NearestStudent | null = null;
        let shortestDistance = Infinity;
  
        remainingPassengers.forEach((s: Student) => {
          if (s.latitude && s.longitude && schoolLocation) {
            let distance: number;
            
            // Calculate distance based on trip direction
            if (tripDirection === "toSchool") {
              // Distance from student's home to school
              distance = calculateDistance(
                s.latitude,
                s.longitude,
                schoolLocation.latitude,
                schoolLocation.longitude
              );
            } else {
              // Distance from driver's current location to student's home
              distance = calculateDistance(
                driverLocation.latitude,
                driverLocation.longitude,
                s.latitude,
                s.longitude
              );
            }
  
            // Update nearest if this student is closer
            if (distance < shortestDistance) {
              shortestDistance = distance;
              nearest = { 
                ...s, 
                distanceToDestination: distance 
              } as NearestStudent;
            }
          }
        });
  
        // Update the nearest student state
        setNearestStudent(nearest);
      }
      // ========== END REFRESH LOGIC ==========
      
    } catch (error) {
      Alert.alert("Error", "Failed to drop off student.");
    }
  };


useEffect(() => {
  if (role !== "Driver") return;

  let subscription: any;
  const startWatching = async () => {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return;

    subscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Highest,
        timeInterval: 2000,                 
        distanceInterval: 5,                
      },
      (loc) => {
        const { latitude, longitude } = loc.coords;
        setDriverLocation({ latitude, longitude });
    
        if (profile?.id) {
          set(ref(db, `users/${profile.id}/latitude`), latitude);
          set(ref(db, `users/${profile.id}/longitude`), longitude);
        }
      }
    );
    
  };

  startWatching();
  return () => subscription && subscription.remove();
}, [role, profile?.id]);


  useEffect(() => {
    const loadProfile = async () => {
      try {
        const data = await AsyncStorage.getItem("userProfile");
        if (!data) {
          setLoading(false);
          return;
        }
    
        const profileData = JSON.parse(data);
        const savedAddress = await AsyncStorage.getItem("permanentAddress");
        const snap = await get(ref(db, `users/${profileData.id}`));
        const userFromDb = snap.exists() ? snap.val() : {};
    
        const addr = savedAddress ?? userFromDb.permanentAddress ?? "";
    
        const dataObj: UserProfile = {
          ...profileData,
          fullName: profileData.fullName || "",
          id: profileData.id || "",
          mobile: profileData.mobile || "",
          permanentAddress: addr,
          role: profileData.role || "",
          status: userFromDb.checkedInStatus ? "Riding..." : "Still in School",
          checkInStatus: userFromDb.checkInStatus || false,
          checkInInfo: userFromDb.checkInInfo || null,
        };
    
        setProfile(dataObj);
        setRole(dataObj.role);
        setAddress(addr);
        setStudentDataForQR(profileData.id);
        setShowQR(true);
      } catch (e) {
      } finally {
        setLoading(false);
      }
    };
    
  
    loadProfile();
  }, []);

  const handleUseCurrentLocation = async () => {
  try {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Denied", "Allow location access to use GPS.");
      return;
    }

    let loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.BestForNavigation
    });
    const { latitude, longitude } = loc.coords;

    let geocode = await Location.reverseGeocodeAsync({
      latitude,
      longitude,
    });

    let addr = "";
    if (geocode.length > 0) {
      const parts = [
        geocode[0].street,
        geocode[0].streetNumber,
        geocode[0].city,
        geocode[0].region,
        geocode[0].country
      ].filter(Boolean);
      addr = parts.join(", ");
    } else {
      // ❌ Don't round for storage. Only use toFixed for display (if needed)
      addr = `${latitude}, ${longitude}`;
    }

    setAddress(addr);

    // ✅ Save raw numbers (full precision) in Firebase
    if (profile?.id) {
      await set(ref(db, `users/${profile.id}/latitude`), latitude);
      await set(ref(db, `users/${profile.id}/longitude`), longitude);
      await set(ref(db, `users/${profile.id}/permanentAddress`), addr);
    }

    // ✅ Use .toFixed(6) only for display
    Alert.alert(
      "GPS Location Set", 
      `Your current location has been captured.\n\nCoordinates: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
    );
  } catch (error) {
    Alert.alert("Error", "Unable to fetch your location. Please check your GPS settings.");
  }
};


  const generateQRFromFirebase = async (userId: string) => {
    try {
      const snapshot = await get(ref(db, `users/${userId}`));
      if (snapshot.exists()) {
        setStudentDataForQR(userId);
        setShowQR(true);
      } else {
        Alert.alert("Error", "No user data found in Firebase.");
      }
    } catch (error) {
      console.error("QR Generation Error:", error);
    }
  };

  const handleSavePermanentAddress = async () => {
    try {
      if (!address || !address.trim()) {
        Alert.alert("Error", "Please enter a valid address");
        return;
      }

      const trimmedAddress = address.trim();
      await AsyncStorage.setItem("permanentAddress", trimmedAddress);
  
      // Try to geocode the address
      const coordinates = await geocodeAddressWithRetry(trimmedAddress);
      
      if (!coordinates) {
        Alert.alert(
          "⚠️ Unable to Geocode Address",
          "We couldn't find exact coordinates for this address. Please:\n\n1. Check if the address is correct\n2. Try adding more details (street number, city, region)\n3. Use the 'Use GPS' button for accurate location\n\nYou can still save this address, but distance calculations won't work without coordinates.",
          [
            { text: "Cancel", style: "cancel" },
            { 
              text: "Save Anyway", 
              onPress: async () => {
                if (profile?.id) {
                  await set(ref(db, `users/${profile.id}/permanentAddress`), trimmedAddress);
                }
                setModalVisible(false);
              }
            }
          ]
        );
        return;
      }
  
      // Save address and coordinates to Firebase
      if (profile?.id) {
        await set(ref(db, `users/${profile.id}/permanentAddress`), trimmedAddress);
        await set(ref(db, `users/${profile.id}/latitude`), coordinates.latitude);
        await set(ref(db, `users/${profile.id}/longitude`), coordinates.longitude);
      }
  
      await generateQRFromFirebase(profile.id);
      setPermanentAddressSaved(true);
      setModalVisible(false);
  
      const dataObj = {
        fullName: profile?.fullName || "",
        id: profile?.id || "",
        mobile: profile?.mobile || "",
        permanentAddress: trimmedAddress,
        role: profile?.role || "",
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
      };
  
      setStudentDataForQR(profile?.id || "");
      setShowQR(true);
  
      Alert.alert(
        "✅ Success", 
        `Address and coordinates saved!\n\nLocation: ${coordinates.latitude.toFixed(6)}, ${coordinates.longitude.toFixed(6)}`
      );
    } catch (error) {
      Alert.alert("Error", "Failed to save address. Please try again.");
    }
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    return distance;
  };

  const filteredStudents: Student[] = useMemo(() => {
    return students
      .filter((student) =>
        (student.fullName ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (student.id ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (student.mobile ?? "").toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => {
        if (
          role === "Driver" &&
          driverLocation &&
          a.latitude && a.longitude &&
          b.latitude && b.longitude
        ) {
          let distanceA: number, distanceB: number;
  
          // Compare by driver's current location, not just school
          distanceA = calculateDistance(
            driverLocation.latitude,
            driverLocation.longitude,
            a.latitude,
            a.longitude
          );
  
          distanceB = calculateDistance(
            driverLocation.latitude,
            driverLocation.longitude,
            b.latitude,
            b.longitude
          );
  
          return distanceA - distanceB;
        }
  
        return (a.fullName ?? "").localeCompare(b.fullName ?? "");
      });
  }, [students, search, role, driverLocation]); 
  
const driverPassengers = filteredStudents.filter(
  (student) =>
    student.checkInInfo?.status === true &&
    student.checkInInfo?.driverId === profile?.id
);

useEffect(() => {
  if (isDrivingModeVisible && driverLocation) {
    const nearest = findNearestStudent();
    setNearestStudent(nearest);
  }
}, [isDrivingModeVisible, driverLocation, tripDirection]);

  
  const handleStudentPress = (student: any) => {
    setSelectedStudent(student);
    setStudentModalVisible(true);
  };

  const getRoleIcon = () => {
    switch (role) {
      case "Student": return "🎓";
      case "Driver": return "🚌";
      case "Parent": return "👨‍👩‍👧‍👦";
      default: return "👤";
    }
  };

  const findNearestStudent = (): NearestStudent | null => {
    const currentPassengers = filteredStudents.filter(
      (student: Student) => 
        student.checkInInfo?.status && 
        student.checkInInfo.driverId === profile?.id
    );
  
    if (currentPassengers.length === 0 || !driverLocation) return null;
  
    let nearest: NearestStudent | null = null;
    let shortestDistance = Infinity;
  
    currentPassengers.forEach((student: Student) => {
      if (student.latitude && student.longitude) {
        let distance: number;
  
        if (tripDirection === "toSchool" && schoolLocation) {
          // Distance from driver to school (not student to school!)
          distance = calculateDistance(
            driverLocation.latitude,
            driverLocation.longitude,
            schoolLocation.latitude,
            schoolLocation.longitude
          );
        } else {
          // Distance from driver to student's home
          distance = calculateDistance(
            driverLocation.latitude,
            driverLocation.longitude,
            student.latitude,
            student.longitude
          );
        }
  
        if (distance < shortestDistance) {
          shortestDistance = distance;
          nearest = { 
            ...student, 
            distanceToDestination: distance 
          } as NearestStudent;
        }
      }
    });
  
    return nearest;
  };
  
  const getStatusIcon = (status?: string) => {
    const safeStatus = status ?? "";
    return safeStatus === "Checked In" || safeStatus.includes("Riding") ? "🚌" : "🏫";
  };

  const handleRideTodayCheckIn = async () => {
    if (!profile?.id) return;
  
    try {
      const todayDate = new Date().toISOString().split("T")[0];
      const studentRef = ref(db, `users/${profile.id}`);
      const snapshot = await get(studentRef);
  
      if (!snapshot.exists()) {
        Alert.alert("⚠️ Not Found", "Your profile was not found in the database.");
        return;
      }
  
      const studentData = snapshot.val();
      const assignedDriverId = studentData.assignedDriverId || null;
      const assignedDriverName = studentData.assignedDriverName || "Your Driver";
  
      // 🔒 Check if already checked in today
      if (
        studentData.checkInInfo &&
        studentData.checkInInfo.lastCheckInDate === todayDate
      ) {
        Alert.alert("✅ Already Checked In", "You have already checked in today.");
        return;
      }
  
      // 🧭 Check if student has assigned driver
      if (!assignedDriverId || !assignedDriverName) {
        Alert.alert("⚠️ No Assigned Driver", "You don't have a driver assigned yet.");
        return;
      }
  
      // 🔍 Check if driver is available today
      const driverRef = ref(db, `users/${assignedDriverId}/availabilityInfo`);
      const driverSnapshot = await get(driverRef);
      const driverData = driverSnapshot.exists() ? driverSnapshot.val() : null;
      const driverAvailable = driverData?.availableToday || false;
      const driverDate = driverData?.lastUpdated || "";
  
      if (!driverAvailable || driverDate !== todayDate) {
        Alert.alert(
          "🚫 Driver Unavailable",
          `${assignedDriverName} is not available for carpool today. Please wait until they’re active.`
        );
        return;
      }

      setProfile(prev => prev ? {
        ...prev,
        checkInStatus: true,
        checkInInfo: {
          status: true,
          driverId: assignedDriverId,
          driverName: assignedDriverName,
          timestamp: new Date().toISOString(),
        },
      } : prev);
      
      setRideToday(true);      
      
      // ✅ Proceed with check-in if driver is available
      await set(ref(db, `users/${profile.id}/checkInInfo`), {
        status: true,
        driverId: assignedDriverId,
        driverName: assignedDriverName,
        timestamp: new Date().toISOString(),
        lastCheckInDate: todayDate,
      });
  
      await set(ref(db, `users/${profile.id}/checkInStatus`), true);
  
      const historyRef = push(ref(db, `users/${profile.id}/checkInHistory`));
      await set(historyRef, {
        action: "checked_in",
        driverId: assignedDriverId,
        driverName: assignedDriverName,
        timestamp: new Date().toISOString(),
        status: "Checked In",
      });
  
      setRideToday(true);
      Alert.alert("✅ Check-In Successful", "You are now checked in for today's ride!");
    } catch (error) {
      console.error(error);
      Alert.alert("❌ Error", "Failed to check in. Please try again.");
    }
  };
  
   // Handle Driver Availability
const handleRideAvailable = async (isAvailable: boolean) => {
  if (!profile?.id) {
    Alert.alert("Error", "User profile not found.");
    return;
  }

  try {
    const todayDate = new Date().toISOString().split("T")[0]; // e.g. "2025-11-02"

    // Update driver availability in Firebase
    await set(ref(db, `users/${profile.id}/availabilityInfo`), {
      availableToday: isAvailable,
      lastUpdated: todayDate,
    });

    setAvailableToday(isAvailable);

    // Notify students if driver is unavailable
    if (!isAvailable) {
      // Fetch all students assigned to this driver
      const studentsSnapshot = await get(ref(db, "users"));
      if (studentsSnapshot.exists()) {
        const allUsers = studentsSnapshot.val();
        Object.values(allUsers).forEach(async (user: any) => {
          if (user.role === "Student" && user.assignedDriverId === profile.id) {
            // Send push notification
            if (user.expoPushToken) {
              await notifyStudentDriverUnavailable(user.expoPushToken, profile.fullName);
            }
          }
        });
      }
    }

    Alert.alert(
      "Driver Status Updated",
      isAvailable
        ? "✅ You are now marked as AVAILABLE for carpool."
        : "🚫 You are now marked as NOT AVAILABLE."
    );
  } catch (error) {
    console.error("Error updating availability:", error);
    Alert.alert("Error", "Failed to update your availability.");
  }
};
  
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1e40af" />
      {/* Modern Header with Gradient Effect */}
      <View style={styles.modernHeader}>
        <View style={styles.headerContent}>
          <View style={styles.userSection}>
            <View style={styles.avatarContainer}>
              <Text style={styles.avatarText}>
                {profile?.fullName?.charAt(0) || "U"}
              </Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.welcomeText}>Welcome back,</Text>
              <Text style={styles.userName}>{profile?.fullName || "User"}</Text>
            </View>
          </View>
          <View style={styles.roleChip}>
            <Text style={styles.roleIcon}>{getRoleIcon()}</Text>
            <Text style={styles.roleText}>{role || "Loading..."}</Text>
          </View>
        </View>
        
        {/* Decorative Elements */}
        <View style={styles.headerDecoration}>
          <View style={[styles.decorCircle, { top: -20, right: -20 }]} />
          <View style={[styles.decorCircle, { top: 40, right: -40, opacity: 0.3 }]} />
        </View>
      </View>

      <ScrollView
        style={styles.mainContent}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 80 }}
      >
        {role === "Driver" && (
        <View style={[styles.modernCard, { marginVertical: 15, padding: 20 }]}>
          <Text style={[styles.cardTitle, { textAlign: "center" }]}>
            Are you available for carpool?
          </Text>

          {availableToday === null ? (
  <View
    style={{
      flexDirection: "row",
      justifyContent: "center",
      marginVertical: 15,
    }}
  >
    <TouchableOpacity
      style={[
        styles.modernButton,
        {
          backgroundColor: "#2ecc71",
          flex: 1,
          marginRight: 8,
          borderRadius: 12,
          paddingVertical: 10,
        },
      ]}
      onPress={() => handleRideAvailable(true)}
    >
      <Text
        style={{
          color: "white",
          fontWeight: "600",
          textAlign: "center",
          fontSize: 16,
        }}
      >
        I'm Available
      </Text>
    </TouchableOpacity>

    <TouchableOpacity
      style={[
        styles.modernButton,
        {
          backgroundColor: "#ef4444",
          flex: 1,
          marginLeft: 8,
          borderRadius: 12,
          paddingVertical: 10,
        },
      ]}
      onPress={() => handleRideAvailable(false)}
    >
      <Text
        style={{
          color: "white",
          fontWeight: "600",
          textAlign: "center",
          fontSize: 16,
        }}
      >
        Not Today
      </Text>
    </TouchableOpacity>
  </View>
) : (
  <AnimatedHighlight
    label={
      availableToday
        ? "Available for carpool today"
        : "Not available for carpool"
    }
    color={availableToday ? "#10b981" : "#ef4444"}
    icon={availableToday ? "✅" : "🚫"}
  />  
)}

<TouchableOpacity
  onPress={() => setAvailableToday(null)} // reset state
  style={{
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 18,
  }}
  activeOpacity={0.8}
>
  <Text style={{ color: "#000", fontWeight: "600", textAlign: "center" }}>Edit Choice</Text>
</TouchableOpacity>


          {/* Trip Direction Buttons */}
          {availableToday && (
            <View
              style={{
                marginTop: 25,
                paddingTop: 10,
                borderTopColor: "#e5e7eb",
                borderTopWidth: 1,
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  textAlign: "center",
                  marginBottom: 10,
                  color: "#374151",
                }}
              >
                🗺️ Current Trip Direction
              </Text>

              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <TouchableOpacity
                  style={[
                    {
                      flex: 1,
                      borderRadius: 12,
                      paddingVertical: 10,
                      alignItems: "center",
                      backgroundColor:
                        tripDirection === "toSchool" ? "#3b82f6" : "#e5e7eb",
                    },
                  ]}
                  onPress={() => setTripDirection("toSchool")}
                >
                  <Text
                    style={{
                      color: tripDirection === "toSchool" ? "white" : "#374151",
                      fontWeight: "600",
                      fontSize: 15,
                    }}
                  >
                    🏫 To School
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    {
                      flex: 1,
                      borderRadius: 12,
                      paddingVertical: 10,
                      alignItems: "center",
                      backgroundColor:
                        tripDirection === "toHome" ? "#3b82f6" : "#e5e7eb",
                    },
                  ]}
                  onPress={() => setTripDirection("toHome")}
                >
                  <Text
                    style={{
                      color: tripDirection === "toHome" ? "white" : "#374151",
                      fontWeight: "600",
                      fontSize: 15,
                    }}
                  >
                    🏠 To Home
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}
        {/* 🎓 Student View */}
        {role === "Student" ? (
          <View
            style={{
              marginVertical: 15,
            }}
          >

            {/* 🚗 Assigned Driver (not yet checked in) */}
            {(!profile?.checkInInfo || !profile.checkInInfo.driverName) &&
              profile?.assignedDriverName &&
              rideToday !== true && (
                <View
                  style={{
                    backgroundColor: "#ffffff",
                    borderRadius: 14,
                    padding: 15,
                    marginBottom: 20,
                    borderWidth: 1,
                    borderColor: "#e5e7eb",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 18,
                      fontWeight: "700",
                      color: "#1f2937",
                      marginBottom: 10,
                    }}
                  >
                    🚗 Assigned Driver
                  </Text>

                  {/* Driver Card */}
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <View
                      style={{
                        width: 50,
                        height: 50,
                        borderRadius: 25,
                        backgroundColor: "#3b82f6",
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: 12,
                      }}
                    >
                      <Text style={{ color: "white", fontSize: 20, fontWeight: "bold" }}>
                        {profile.assignedDriverName?.charAt(0) || "D"}
                      </Text>
                    </View>

                    <View>
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: "600",
                          color: "#111827",
                        }}
                      >
                        Driver: {profile.assignedDriverName}
                      </Text>

                      {/* Availability */}
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          marginTop: 4,
                        }}
                      >
                        <View
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 5,
                            backgroundColor:
                              rideToday === null
                                ? "#fbbf24"
                                : rideToday
                                ? "#10b981"
                                : "#ef4444",
                            marginRight: 6,
                          }}
                        />
                        <Text
                          style={{
                            fontWeight: "600",
                            color:
                              rideToday === null
                                ? "#d97706"
                                : rideToday
                                ? "#059669"
                                : "#b91c1c",
                          }}
                        >
                          {rideToday === null
                            ? "Ride today?"
                            : rideToday
                            ? "Riding Today ✅"
                            : "Not Riding ❌"}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Buttons */}
                  {rideToday === null && (
                    <View
                      style={{
                        flexDirection: "row",
                        marginTop: 15,
                      }}
                    >
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          backgroundColor: "#3b82f6",
                          borderRadius: 10,
                          paddingVertical: 10,
                          marginRight: 5,
                        }}
                        onPress={handleRideTodayCheckIn}
                      >
                        <Text
                          style={{
                            color: "white",
                            fontWeight: "600",
                            textAlign: "center",
                          }}
                        >
                          ✅ Yes
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={{
                          flex: 1,
                          backgroundColor: "#9ca3af",
                          borderRadius: 10,
                          paddingVertical: 10,
                          marginLeft: 5,
                        }}
                        onPress={() => setRideToday(false)}
                      >
                        <Text
                          style={{
                            color: "white",
                            fontWeight: "600",
                            textAlign: "center",
                          }}
                        >
                          No thanks
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}

            {profile?.checkInStatus && profile?.checkInInfo?.driverName && (
            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
              <View
                style={{
                  backgroundColor: "#ecfdf5",
                  borderRadius: 14,
                  padding: 15,
                  marginBottom: 20,
                  borderWidth: 1,
                  borderColor: "#a7f3d0",
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text
                    style={{
                      fontSize: 18,
                      fontWeight: "700",
                      color: "#065f46",
                      flex: 1,
                    }}
                  >
                    🚌 Current Driver
                  </Text>
                  <View
                    style={{
                      backgroundColor: "#10b981",
                      borderRadius: 12,
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                    }}
                  >
                    <Text
                      style={{
                        color: "white",
                        fontSize: 12,
                        fontWeight: "bold",
                      }}
                    >
                      Active
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: "row", marginTop: 10 }}>
                  <View
                    style={{
                      width: 50,
                      height: 50,
                      borderRadius: 25,
                      backgroundColor: "#059669",
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: 12,
                    }}
                  >
                    <Text style={{ color: "white", fontSize: 20, fontWeight: "bold" }}>
                      {profile.checkInInfo.driverName?.charAt(0) || "D"}
                    </Text>
                  </View>

                  <View>
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "600",
                        color: "#064e3b",
                      }}
                    >
                      {profile.checkInInfo.driverName}
                    </Text>
                    <Text style={{ color: "#065f46" }}>Currently driving you</Text>
                    <Text style={{ color: "#047857", fontSize: 13, marginTop: 4 }}>
                      Checked in:{" "}
                      {new Date(profile.checkInInfo.timestamp || Date.now()).toLocaleTimeString()}
                    </Text>
                  </View>
                </View>
              </View>
            </Animated.View>
          )}

{/* 🎫 QR Code Section */}
{showQR && studentDataForQR && (
  <View
    style={{
      backgroundColor: "#ffffff",
      borderRadius: 14,
      padding: 15,
      borderWidth: 1,
      borderColor: "#e5e7eb",
      marginBottom: 20,
    }}
  >
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Text
        style={{
          fontSize: 18,
          fontWeight: "700",
          color: "#1f2937",
        }}
      >
        🎫 Your QR Code
      </Text>

      <View
        style={{
          backgroundColor: "#dbeafe",
          borderRadius: 10,
          paddingHorizontal: 8,
          paddingVertical: 3,
        }}
      >
        <Text
          style={{
            color: "#1e3a8a",
            fontWeight: "700",
            fontSize: 12,
          }}
        >
          Ready to Scan
        </Text>
      </View>
    </View>

    <View style={{ alignItems: "center", marginVertical: 15 }}>
      <QRCode
        value={studentDataForQR}
        size={180}
        backgroundColor="#ffffff"
        color="#1e40af"
      />
    </View>
  </View> 
)}
            {/* 📍 Location Section */}
            <View
              style={{
                backgroundColor: "#ffffff",
                borderRadius: 14,
                padding: 15,
                marginBottom: 20,
                borderWidth: 1,
                borderColor: "#e5e7eb",
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: "700", color: "#1f2937" }}>
                📍 Your Location
              </Text>

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginTop: 5,
                }}
              >      
              </View>

              <TextInput
                placeholder="Enter your address"
                placeholderTextColor="#9ca3af"
                value={address}
                onChangeText={setAddress}
                style={{
                  marginTop: 10,
                  borderWidth: 1,
                  borderColor: "#d1d5db",
                  borderRadius: 10,
                  padding: 10,
                  color: "#111827",
                }}
              />

              <View style={{ flexDirection: "row", marginTop: 12 }}>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    backgroundColor: "#3b82f6",
                    borderRadius: 10,
                    paddingVertical: 10,
                    marginRight: 6,
                  }}
                  onPress={() => setModalVisible(true)}
                >
                  <Text
                    style={{
                      color: "white",
                      fontWeight: "600",
                      textAlign: "center",
                    }}
                  >
                    {address ? "Update Address" : "Set Address"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    flex: 1,
                    backgroundColor: "#10b981",
                    borderRadius: 10,
                    paddingVertical: 10,
                    marginLeft: 6,
                  }}
                  onPress={handleUseCurrentLocation}
                >
                  <Text
                    style={{
                      color: "white",
                      fontWeight: "600",
                      textAlign: "center",
                    }}
                  >
                    Use GPS
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

{/* 📚 Recent Activity Section */}
<View
  style={{
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 15,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  }}
>
  <TouchableOpacity onPress={() => setShowRecent(!showRecent)}>
    <Text
      style={{
        fontSize: 17,
        fontWeight: "700",
        color: "#1f2937",
        marginBottom: 10,
      }}
    >
      📚 Recent Activity {showRecent ? "▼" : "▶"}
    </Text>
  </TouchableOpacity>

  {showRecent && (
    <>
      {recentHistory.length > 0 ? (
        recentHistory.map((item, index) => (
          <View
            key={index}
            style={{
              backgroundColor: "#f3f4f6",
              borderRadius: 10,
              padding: 10,
              marginBottom: 8,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 4,
              }}
            >
              <Text style={{ fontWeight: "700", color: "#111827" }}>
                {getStatusIcon(item.status)} {item.status}
              </Text>
              <Text style={{ color: "#6b7280" }}>
                {new Date(item.timestamp).toLocaleDateString()}
              </Text>
            </View>
            <Text style={{ color: "#374151" }}>
              Driver: {item.driverName || "N/A"}
            </Text>
            <Text style={{ color: "#6b7280", fontSize: 12 }}>
              {new Date(item.timestamp).toLocaleTimeString()}
            </Text>
          </View>
        ))
      ) : (
        <View style={{ alignItems: "center", paddingVertical: 20 }}>
          <Text style={{ fontSize: 30 }}>🌟</Text>
          <Text style={{ fontWeight: "700", color: "#1f2937" }}>
            No recent activity
          </Text>
          <Text style={{ color: "#6b7280" }}>
            Your travel history will appear here
          </Text>
        </View>
      )}
    </>
  )}
</View>

            </View>
            ) : role === "Driver" ? (
          <>
            {(() => {
              const today = new Date().toISOString().split("T")[0];
              const activePassengers = filteredStudents.filter(student => (
                student.checkInInfo?.status &&
                student.checkInInfo.driverId === profile?.id &&
                student.checkInInfo.lastCheckInDate === today
              )).length;

              const hasPassengers = activePassengers > 0;

              return (
                <TouchableOpacity
                  style={[
                    styles.drivingModeButton,
                    !hasPassengers && { opacity: 0.5 } // make it look disabled
                  ]}
                  onPress={() => {
                    if (hasPassengers) {
                      setDrivingModeVisible(true);
                    } else {
                      alert("No active passengers today.");
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <View style={styles.drivingModeContent}>
                    <Text style={styles.drivingModeIcon}>🚗</Text>
                    <Text style={styles.drivingModeText}>Driving Mode</Text>
                    <View style={styles.passengerCountBadge}>
                      <Text style={styles.passengerCountText}>{activePassengers}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })()}


            {/** 🔍 Search */}
            <View style={styles.searchContainer}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                placeholder="Search passengers..."
                placeholderTextColor="#9ca3af"
                value={search}
                onChangeText={setSearch}
                style={styles.searchInput}
              />
            </View>

            {/** 🚌 Header */}
            <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              🛣️ Today’s Crew{" "}
              <Text style={{ color: "#2d77ff", fontWeight: "600" }}>
                {tripDirection === "toSchool" ? "(To School)" : "(To Home)"}
              </Text>
            </Text>
              <View style={styles.countBadge}>
                <Text style={styles.countText}>
                  {
                    filteredStudents.filter(student => {
                      const today = new Date().toISOString().split("T")[0];
                      return (
                        student.checkInInfo?.status &&
                        student.checkInInfo.driverId === profile?.id &&
                        student.checkInInfo.lastCheckInDate === today
                      );
                    }).length
                  }
                </Text>
              </View>
            </View>

            {/** 👥 Passenger List */}
            {filteredStudents.filter(student => {
              const today = new Date().toISOString().split("T")[0];
              return (
                student.checkInInfo?.status &&
                student.checkInInfo.driverId === profile?.id &&
                student.checkInInfo.lastCheckInDate === today
              );
            }).length > 0 ? (
              filteredStudents
                .filter(student => {
                  const today = new Date().toISOString().split("T")[0];
                  return (
                    student.checkInInfo?.status &&
                    student.checkInInfo.driverId === profile?.id &&
                    student.checkInInfo.lastCheckInDate === today
                  );
                })
                .map((student, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.passengerCard}
                    onPress={() => handleStudentPress(student)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.passengerInfo}>
                      <View style={styles.passengerAvatar}>
                        <Text style={styles.passengerInitial}>
                          {student.fullName?.charAt(0) || "S"}
                        </Text>
                      </View>
                      <View style={styles.passengerDetails}>
                        <Text style={styles.passengerName}>{student.fullName}</Text>
                        <Text style={styles.passengerId}>ID: {student.id}</Text>
                        <Text style={styles.passengerAddress} numberOfLines={1}>
                          📍 {student.permanentAddress}
                        </Text>

                        {schoolLocation && student.latitude && student.longitude && (
                          <Text style={styles.passengerDistance}>
                            {tripDirection === "toSchool" ? "🏫" : "🏠"}{" "}
                            {tripDirection === "toSchool"
                              ? calculateDistance(
                                  student.latitude,
                                  student.longitude,
                                  schoolLocation.latitude,
                                  schoolLocation.longitude
                                ).toFixed(1)
                              : calculateDistance(
                                  schoolLocation.latitude,
                                  schoolLocation.longitude,
                                  student.latitude,
                                  student.longitude
                                ).toFixed(1)}{" "}
                            km {tripDirection === "toSchool" ? "to school" : "from school"}
                          </Text>
                        )}
                      </View>
                    </View>

                    <TouchableOpacity
                      style={styles.dropOffButton}
                      onPress={(e) => {
                        e.stopPropagation();
                        handleDropOff(student);
                      }}
                    >
                      <Text style={styles.dropOffIcon}>✓</Text>
                      <Text style={styles.dropOffText}>Drop Off</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🚌</Text>
                <Text style={styles.emptyText}>No passengers yet</Text>
                <Text style={styles.emptySubtext}>
                  Students will appear here when they check in today
                </Text>
              </View>
            )}
          </>
        ) : role === "Parent" ? (
          <>
            <View style={styles.logoSection}>
              <Image
                source={require("../../assets/6966266.png")} 
                style={styles.modernLogo}
                resizeMode="contain"
              />
              <Text style={styles.logoText}>Track Your Child's Journey</Text>
            </View>
        
            <View style={styles.searchContainer}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                placeholder="Search students..."
                placeholderTextColor="#9ca3af"
                value={search}
                onChangeText={setSearch}
                style={styles.searchInput}
              />
            </View>
        
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>👨‍🎓 All Students</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countText}>
                  {filteredStudents.filter((student, index, self) => 
                    index === self.findIndex(s => s.id === student.id)
                  ).length}
                </Text>
              </View>
            </View>
        
            {(() => {
              // Remove duplicate students by ID
              const uniqueStudents = filteredStudents.filter((student, index, self) => 
                index === self.findIndex(s => s.id === student.id)
              );
        
              return uniqueStudents.length > 0 ? (
                uniqueStudents.map((student) => (
                  <TouchableOpacity
                    key={student.id}
                    style={styles.studentCard}
                    onPress={() => handleStudentPress(student)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.studentInfo}>
                      <View style={styles.studentAvatar}>
                        <Text style={styles.studentInitial}>
                          {student.fullName?.charAt(0) || "S"}
                        </Text>
                      </View>
                      <View style={styles.studentDetails}>
                        <Text style={styles.studentName}>{student.fullName}</Text>
                        <Text style={styles.studentMeta}>ID: {student.id}</Text>
                        <Text style={styles.studentMeta}>📱 {student.mobile}</Text>
                        <View style={styles.studentStatusContainer}>
                          {student.checkInInfo?.status && student.checkInInfo?.driverName ? (
                            <View style={[styles.statusIndicator, { backgroundColor: '#10b981' }]}>
                              <Text style={styles.statusEmoji}>🚌</Text>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.statusLabel}>
                                  Riding with {student.checkInInfo.driverName}
                                </Text>
                                {student.checkInInfo.timestamp && (
                                  <Text style={[styles.statusLabel, { fontSize: 11, opacity: 0.9, marginTop: 2 }]}>
                                    Since {new Date(student.checkInInfo.timestamp).toLocaleTimeString([], { 
                                      hour: '2-digit', 
                                      minute: '2-digit' 
                                    })}
                                  </Text>
                                )}
                              </View>
                            </View>
                          ) : student.assignedDriverName ? (
                            <View style={[styles.statusIndicator, { backgroundColor: '#f59e0b' }]}>
                              <Text style={styles.statusEmoji}>🏫</Text>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.statusLabel}>At School</Text>
                                <Text style={[styles.statusLabel, { fontSize: 11, opacity: 0.9, marginTop: 2 }]}>
                                  Assigned to: {student.assignedDriverName}
                                </Text>
                              </View>
                            </View>
                          ) : (
                            <View style={[styles.statusIndicator, { backgroundColor: '#6b7280' }]}>
                              <Text style={styles.statusEmoji}>📍</Text>
                              <Text style={styles.statusLabel}>No Driver Assigned</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyIcon}>👨‍🎓</Text>
                  <Text style={styles.emptyText}>No students found</Text>
                  <Text style={styles.emptySubtext}>
                    {search ? 'Try adjusting your search' : 'No students available'}
                  </Text>
                </View>
              );
            })()}
          </>
        ) : (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        )}
      </ScrollView>

      {/* Enhanced Modals */}
      <Modal visible={isModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modernModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📍 Confirm Address</Text>
            </View>
            <Text style={styles.modalText}>
              Save this as your permanent address?
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.cancelButton}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSavePermanentAddress}
                style={styles.confirmButton}
              >
                <Text style={styles.confirmButtonText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={isStudentModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modernModal}>
            {selectedStudent && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>👤 Student Details</Text>
                </View>
                
                <View style={styles.detailsContainer}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Name:</Text>
                    <Text style={styles.detailValue}>{selectedStudent.fullName}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>ID:</Text>
                    <Text style={styles.detailValue}>{selectedStudent.id}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Mobile:</Text>
                    <Text style={styles.detailValue}>{selectedStudent.mobile}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Address:</Text>
                    <Text style={styles.detailValue}>{selectedStudent.permanentAddress || "N/A"}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Status:</Text>
                    <View style={[
                      styles.statusBadge,
                      { backgroundColor: selectedStudent.checkInStatus ? '#dcfce7' : '#fef3c7' }
                    ]}>
                      <Text style={[
                        styles.statusBadgeText,
                        { color: selectedStudent.checkInStatus ? '#166534' : '#92400e' }
                      ]}>
                        {selectedStudent.checkInStatus ? "Checked In" : "Not Checked In"}
                      </Text>
                    </View>
                  </View>
                </View>
              </>
            )}
            <TouchableOpacity
              onPress={() => setStudentModalVisible(false)}
              style={styles.closeButton}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
      visible={isDrivingModeVisible}
      animationType="slide"
      transparent={true}
      hardwareAccelerated={true}
      onRequestClose={() => setDrivingModeVisible(false)}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Enhanced Header with Gradient Effect */}
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <View style={styles.titleContainer}>
                <View style={styles.iconCircle}>
                  <Text style={styles.headerIcon}>🚗</Text>
                </View>
                <View>
                  <Text style={styles.title}>Driving Mode</Text>
                  <Text style={styles.subtitle}>Stay focused on the road</Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => setDrivingModeVisible(false)}
                style={styles.closeButton}
              >
                <Text style={styles.close}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            style={styles.scrollContainer}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Enhanced Nearest Student Priority Section */}
            {nearestStudent && (
              <View style={styles.nearestStudentSection}>
                <View style={styles.priorityHeader}>
                  <View style={styles.priorityTitleContainer}>
                    <View style={styles.pulseIndicator} />
                    <Text style={styles.priorityTitle}>Next Drop-off</Text>
                  </View>
                  <View style={styles.priorityBadge}>
                    <Text style={styles.priorityBadgeText}>
                      {nearestStudent.distanceToDestination?.toFixed(2)} km
                    </Text>
                  </View>
                </View>

                <View style={styles.nearestStudentCard}>
                  <View style={styles.cardGlow} />
                  
                  <View style={styles.nearestStudentInfo}>
                    <View style={styles.nearestAvatarContainer}>
                      <View style={styles.nearestAvatar}>
                        <Text style={styles.nearestAvatarText}>
                          {nearestStudent.fullName?.charAt(0) || 'S'}
                        </Text>
                      </View>
                      <View style={styles.avatarBadge}>
                        <Text style={styles.avatarBadgeText}>1st</Text>
                      </View>
                    </View>
                    
                    <View style={styles.nearestDetails}>
                      <Text style={styles.nearestName}>
                        {nearestStudent.fullName}
                      </Text>
                      <View style={styles.idChip}>
                        <Text style={styles.nearestId}>ID: {nearestStudent.id}</Text>
                      </View>
                      <View style={styles.addressContainer}>
                        <Text style={styles.addressIcon}>📍</Text>
                        <Text style={styles.nearestAddress} numberOfLines={2}>
                          {nearestStudent.permanentAddress}
                        </Text>
                      </View>
                      <View style={styles.distanceContainer}>
                        <Text style={styles.distanceIcon}>
                          {tripDirection === 'toSchool' ? '🏫' : '🏠'}
                        </Text>
                        <Text style={styles.nearestDistance}>
                          {nearestStudent.distanceToDestination?.toFixed(1)} km away
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Enhanced Navigation Button */}
                  {nearestStudent.latitude && nearestStudent.longitude && (
                    <TouchableOpacity
                      style={styles.navigationButton}
                      onPress={async () => {
                        const url = `https://maps.google.com/?q=${nearestStudent.latitude},${nearestStudent.longitude}`;

                        Alert.alert('Open in Maps', 'Navigate to this location?', [
                          { text: 'Cancel' },
                          {
                            text: 'Open Maps',
                            onPress: async () => {
                              try {
                                const supported = await Linking.canOpenURL(url);
                                if (supported) {
                                  await Linking.openURL(url);
                                } else {
                                  Alert.alert('Error', 'Cannot open Maps on this device');
                                }
                              } catch (error) {
                                Alert.alert('Error', 'Something went wrong: ' + error.message);
                              }
                            },
                          },
                        ]);
                      }}
                    >
                      <Text style={styles.navigationIcon}>🗺️</Text>
                      <Text style={styles.navigationText}>Navigate</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.priorityDropOffButton}
                    onPress={() => handleDropOff(nearestStudent)}
                  >
                    <View style={styles.dropOffIconContainer}>
                      <Text style={styles.priorityDropOffIcon}>✓</Text>
                    </View>
                    <Text style={styles.priorityDropOffText}>Drop Off Now</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Enhanced Statistics */}
            <View style={styles.statsContainer}>
              <View style={styles.statCard}>
                <View style={styles.statIconContainer}>
                  <Text style={styles.statEmoji}>👥</Text>
                </View>
                <Text style={styles.statNumber}>
                  {filteredStudents.filter(
                    (student) =>
                      student.checkInStatus === true &&
                      student.checkInInfo?.driverId === profile?.id
                  ).length}
                </Text>
                <Text style={styles.statLabel}>Passengers</Text>
              </View>

              <View style={styles.statCard}>
                <View style={styles.statIconContainer}>
                  <Text style={styles.statEmoji}>🕐</Text>
                </View>
                <Text style={styles.statNumber}>
                  {new Date().toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
                <Text style={styles.statLabel}>Current Time</Text>
              </View>

              <View style={styles.statCard}>
                <View style={styles.statIconContainer}>
                  <Text style={styles.statEmoji}>
                    {tripDirection === 'toSchool' ? '🏫' : '🏠'}
                  </Text>
                </View>
                <Text style={styles.statNumber}>
                  {tripDirection === 'toSchool' ? 'School' : 'Home'}
                </Text>
                <Text style={styles.statLabel}>Destination</Text>
              </View>
            </View>

            {/* Enhanced All Passengers Section */}
            <View style={styles.allPassengersHeader}>
              <View style={styles.sectionTitleContainer}>
                <Text style={styles.sectionIcon}>👥</Text>
                <Text style={styles.allPassengersTitle}>All Passengers</Text>
              </View>
              <View style={styles.passengerCountBadge}>
                <Text style={styles.passengerCountText}>
                  {filteredStudents.filter(
                    (s) => s.checkInInfo?.status && s.checkInInfo.driverId === profile?.id
                  ).length}
                </Text>
              </View>
            </View>

            {filteredStudents.filter(
              (s) => s.checkInInfo?.status && s.checkInInfo.driverId === profile?.id
            ).length > 0 ? (
              filteredStudents
                .filter((s) => s.checkInInfo?.status && s.checkInInfo.driverId === profile?.id)
                .map((student, index) => (
                  <TouchableOpacity
                    key={`passenger-${student.id}-${index}`}
                    style={[
                      styles.passengerCard,
                      nearestStudent &&
                        student.id === nearestStudent.id &&
                        styles.highlightedCard,
                    ]}
                    onPress={() => handleStudentPress(student)}
                    activeOpacity={0.7}
                  >
                    {nearestStudent && student.id === nearestStudent.id && (
                      <View style={styles.highlightStripe} />
                    )}
                    
                    <View style={styles.passengerInfo}>
                      <View style={styles.avatarWrapper}>
                        <View style={styles.avatar}>
                          <Text style={styles.avatarInitial}>
                            {student.fullName?.charAt(0) || 'S'}
                          </Text>
                        </View>
                        {nearestStudent && student.id === nearestStudent.id && (
                          <View style={styles.nextIndicator}>
                            <Text style={styles.nextIndicatorText}>NEXT</Text>
                          </View>
                        )}
                      </View>
                      
                      <View style={styles.details}>
                        <View style={styles.nameRow}>
                          <Text style={styles.name}>{student.fullName}</Text>
                          <View style={styles.miniIdChip}>
                            <Text style={styles.miniId}>{student.id}</Text>
                          </View>
                        </View>
                        
                        <View style={styles.infoRow}>
                          <Text style={styles.infoIcon}>📍</Text>
                          <Text style={styles.address} numberOfLines={1}>
                            {student.permanentAddress}
                          </Text>
                        </View>
                        
                        {schoolLocation && student.latitude && student.longitude && (
                          <View style={styles.distanceRow}>
                            <View style={styles.distanceChip}>
                              <Text style={styles.distanceChipIcon}>
                                {tripDirection === 'toSchool' ? '🏫' : '🏠'}
                              </Text>
                              <Text style={styles.distance}>
                                {tripDirection === 'toSchool'
                                  ? calculateDistance(
                                      student.latitude,
                                      student.longitude,
                                      schoolLocation.latitude,
                                      schoolLocation.longitude
                                    ).toFixed(1)
                                  : calculateDistance(
                                      schoolLocation.latitude,
                                      schoolLocation.longitude,
                                      student.latitude,
                                      student.longitude
                                    ).toFixed(1)}{' '}
                                km
                              </Text>
                            </View>
                          </View>
                        )}
                      </View>
                    </View>

                    <TouchableOpacity
                      style={styles.dropOffButton}
                      onPress={(e) => {
                        e.stopPropagation();
                        handleDropOff(student);
                      }}
                    >
                      <View style={styles.dropOffIconCircle}>
                        <Text style={styles.dropOffIcon}>✓</Text>
                      </View>
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))
            ) : (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconContainer}>
                  <Text style={styles.emptyIcon}>🚌</Text>
                </View>
                <Text style={styles.emptyText}>No passengers yet</Text>
                <Text style={styles.emptySubtext}>
                  Students will appear here when they check in
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Enhanced Action Buttons */}
          <View style={styles.actionsContainer}>
            <TouchableOpacity
              style={styles.emergencyButton}
              onPress={() => {
                Alert.alert(
                  '🚨 Emergency',
                  'This would contact emergency services or dispatch',
                  [{ text: 'Cancel' }, { text: 'Call', style: 'destructive' }]
                );
              }}
            >
              <View style={styles.emergencyIconContainer}>
                <Text style={styles.emergencyIcon}>🚨</Text>
              </View>
              <Text style={styles.emergencyButtonText}>Emergency</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.endTripButton}
              onPress={() => {
                Alert.alert(
                  '🏁 End Trip',
                  'Are you sure you want to end the current trip?',
                  [
                    { text: 'Cancel' },
                    {
                      text: 'End Trip',
                      onPress: () => {
                        setDrivingModeVisible(false);
                        Alert.alert('Trip Ended', 'Your driving session has been completed.');
                      },
                    },
                  ]
                );
              }}
            >
              <Text style={styles.endTripIcon}>🏁</Text>
              <Text style={styles.endTripButtonText}>End Trip</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>


      {/* Modern Footer */}
      <View style={styles.modernFooter}>
        <Text style={styles.footerText}>© 2025 DesGuide • Made with ❤️</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
    },
    header: {
      backgroundColor: '#1E3A8A',
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingTop: 20,
      paddingBottom: 20,
      paddingHorizontal: 20,
    },
    headerContent: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    titleContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    iconCircle: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerIcon: {
      fontSize: 24,
    },
    title: {
      fontSize: 22,
      fontWeight: '700',
      color: '#FFFFFF',
      letterSpacing: 0.3,
    },
    subtitle: {
      fontSize: 13,
      color: 'rgba(255, 255, 255, 0.8)',
      marginTop: 2,
    },
    closeButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    close: {
      fontSize: 22,
      color: '#FFFFFF',
      fontWeight: '600',
    },
    scrollContainer: {
      flex: 1,
    },
    scrollContent: {
      padding: 16,
      paddingBottom: 24,
    },
    nearestStudentSection: {
      marginBottom: 20,
    },
    priorityHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    priorityTitleContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    pulseIndicator: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: '#EF4444',
      shadowColor: '#EF4444',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.8,
      shadowRadius: 6,
    },
    priorityTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: '#1F2937',
    },
    priorityBadge: {
      backgroundColor: '#DBEAFE',
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: '#93C5FD',
    },
    priorityBadgeText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#1E40AF',
    },
    nearestStudentCard: {
      backgroundColor: '#FFFFFF',
      borderRadius: 16,
      padding: 16,
      shadowColor: '#1E3A8A',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
      elevation: 6,
      borderWidth: 2,
      borderColor: '#3B82F6',
      position: 'relative',
      overflow: 'hidden',
    },
    cardGlow: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 3,
      backgroundColor: '#3B82F6',
    },
    nearestStudentInfo: {
      flexDirection: 'row',
      marginBottom: 14,
    },
    nearestAvatarContainer: {
      position: 'relative',
      marginRight: 14,
    },
    nearestAvatar: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: '#3B82F6',
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 3,
      borderColor: '#DBEAFE',
    },
    nearestAvatarText: {
      fontSize: 26,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    avatarBadge: {
      position: 'absolute',
      bottom: -4,
      right: -4,
      backgroundColor: '#F59E0B',
      borderRadius: 12,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderWidth: 2,
      borderColor: '#FFFFFF',
    },
    avatarBadgeText: {
      fontSize: 10,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    nearestDetails: {
      flex: 1,
      justifyContent: 'center',
    },
    nearestName: {
      fontSize: 19,
      fontWeight: '700',
      color: '#111827',
      marginBottom: 6,
    },
    idChip: {
      backgroundColor: '#F3F4F6',
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
      marginBottom: 8,
    },
    nearestId: {
      fontSize: 12,
      fontWeight: '600',
      color: '#6B7280',
    },
    addressContainer: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 6,
      marginBottom: 6,
    },
    addressIcon: {
      fontSize: 14,
      marginTop: 1,
    },
    nearestAddress: {
      fontSize: 14,
      color: '#4B5563',
      flex: 1,
      lineHeight: 20,
    },
    distanceContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    distanceIcon: {
      fontSize: 14,
    },
    nearestDistance: {
      fontSize: 15,
      fontWeight: '600',
      color: '#1E40AF',
    },
    navigationButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#EFF6FF',
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 16,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: '#BFDBFE',
      gap: 8,
    },
    navigationIcon: {
      fontSize: 18,
    },
    navigationText: {
      fontSize: 15,
      fontWeight: '700',
      color: '#1E40AF',
    },
    priorityDropOffButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#10B981',
      borderRadius: 12,
      paddingVertical: 14,
      gap: 8,
      shadowColor: '#10B981',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    dropOffIconContainer: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: 'rgba(255, 255, 255, 0.3)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    priorityDropOffIcon: {
      fontSize: 16,
      fontWeight: '900',
      color: '#FFFFFF',
    },
    priorityDropOffText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#FFFFFF',
      letterSpacing: 0.3,
    },
    statsContainer: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 24,
    },
    statCard: {
      flex: 1,
      backgroundColor: '#FFFFFF',
      borderRadius: 14,
      padding: 14,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 3,
      borderWidth: 1,
      borderColor: '#F3F4F6',
    },
    statIconContainer: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: '#F3F4F6',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 8,
    },
    statEmoji: {
      fontSize: 20,
    },
    statNumber: {
      fontSize: 20,
      fontWeight: '800',
      color: '#111827',
      marginBottom: 2,
    },
    statLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: '#6B7280',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    allPassengersHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 14,
    },
    sectionTitleContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    sectionIcon: {
      fontSize: 20,
    },
    allPassengersTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: '#1F2937',
    },
    passengerCountBadge: {
      backgroundColor: '#EFF6FF',
      width: 32,
      height: 32,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: '#BFDBFE',
    },
    passengerCountText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#1E40AF',
    },
    passengerCard: {
      backgroundColor: '#FFFFFF',
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 2,
      borderWidth: 1,
      borderColor: '#F3F4F6',
      position: 'relative',
      overflow: 'hidden',
    },
    highlightedCard: {
      borderColor: '#3B82F6',
      borderWidth: 2,
      backgroundColor: '#F0F9FF',
    },
    highlightStripe: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 4,
      backgroundColor: '#3B82F6',
    },
    passengerInfo: {
      flexDirection: 'row',
      flex: 1,
      alignItems: 'center',
    },
    avatarWrapper: {
      position: 'relative',
      marginRight: 12,
    },
    avatar: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: '#60A5FA',
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: '#DBEAFE',
    },
    avatarInitial: {
      fontSize: 20,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    nextIndicator: {
      position: 'absolute',
      bottom: -4,
      left: -4,
      backgroundColor: '#F59E0B',
      borderRadius: 8,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderWidth: 1.5,
      borderColor: '#FFFFFF',
    },
    nextIndicatorText: {
      fontSize: 8,
      fontWeight: '800',
      color: '#FFFFFF',
      letterSpacing: 0.3,
    },
    details: {
      flex: 1,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 6,
      gap: 8,
    },
    name: {
      fontSize: 16,
      fontWeight: '700',
      color: '#111827',
    },
    miniIdChip: {
      backgroundColor: '#F3F4F6',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
    },
    miniId: {
      fontSize: 10,
      fontWeight: '600',
      color: '#6B7280',
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginBottom: 6,
    },
    infoIcon: {
      fontSize: 12,
    },
    address: {
      fontSize: 13,
      color: '#6B7280',
      flex: 1,
    },
    distanceRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    distanceChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#EFF6FF',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      gap: 4,
    },
    distanceChipIcon: {
      fontSize: 12,
    },
    distance: {
      fontSize: 12,
      fontWeight: '600',
      color: '#1E40AF',
    },
    dropOffButton: {
      marginLeft: 12,
    },
    dropOffIconCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: '#10B981',
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#10B981',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 3,
    },
    dropOffIcon: {
      fontSize: 20,
      fontWeight: '900',
      color: '#FFFFFF',
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: 48,
    },
    emptyIconContainer: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: '#F3F4F6',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 16,
    },
    emptyIcon: {
      fontSize: 40,
    },
    emptyText: {
      fontSize: 17,
      fontWeight: '700',
      color: '#4B5563',
      marginBottom: 6,
    },
    emptySubtext: {
      fontSize: 14,
      color: '#9CA3AF',
      textAlign: 'center',
      paddingHorizontal: 40,
    },
    actionsContainer: {
      flexDirection: 'row',
      gap: 12,
      padding: 16,
      paddingBottom: 24,
      backgroundColor: '#FFFFFF',
      borderTopWidth: 1,
      borderTopColor: '#F3F4F6',
    },
    emergencyButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#FEE2E2',
      borderRadius: 14,
      paddingVertical: 16,
      gap: 8,
      borderWidth: 2,
      borderColor: '#FECACA',
    },
    emergencyIconContainer: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: '#EF4444',
      justifyContent: 'center',
      alignItems: 'center',
    },
    emergencyIcon: {
      fontSize: 16,
    },
  // Modern Header Styles
  modernHeader: {
    background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
    backgroundColor: "#1e40af",
    paddingTop: 20,
    paddingBottom: 30,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    elevation: 8,
    shadowColor: "#1e40af",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    position: 'relative',
    overflow: 'hidden',
  },
  gpsNotice: {
    fontSize: 12,
    color: '#6c757d',
    marginTop: 4,
  },
  distanceText: {
    fontSize: 16,
    color: '#212529',
    fontWeight: '600',
    marginBottom: 8,
  },
  userSection: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
  },
  avatarText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
  },
  userInfo: {
    justifyContent: "center",
  },
  welcomeText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    fontWeight: "500",
  },
  userName: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  roleChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  roleIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  roleText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  headerDecoration: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    bottom: 0,
  },
  decorCircle: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.1)",
  },

  // Main Content
  mainContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },

  // Modern Card Styles
  modernCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1e293b",
  },
  statusIndicator: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#10b981",
    marginRight: 6,
  },
  statusText: {
    color: "#10b981",
    fontSize: 12,
    fontWeight: "600",
  },

  // Input Styles
  inputContainer: {
    marginBottom: 20,
  },
  modernInput: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: "#1e293b",
    backgroundColor: "#f8fafc",
    fontWeight: "500",
  },

  // Button Styles
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  modernButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  primaryButton: {
    backgroundColor: "#3b82f6",
  },
  successButton: {
    backgroundColor: "#10b981",
  },
  buttonIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },

  // QR Section
  qrSection: {
    marginTop: 20,
  },
  qrHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  qrTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1e293b",
  },
  qrBadge: {
    backgroundColor: "#dcfce7",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  qrBadgeText: {
    color: "#166534",
    fontSize: 12,
    fontWeight: "600",
  },
  qrCodeContainer: {
    alignItems: "center",
    padding: 20,
    backgroundColor: "#f8fafc",
    borderRadius: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },

  // History Section
  historySection: {
    marginTop: 10,
  },
  historyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1e293b",
    marginBottom: 16,
  },
  historyCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeft: 4,
    borderLeftColor: "#3b82f6",
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  historyStatus: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1e293b",
  },
  historyTime: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "500",
  },
  historyDriver: {
    fontSize: 14,
    color: "#475569",
    marginBottom: 4,
  },
  historyTimestamp: {
    fontSize: 12,
    color: "#94a3b8",
  },

  // Search Styles
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingHorizontal: 16,
    marginBottom: 20,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  searchIcon: {
    fontSize: 18,
    marginRight: 12,
    color: "#64748b",
  },
  searchInput: {
    flex: 1,
    paddingVertical: 16,
    fontSize: 16,
    color: "#1e293b",
    fontWeight: "500",
  },

  // Section Header
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1e293b",
  },
  countBadge: {
    backgroundColor: "#3b82f6",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 24,
    alignItems: "center",
  },
  countText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },

  // Passenger Card (Driver View)
  passengerAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#e0f2fe",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  passengerInitial: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0369a1",
  },
  passengerDetails: {
    flex: 1,
  },
  passengerName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1e293b",
    marginBottom: 4,
  },

  passengerId: {
    fontSize: 13,
    color: "#64748b",
    marginBottom: 4,
  },

  passengerAddress: {
    fontSize: 13,
    color: "#475569",
    fontStyle: "italic",
  },

  dropOffText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },

  // Student Card (Parent View)
  studentCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  studentInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  studentAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#fef3c7",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  studentInitial: {
    fontSize: 20,
    fontWeight: "700",
    color: "#92400e",
  },
  studentDetails: {
    flex: 1,
  },
  studentName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1e293b",
    marginBottom: 4,
  },
  studentMeta: {
    fontSize: 13,
    color: "#64748b",
    marginBottom: 2,
  },
  studentStatusContainer: {
    marginTop: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  statusEmoji: {
    fontSize: 12,
    marginRight: 4,
  },
  statusLabel: {
    fontSize: 12,
    color: "#fff",
    fontWeight: "600",
  },
  chevron: {
    fontSize: 24,
    color: "#cbd5e1",
    fontWeight: "300",
  },

  // Logo Section (Parent View)
  logoSection: {
    alignItems: "center",
    marginBottom: 30,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  modernLogo: {
    width: 100,
    height: 100,
    marginBottom: 12,
  },
  logoText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#64748b",
    textAlign: "center",
  },
  // Map Container
  mapContainer: {
    marginVertical: 16,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  miniMap: {
    height: 200,
    width: '100%',
  },
  openMapsButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(59, 130, 246, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  openMapsText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  nextBadge: {
    color: '#f59e0b',
    fontSize: 12,
    fontWeight: '700',
  },

  // Enhanced Statistics
  drivingModeStats: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#d1d5db',
    marginHorizontal: 8,
  },

  // Enhanced Actions
  drivingModeActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    gap: 12,
  },
  emergencyButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  endTripButton: {
    flex: 1,
    backgroundColor: '#374151',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  endTripButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 18,
    color: "#64748b",
    fontWeight: "500",
  },

  // Modern Modal Styles
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 20,
  },
  modernModal: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    elevation: 10,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 15,
  },
  modalHeader: {
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1e293b",
    textAlign: "center",
  },
  modalText: {
    fontSize: 16,
    color: "#475569",
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 24,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#f1f5f9",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelButtonText: {
    color: "#64748b",
    fontWeight: "600",
    fontSize: 16,
  },
  confirmButton: {
    flex: 1,
    backgroundColor: "#3b82f6",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    elevation: 2,
    shadowColor: "#3b82f6",
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  confirmButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  drivingModeButton: {
    backgroundColor: "#059669",
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    elevation: 6,
    shadowColor: "#059669",
    shadowOpacity: 0.4,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  drivingModeContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  drivingModeIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  drivingModeText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
    flex: 1,
  },
  // Driving Mode Modal Styles
  drivingModeOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "flex-end",
  },
  drivingModeModal: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    maxHeight: "90%",
    elevation: 20,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  drivingModeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  drivingModeTitle: {
    flexDirection: "row",
    alignItems: "center",
  },
  drivingModeTitleText: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1e293b",
    marginLeft: 12,
  },
  minimizeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
  },
  minimizeIcon: {
    fontSize: 18,
    color: "#64748b",
    fontWeight: "600",
  },

  // Driving Mode Passenger Cards
  drivingModePassengerCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderLeftWidth: 4,
    borderLeftColor: "#059669",
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  drivingModePassengerInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  drivingModePassengerAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#dcfce7",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
    borderWidth: 2,
    borderColor: "#059669",
  },
  drivingModePassengerInitial: {
    fontSize: 24,
    fontWeight: "700",
    color: "#059669",
  },
  drivingModePassengerDetails: {
    flex: 1,
  },
  drivingModePassengerName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1e293b",
    marginBottom: 6,
  },
  drivingModePassengerAddress: {
    fontSize: 14,
    color: "#475569",
    marginBottom: 4,
    lineHeight: 18,
  },
  drivingModePassengerMobile: {
    fontSize: 13,
    color: "#64748b",
  },
  drivingModeDropOffButton: {
    backgroundColor: "#dc2626",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    elevation: 3,
    shadowColor: "#dc2626",
    shadowOpacity: 0.4,
    shadowRadius: 6,
    minWidth: 100,
    justifyContent: "center",
  },
  drivingModeDropOffIcon: {
    color: "#fff",
    fontSize: 16,
    marginRight: 6,
  },
  drivingModeDropOffText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },

  // Driving Mode Empty State
  drivingModeEmptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  drivingModeEmptyIcon: {
    fontSize: 64,
    marginBottom: 20,
    opacity: 0.6,
  },
  drivingModeEmptyText: {
    fontSize: 20,
    fontWeight: "600",
    color: "#64748b",
    marginBottom: 8,
  },
  drivingModeEmptySubtext: {
    fontSize: 16,
    color: "#94a3b8",
    textAlign: "center",
  },

  // Details Modal
  detailsContainer: {
    marginBottom: 24,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748b",
    flex: 1,
  },
  detailValue: {
    fontSize: 14,
    color: "#1e293b",
    fontWeight: "500",
    flex: 2,
    textAlign: "right",
  },
  closeButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  // Modern Footer
  modernFooter: {
    backgroundColor: "#fff",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    alignItems: "center",
  },
  footerText: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "500",
  },

  tripDirectionContainer: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  tripDirectionLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1e293b",
    marginBottom: 12,
    textAlign: "center",
  },
  tripDirectionButtons: {
    flexDirection: "row",
    gap: 8,
  },
  tripDirectionButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 2,
  },
  tripDirectionButtonActive: {
    backgroundColor: "#3b82f6",
    borderColor: "#3b82f6",
  },
  tripDirectionButtonInactive: {
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
  },
  tripDirectionButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  tripDirectionButtonTextActive: {
    color: "#fff",
  },
  tripDirectionButtonTextInactive: {
    color: "#64748b",
  },
  drivingModePassengerDistance: { 
    fontSize: 12,
    color: "#059669",
    marginTop: 4,
    fontWeight: "600",
  },
  passengerDistance: {
    fontSize: 12,
    color: "#059669",
    marginTop: 2,
    fontWeight: "600",
  },
  driverInfoSection: {
    marginBottom: 20,
  },
  driverInfoHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  driverInfoTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1e293b",
  },
  activeDriverBadge: {
    backgroundColor: "#dcfce7",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  activeDriverText: {
    color: "#166534",
    fontSize: 12,
    fontWeight: "600",
  },
  driverInfoCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    borderLeftWidth: 4,
    borderLeftColor: "#059669",
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  driverAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#dcfce7",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
    borderWidth: 2,
    borderColor: "#059669",
  },
  driverInitial: {
    fontSize: 20,
    fontWeight: "700",
    color: "#059669",
  },
  driverDetails: {
    flex: 1,
  },
  driverName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1e293b",
    marginBottom: 4,
  },
  driverStatus: {
    fontSize: 14,
    color: "#059669",
    fontWeight: "600",
    marginBottom: 2,
  },
  checkedInTime: {
    fontSize: 12,
    color: "#64748b",
  },
});

const fixedDmStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: width * 0.95,
    height: '90%', // enforce proper height
    backgroundColor: '#fff',
    borderRadius: 20,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    overflow: 'visible', // allow children to show outside bounds if needed
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#3b82f6',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  close: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  scrollContainer: {
    flex: 1, // take full height inside modal
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24, // ensure last items are visible
  },

  // Nearest Student
  nearestStudentSection: {
    backgroundColor: '#fef3c7',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#f59e0b',
  },
  nearestStudentCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    overflow: 'hidden',
  },
  nearestStudentInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  nearestAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#e11d48',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  nearestAvatarText: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
  },
  nearestDetails: { flex: 1 },
  nearestName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 4,
  },
  nearestId: { fontSize: 14, color: '#6b7280', marginBottom: 8 },
  nearestAddress: { fontSize: 14, color: '#374151', marginBottom: 8, lineHeight: 20 },
  nearestDistance: { fontSize: 16, fontWeight: '600', color: '#e11d48' },

  // Stats
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  statItem: { alignItems: 'center', flex: 1 },
  statNumber: { fontSize: 24, fontWeight: '700', color: '#1e40af', marginBottom: 4 },
  statLabel: { fontSize: 12, color: '#6b7280', textAlign: 'center' },
  statDivider: { width: 1, height: 40, backgroundColor: '#d1d5db', marginHorizontal: 8 },

  // Passengers
  allPassengersHeader: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', marginBottom: 8 },
  allPassengersTitle: { fontSize: 18, fontWeight: '600', color: '#374151' },
  passengerCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  highlightedCard: { borderWidth: 2, borderColor: '#f59e0b', backgroundColor: '#fffbeb' },
  passengerInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#059669',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  avatarInitial: { fontWeight: 'bold', color: '#fff', fontSize: 20 },
  details: { flex: 1 },
  name: { fontWeight: '700', fontSize: 16, color: '#1e293b', marginBottom: 4 },
  nextBadge: { color: '#f59e0b', fontSize: 12, fontWeight: '700' },
  id: { fontSize: 13, color: '#64748b', marginBottom: 2 },
  address: { fontSize: 13, color: '#475569', marginBottom: 4 },
  distance: { fontSize: 12, color: '#059669', fontWeight: '600' },
  dropOffButton: { backgroundColor: '#dc2626', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, flexDirection: 'row', alignItems: 'center' },
  dropOffIcon: { fontSize: 14, color: '#fff', fontWeight: 'bold', marginRight: 6 },
  dropOffText: { fontSize: 12, color: '#fff', fontWeight: 'bold' },

  // Empty State
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 16, opacity: 0.6 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#64748b', marginBottom: 8 },
  emptySubtext: { fontSize: 14, color: '#94a3b8', textAlign: 'center' },

  // Actions
  actionsContainer: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderTopWidth: 1, borderTopColor: '#e5e7eb', gap: 12 },
  emergencyButton: { flex: 1, backgroundColor: '#dc2626', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  emergencyButtonText: { color: 'white', fontWeight: '600', fontSize: 14 },
  endTripButton: { flex: 1, backgroundColor: '#374151', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  endTripButtonText: { color: 'white', fontWeight: '600', fontSize: 14 },

    // Priority Header
    priorityHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
      paddingHorizontal: 8,
    },
    priorityTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: '#92400e', // dark amber
    },
    priorityBadge: {
      backgroundColor: '#f59e0b', // amber
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 20,
    },
    priorityBadgeText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '600',
    },
  
    // Navigation Button
    navigationButton: {
      backgroundColor: '#3b82f6', // blue
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 12,
      alignItems: 'center',
      marginVertical: 8,
    },
    navigationText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '600',
    },
  
    // Priority Drop-Off Button
    priorityDropOffButton: {
      backgroundColor: '#dc2626', // red
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 24,
      borderRadius: 12,
      marginTop: 8,
    },
    priorityDropOffIcon: {
      color: '#fff',
      fontSize: 18,
      fontWeight: '600',
      marginRight: 8,
    },
    priorityDropOffText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
  
});
