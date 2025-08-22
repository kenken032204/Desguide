import React, { useEffect, useState } from "react";
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
  SafeAreaView,
  Dimensions,
  StatusBar,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import QRCode from "react-native-qrcode-svg";
import { db } from "../../config/firebaseConfig";
import { ref, onValue, set, get, query, orderByChild, limitToLast, equalTo } from "firebase/database";
import * as Location from "expo-location";
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const { width } = Dimensions.get('window');

export default function DashboardScreen() {
  const [role, setRole] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [showQR, setShowQR] = useState(false);
  const [isModalVisible, setModalVisible] = useState(false);
  const [permanentAddressSaved, setPermanentAddressSaved] = useState(false);
  const [students, setStudents] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [isStudentModalVisible, setStudentModalVisible] = useState(false);
  const [studentDataForQR, setStudentDataForQR] = useState<string | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [recentHistory, setRecentHistory] = useState<any[]>([]);

  useEffect(() => {
    if (!profile?.id) return; // only run if user profile is loaded
  
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

    return () => unsubscribe(); // cleanup
  }, [profile]);
  
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
        const onlyStudents = studentsArray.filter(
          (user: any) => user.role === "Student"
        );
        setStudents(onlyStudents);
      } else {
        setStudents([]);
      }
    });
    return () => unsubscribe();
  }, []);
  
  useEffect(() => {
    if (role === "Student" && profile?.id) {
      console.log("Looking for history at path:", `users/${profile.id}/checkInHistory`);
      
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
          console.log("No history data found at path");
          setRecentHistory([]);
        }
      }, (error) => {
        console.error("Firebase error:", error);
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

      await set(ref(db, `users/${student.id}/checkInHistory/${historyId}`), historyData);
      console.log(`History saved for student ${student.id}:`, historyData);
      
      await set(ref(db, `users/${student.id}/checkInStatus`), false);
      await set(ref(db, `users/${student.id}/checkInInfo`), null);

      Alert.alert("✅ Success", `${student.fullName} has been dropped off.`);
      
    } catch (error) {
      console.error("Error dropping off student:", error);
      Alert.alert("Error", "Failed to drop off student.");
    }
  };

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const data = await AsyncStorage.getItem("userProfile");
        if (!data) {
          setLoading(false);
          return;
        }
  
        const profileData = JSON.parse(data);
        setProfile(profileData);
        setRole(profileData.role);
  
        const savedAddress = await AsyncStorage.getItem("permanentAddress");
        const snap = await get(ref(db, `users/${profileData.id}`));
        const userFromDb = snap.exists() ? snap.val() : {};
  
        const addr = savedAddress ?? userFromDb.permanentAddress ?? "";
  
        const dataObj = {
          fullName: profileData.fullName || "",
          id: profileData.id || "",
          mobile: profileData.mobile || "",
          permanentAddress: addr,
          role: profileData.role || "",
          status: userFromDb.checkedInStatus ? "Riding..." : "Still in School",
        };
  
        setAddress(addr);
        setStudentDataForQR(JSON.stringify(dataObj));
        setShowQR(true);
      } catch (e) {
        console.log("loadProfile error:", e);
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
  
      let loc = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = loc.coords;
  
      let geocode = await Location.reverseGeocodeAsync({
        latitude,
        longitude,
      });
  
      if (geocode.length > 0) {
        const addr = `${geocode[0].street || ""} ${geocode[0].city || ""}, ${geocode[0].region || ""}, ${geocode[0].country || ""}`;
        setAddress(addr);
      } else {
        setAddress(`${latitude}, ${longitude}`);
      }
  
      Alert.alert("GPS Location Set", "Your current location has been captured.");
    } catch (error) {
      console.log("Error getting location:", error);
      Alert.alert("Error", "Unable to fetch your location.");
    }
  };

  const generateQRFromFirebase = async (userId: string) => {
    try {
      const snapshot = await get(ref(db, `users/${userId}`));
      if (snapshot.exists()) {
        const profileData = snapshot.val();
  
        const dataObj = {
          fullName: profileData.fullName || "",
          id: userId,
          mobile: profileData.mobile || "",
          permanentAddress: profileData.permanentAddress || "",
          role: profileData.role || "",
        };
  
        setStudentDataForQR(JSON.stringify(dataObj));
        setShowQR(true);
      } else {
        Alert.alert("Error", "No user data found in Firebase.");
      }
    } catch (error) {
      console.log("Error fetching profile for QR:", error);
    }
  };

  const handleSavePermanentAddress = async () => {
    try {
      await AsyncStorage.setItem("permanentAddress", address);

      if (profile?.id) {
        await set(ref(db, `users/${profile.id}/permanentAddress`), address);
      }

      await generateQRFromFirebase(profile.id);
      setPermanentAddressSaved(true);
      setModalVisible(false);

      const dataObj = {
        fullName: profile?.fullName || "",
        id: profile?.id || "",
        mobile: profile?.mobile || "",
        permanentAddress: address || "",
        role: profile?.role || "",
      };

      setStudentDataForQR(JSON.stringify(dataObj));
      setShowQR(true);

      Alert.alert("✅ Success", "Permanent Address set Successfully");
    } catch (error) {
      console.log("Error saving address:", error);
    }
  };

  const filteredStudents = students.filter((student) =>
  (student.fullName ?? "").toLowerCase().includes(search.toLowerCase()) ||
  (student.id ?? "").toLowerCase().includes(search.toLowerCase()) ||
  (student.mobile ?? "").toLowerCase().includes(search.toLowerCase())
  );


  useEffect(() => {
    const studentsRef = ref(db, "users");
  
    const unsubscribe = onValue(studentsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const studentsArray = Object.values(data);
  
        // Normalize student data to prevent undefined
        const onlyStudents = studentsArray
          .filter((user: any) => user.role === "Student")
          .map((student: any) => ({
            fullName: student.fullName ?? "",
            id: student.id ?? "",
            mobile: student.mobile ?? "",
            permanentAddress: student.permanentAddress ?? "",
            checkInInfo: student.checkInInfo ?? null,
            checkInStatus: student.checkInStatus ?? false
          }));
  
        setStudents(onlyStudents);
      } else {
        setStudents([]);
      }
    });
  
    return () => unsubscribe();
  }, []);
  
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

  const getStatusIcon = (status?: string) => {
    const safeStatus = status ?? ""; // default to empty string if undefined or null
    return safeStatus === "Checked In" || safeStatus.includes("Riding") ? "🚌" : "🏫";
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
        {/* Student View */}
        {role === "Student" ? (
          <View style={styles.modernCard}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>📍 Your Location</Text>
              <View style={styles.statusIndicator}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText}>Active</Text>
              </View>
            </View>

            <View style={styles.inputContainer}>
              <TextInput
                placeholder="Enter your address"
                placeholderTextColor="#9ca3af"
                value={address}
                onChangeText={setAddress}
                style={styles.modernInput}
              />
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.modernButton, styles.primaryButton]}
                onPress={() => setModalVisible(true)}
              >
                <Text style={styles.buttonText}>
                  {address ? "Update Address" : "Set Address"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modernButton, styles.successButton]}
                onPress={handleUseCurrentLocation}
              >
                <Text style={styles.buttonText}>Use GPS</Text>
              </TouchableOpacity>
            </View>

            {showQR && studentDataForQR && (
              <View style={styles.qrSection}>
                <View style={styles.qrHeader}>
                  <Text style={styles.qrTitle}>🎫 Your QR Code</Text>
                  <View style={styles.qrBadge}>
                    <Text style={styles.qrBadgeText}>Ready to Scan</Text>
                  </View>
                </View>
                
                <View style={styles.qrCodeContainer}>
                  <QRCode 
                    value={studentDataForQR} 
                    size={180}
                    backgroundColor="#ffffff"
                    color="#1e40af"
                  />
                </View>

                {/* Enhanced Recent History */}
                <View style={styles.historySection}>
                  <Text style={styles.historyTitle}>📚 Recent Activity</Text>
                  {recentHistory.length > 0 ? (
                    recentHistory.map((item, index) => (
                      <View key={index} style={styles.historyCard}>
                        <View style={styles.historyHeader}>
                          <Text style={styles.historyStatus}>
                            {getStatusIcon(item.status)} {item.status}
                          </Text>
                          <Text style={styles.historyTime}>
                            {new Date(item.timestamp).toLocaleDateString()}
                          </Text>
                        </View>
                        <Text style={styles.historyDriver}>
                          Driver: {item.driverName || "N/A"}
                        </Text>
                        <Text style={styles.historyTimestamp}>
                          {new Date(item.timestamp).toLocaleTimeString()}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <View style={styles.emptyState}>
                      <Text style={styles.emptyIcon}>🌟</Text>
                      <Text style={styles.emptyText}>No recent activity</Text>
                      <Text style={styles.emptySubtext}>Your travel history will appear here</Text>
                    </View>
                  )}
                </View>
              </View>
            )}
          </View>
        ) : role === "Driver" ? (
          <>
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

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>🚌 Your Passengers</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countText}>
                  {filteredStudents.filter(
                    student => student.checkInInfo?.status && student.checkInInfo.driverId === profile?.id
                  ).length}
                </Text>
              </View>
            </View>

            {filteredStudents.filter(
                student => student.checkInInfo?.status && student.checkInInfo.driverId === profile?.id
              ).length > 0 ? (
                filteredStudents
                  .filter(student => student.checkInInfo?.status && student.checkInInfo.driverId === profile?.id)
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
                  <Text style={styles.emptySubtext}>Students will appear here when they check in</Text>
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
              <Text style={styles.sectionTitle}>👨‍🎓 Students</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countText}>{filteredStudents.length}</Text>
              </View>
            </View>

            {filteredStudents.length > 0 ? (
              filteredStudents.map((student, index) => (
                <TouchableOpacity
                  key={index}
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
                        <View style={[
                          styles.statusIndicator,
                          { backgroundColor: student.checkInStatus ? '#10b981' : '#f59e0b' }
                        ]}>
                          <Text style={styles.statusEmoji}>
                            {student.checkInStatus ? "🚌" : "🏫"}
                          </Text>
                          <Text style={styles.statusLabel}>
                            {student.checkInStatus ? "Riding" : "At School"}
                          </Text>
                        </View>
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
                <Text style={styles.emptySubtext}>Try adjusting your search</Text>
              </View>
            )}
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
  headerContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    zIndex: 2,
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
  passengerCard: {
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
  passengerInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
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
  dropOffButton: {
    backgroundColor: "#dc2626",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    elevation: 2,
    shadowColor: "#dc2626",
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  dropOffIcon: {
    color: "#fff",
    fontSize: 14,
    marginRight: 6,
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

  // Empty State
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 40,
    marginVertical: 20,
    borderWidth: 2,
    borderColor: "#f1f5f9",
    borderStyle: "dashed",
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
    opacity: 0.6,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#64748b",
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#94a3b8",
    textAlign: "center",
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
  closeButton: {
    backgroundColor: "#3b82f6",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    elevation: 2,
    shadowColor: "#3b82f6",
    shadowOpacity: 0.3,
    shadowRadius: 4,
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
});