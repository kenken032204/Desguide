import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  ActivityIndicator,
  Animated,
  StatusBar,
  RefreshControl,
  Modal,
  Dimensions,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { getDatabase, ref as dbRef, set, get } from "firebase/database";
import { db } from "../../config/firebaseConfig";
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

interface UserProfile {
  fullName: string;
  role: string;
  mobile: string;
  id: string;
  address?: string;
  status?: string;
  profileImageUri?: string;
  joinDate?: string;
  lastActive?: string;
  checkInsCount?: number;
}

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profilePic, setProfilePic] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [imageUploadLoading, setImageUploadLoading] = useState(false);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const profileImageAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadProfile();
    startAnimations();
  }, []);

  const startAnimations = () => {
    Animated.parallel([
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
      Animated.timing(profileImageAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const loadProfile = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    
    try {
      const stored = await AsyncStorage.getItem("userProfile");
      const imageUri = await AsyncStorage.getItem("profileImageUri");

      if (stored) {
        const localProfile = JSON.parse(stored);

        try {
          const snapshot = await get(dbRef(db, `users/${localProfile.id}`));
          if (snapshot.exists()) {
            const data = snapshot.val();

            const updatedProfile: UserProfile = {
              id: localProfile.id,
              fullName: data.fullName || localProfile.fullName,
              mobile: data.mobile || localProfile.mobile,
              role: data.role || localProfile.role,
              address: data.address || localProfile.address,
              status: data.status || "unverified",
              profileImageUri: data.profileImageUri || localProfile.profileImageUri,
              joinDate: data.joinDate || "Unknown",
              lastActive: data.lastActive || new Date().toISOString(),
              checkInsCount: data.checkInsCount || 0,
            };

            setProfile(updatedProfile);
            await AsyncStorage.setItem("userProfile", JSON.stringify(updatedProfile));
          } else {
            setProfile(localProfile);
          }
        } catch (err) {
          console.error("Error fetching profile:", err);
          setProfile(localProfile);
        }

        if (imageUri) setProfilePic(imageUri);
      } else {
        router.replace("/index");
      }
    } catch (error) {
      console.error("Error loading profile:", error);
      Alert.alert("Error", "Failed to load profile data");
    } finally {
      setLoading(false);
      if (isRefresh) setRefreshing(false);
    }
  };

  const onRefresh = () => {
    loadProfile(true);
  };

  const handleLogout = async () => {
    Alert.alert(
      "Confirm Logout", 
      "Are you sure you want to log out?", 
      [
        { 
          text: "Cancel", 
          style: "cancel",
          onPress: () => console.log("Logout cancelled")
        },
        {
          text: "Log Out",
          style: "destructive",
          onPress: async () => {
            try {
              // Animate out (if fadeAnim is defined in your component)
              if (fadeAnim) {
                Animated.timing(fadeAnim, {
                  toValue: 0,
                  duration: 300,
                  useNativeDriver: true,
                }).start();
              }
  
              // Clear specific authentication keys
              await AsyncStorage.removeItem("userCredentials");
              await AsyncStorage.removeItem("userProfile");
              
              // Optional: Clear everything if you want
              // await AsyncStorage.clear();
              
              // Navigate to welcome screen
              router.replace("/");
            } catch (error) {
              console.log("Error logging out:", error);
              Alert.alert("Error", "Failed to log out properly");
            }
          },
        },
      ]
    );
  };

  const handleImageSelection = () => {
    setModalVisible(true);
  };

  const selectImageFromLibrary = async () => {
    setModalVisible(false);
    setImageUploadLoading(true);

    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant photo library permissions to continue.');
        setImageUploadLoading(false);
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
      });

      if (!result.canceled && result.assets && result.assets[0].uri) {
        await saveProfileImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error("Error selecting image:", error);
      Alert.alert("Error", "Failed to select image");
    } finally {
      setImageUploadLoading(false);
    }
  };

  const takePhoto = async () => {
    setModalVisible(false);
    setImageUploadLoading(true);

    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant camera permissions to continue.');
        setImageUploadLoading(false);
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0].uri) {
        await saveProfileImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error("Error taking photo:", error);
      Alert.alert("Error", "Failed to take photo");
    } finally {
      setImageUploadLoading(false);
    }
  };

  const saveProfileImage = async (pickedUri: string) => {
    try {
      const fileName = `profile_${profile?.id}_${Date.now()}.jpg`;
      const localUri = FileSystem.documentDirectory + fileName;

      await FileSystem.copyAsync({
        from: pickedUri,
        to: localUri,
      });

      setProfilePic(localUri);
      await AsyncStorage.setItem("profileImageUri", localUri);

      if (profile) {
        const updatedProfile = { ...profile, profileImageUri: localUri };
        await AsyncStorage.setItem("userProfile", JSON.stringify(updatedProfile));
        setProfile(updatedProfile);

        // Save to database
        await set(dbRef(db, `users/${profile.id}/profileImageUri`), localUri);
      }

      Alert.alert("Success", "Profile picture updated successfully!");
    } catch (error) {
      console.error("Error saving profile image:", error);
      Alert.alert("Error", "Failed to update profile picture");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'verified': return '#28a745';
      case 'pending': return '#ffc107';
      default: return '#dc3545';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'verified': return 'checkmark-circle';
      case 'pending': return 'time';
      default: return 'close-circle';
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role?.toLowerCase()) {
      case 'student': return 'school';
      case 'driver': return 'car';
      case 'parent': return 'people';
      case 'admin': return 'shield-checkmark';
      default: return 'person';
    }
  };

  const formatJoinDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return 'Unknown';
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
      
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#667eea']}
            tintColor="#667eea"
          />
        }
      >
        {/* Header with Gradient */}
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          style={styles.headerGradient}
        >
          <Animated.View
            style={[
              styles.profileSection,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            {/* Profile Image */}
            <View style={styles.imageContainer}>
              <TouchableOpacity
                onPress={handleImageSelection}
                disabled={imageUploadLoading}
                style={styles.imageWrapper}
              >
                <Animated.View
                  style={[
                    styles.imageAnimated,
                    {
                      opacity: profileImageAnim,
                      transform: [
                        {
                          scale: profileImageAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.8, 1],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <Image
                    source={
                      profilePic
                        ? { uri: profilePic }
                        : require("../../assets/Portrait_Placeholder.png")
                    }
                    style={styles.profileImage}
                  />
                  
                  {imageUploadLoading && (
                    <View style={styles.imageLoadingOverlay}>
                      <ActivityIndicator size="small" color="#fff" />
                    </View>
                  )}
                  
                  <View style={styles.cameraIconContainer}>
                    <Ionicons name="camera" size={20} color="#fff" />
                  </View>
                </Animated.View>
              </TouchableOpacity>
            </View>

            {/* Profile Info */}
            <View style={styles.profileInfo}>
              <Text style={styles.userName}>{profile?.fullName}</Text>
              <View style={styles.roleContainer}>
                <Ionicons name={getRoleIcon(profile?.role || '')} size={18} color="#fff" />
                <Text style={styles.userRole}>{profile?.role}</Text>
              </View>
              <Text style={styles.userId}>ID: {profile?.id}</Text>
            </View>
          </Animated.View>
        </LinearGradient>

        {/* Content Cards */}
        <View style={styles.contentContainer}>
          {/* Status Card */}
          <Animated.View
            style={[
              styles.card,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <View style={styles.cardHeader}>
              <Ionicons name="shield-checkmark" size={24} color="#667eea" />
              <Text style={styles.cardTitle}>Verification Status</Text>
            </View>
            
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(profile?.status || 'unverified') + '15' }]}>
              <Ionicons
                name={getStatusIcon(profile?.status || 'unverified')}
                size={24}
                color={getStatusColor(profile?.status || 'unverified')}
              />
              <Text style={[styles.statusText, { color: getStatusColor(profile?.status || 'unverified') }]}>
                {profile?.status === 'verified' ? 'ID Verified' : 
                 profile?.status === 'pending' ? 'Verification Pending' : 'ID Not Verified'}
              </Text>
            </View>
          </Animated.View>

          {/* Contact Information Card */}
          <Animated.View
            style={[
              styles.card,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <View style={styles.cardHeader}>
              <Ionicons name="information-circle" size={24} color="#667eea" />
              <Text style={styles.cardTitle}>Contact Information</Text>
            </View>
            
            <InfoRow icon="call" label="Mobile" value={profile?.mobile || 'Not provided'} />
            <InfoRow icon="location" label="Address" value={profile?.address || 'Not provided'} />
            <InfoRow icon="calendar" label="Member Since" value={formatJoinDate(profile?.joinDate || '')} />
          </Animated.View>

          {/* Activity Statistics Card */}
          <Animated.View
            style={[
              styles.card,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <View style={styles.cardHeader}>
              <Ionicons name="analytics" size={24} color="#667eea" />
              <Text style={styles.cardTitle}>Activity Statistics</Text>
            </View>
            
            <View style={styles.statsContainer}>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{profile?.checkInsCount || 0}</Text>
                <Text style={styles.statLabel}>Check-ins</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>
                  {profile?.lastActive ? new Date(profile.lastActive).toLocaleDateString() : 'N/A'}
                </Text>
                <Text style={styles.statLabel}>Last Active</Text>
              </View>
            </View>
          </Animated.View>

          {/* Settings Card */}
          <Animated.View
            style={[
              styles.card,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <View style={styles.cardHeader}>
              <Ionicons name="settings" size={24} color="#667eea" />
              <Text style={styles.cardTitle}>Settings</Text>
            </View>

            <SettingsOption
              icon="person"
              title="Edit Profile"
              subtitle="Update your personal information"
              onPress={() => router.push("../settings/edit-profile")}
            />
          </Animated.View>

          {/* Logout Button */}
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out" size={24} color="#fff" />
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Image Selection Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Change Profile Picture</Text>
            
            <TouchableOpacity style={styles.modalOption} onPress={takePhoto}>
              <Ionicons name="camera" size={24} color="#667eea" />
              <Text style={styles.modalOptionText}>Take Photo</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.modalOption} onPress={selectImageFromLibrary}>
              <Ionicons name="images" size={24} color="#667eea" />
              <Text style={styles.modalOptionText}>Choose from Gallery</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.modalOption, styles.cancelOption]}
              onPress={() => setModalVisible(false)}
            >
              <Ionicons name="close" size={24} color="#dc3545" />
              <Text style={[styles.modalOptionText, { color: '#dc3545' }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// Helper Components
function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoRowLeft}>
        <Ionicons name={icon as any} size={20} color="#6c757d" />
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function SettingsOption({
  icon,
  title,
  subtitle,
  onPress,
  isLast = false,
}: {
  icon: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  isLast?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.settingsOption, !isLast && styles.settingsOptionBorder]}
      onPress={onPress}
    >
      <View style={styles.settingsOptionLeft}>
        <View style={styles.settingsIconContainer}>
          <Ionicons name={icon as any} size={20} color="#667eea" />
        </View>
        <View style={styles.settingsTextContainer}>
          <Text style={styles.settingsTitle}>{title}</Text>
          <Text style={styles.settingsSubtitle}>{subtitle}</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#c7c7cc" />
    </TouchableOpacity>
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
  scrollView: {
    flex: 1,
  },
  headerGradient: {
    paddingTop: Platform.OS === 'ios' ? 20 : 40,
    paddingBottom: 40,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  profileSection: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  imageContainer: {
    marginBottom: 20,
  },
  imageWrapper: {
    position: 'relative',
  },
  imageAnimated: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'hidden',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 12,
  },
  profileImage: {
    width: '100%',
    height: '100%',
    borderRadius: 60,
  },
  imageLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 60,
  },
  cameraIconContainer: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    backgroundColor: '#667eea',
    borderRadius: 15,
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  profileInfo: {
    alignItems: 'center',
  },
  userName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  roleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 8,
  },
  userRole: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
    marginLeft: 6,
    textTransform: 'capitalize',
  },
  userId: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
  },
  contentContainer: {
    padding: 20,
    paddingTop: 30,
  },
  card: {
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f8f9fa',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2c3e50',
    marginLeft: 10,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    justifyContent: 'center',
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f8f9fa',
  },
  infoRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  infoLabel: {
    fontSize: 16,
    color: '#6c757d',
    marginLeft: 12,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 16,
    color: '#2c3e50',
    fontWeight: '600',
    textAlign: 'right',
    flex: 1,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#667eea',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: '#6c757d',
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#e9ecef',
    marginHorizontal: 20,
  },
  settingsOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  settingsOptionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#f8f9fa',
  },
  settingsOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingsIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#667eea15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  settingsTextContainer: {
    flex: 1,
  },
  settingsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 2,
  },
  settingsSubtitle: {
    fontSize: 14,
    color: '#6c757d',
  },
  logoutButton: {
    backgroundColor: '#dc3545',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 10,
    marginBottom: 20,
    shadowColor: '#dc3545',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  logoutText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 20,
    color: '#2c3e50',
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f8f9fa',
  },
  modalOptionText: {
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 12,
    color: '#2c3e50',
  },
  cancelOption: {
    borderBottomWidth: 0,
  },
});