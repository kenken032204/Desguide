import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  Alert, 
  ScrollView, 
  Animated, 
  Vibration, 
  StatusBar,
  Dimensions,
  ActivityIndicator
} from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from "../../config/firebaseConfig";
import { ref, get, set, push } from "firebase/database";
import { Ionicons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

export default function App() {
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [formattedData, setFormattedData] = useState<any>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [flashMode, setFlashMode] = useState<'off' | 'on'>('off');
  
  // Animation values
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const cardAnim = useRef(new Animated.Value(0)).current;
  const successAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loadUserProfile = async () => {
      try {
        const data = await AsyncStorage.getItem("userProfile");
        if (data) {
          const profile = JSON.parse(data);
          setCurrentUserId(profile.id);
          setCurrentUserRole(profile.role);
          setCurrentUserName(profile.fullName);
        }
      } catch (e) {
        console.log("Failed to load user profile:", e);
      }
    };
    loadUserProfile();

    if (!permission?.granted) {
      requestPermission();
    }

    // Start scanning animation
    startScanAnimation();
  }, [permission]);

  const startScanAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: false,
        }),
        Animated.timing(scanLineAnim, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: false,
        }),
      ])
    ).start();
  };

  const handleBarcodeScanned = (result: BarcodeScanningResult) => {
    if (!scanned && !isProcessing) {
      setScanned(true);
      setIsProcessing(true);
      Vibration.vibrate(100); // Haptic feedback
      
      try {
        const scannedData = JSON.parse(result.data);

        if (scannedData.id === currentUserId) {
          Alert.alert(
            '❌ Error', 
            'You cannot scan and check in yourself.',
            [{ text: 'OK', onPress: () => resetScanning() }]
          );
          return;
        }

        setFormattedData(scannedData);
        
        // Animate card appearance
        Animated.spring(cardAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 50,
          friction: 8,
        }).start();

        Alert.alert(
          '✅ QR Code Scanned', 
          'Data received successfully',
          [{ text: 'OK', onPress: () => setIsProcessing(false) }]
        );
      } catch (e) {
        Alert.alert(
          '⚠️ Invalid QR Code', 
          `Unable to parse QR code data: ${result.data}`,
          [{ text: 'OK', onPress: () => resetScanning() }]
        );
      }
    }
  };

  const resetScanning = () => {
    setScanned(false);
    setIsProcessing(false);
    setFormattedData(null);
    cardAnim.setValue(0);
  };

  const toggleCameraFacing = () => {
    setFacing(prev => (prev === 'back' ? 'front' : 'back'));
  };

  const toggleFlash = () => {
    setFlashMode(prev => prev === 'off' ? 'on' : 'off');
  };

  // Enhanced Check-In with better UX
  const handleCheckIn = async () => {
    if (!formattedData) return;
    
    setIsProcessing(true);
    
    try {
      const studentId = formattedData.id;
      const studentRef = ref(db, `users/${studentId}/checkInInfo/`);
      const snapshot = await get(studentRef);

      if (snapshot.exists() && snapshot.val().status === true) {
        const checkInInfo = snapshot.val();
        const date = new Date(checkInInfo.timestamp);
        const formattedTime = date.toLocaleString();

        Alert.alert(
          "⚠️ Already Checked In",
          `${formattedData.fullName} was already checked in on ${formattedTime} by ${checkInInfo.driverName}.`,
          [{ text: 'OK', onPress: () => setIsProcessing(false) }]
        );
        return;
      }

      // Save latest check-in info
      await set(studentRef, {
        status: true,
        driverId: currentUserId,
        driverName: currentUserName,
        driverRole: currentUserRole,
        timestamp: new Date().toISOString(),
      });

      // Save to history
      const historyRef = push(ref(db, `users/${studentId}/checkInHistory`));
      await set(historyRef, {
        action: "checked_in",
        driverId: currentUserId,
        driverName: currentUserName,
        timestamp: new Date().toISOString(),
        status: "Checked In"
      });

      await set(ref(db, `users/${studentId}/checkInStatus`), true);

      // Success animation
      Animated.sequence([
        Animated.timing(successAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.delay(1500),
        Animated.timing(successAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      Alert.alert(
        "✅ Check-In Successful!", 
        `${formattedData.fullName} is now your passenger!`,
        [{ 
          text: 'Continue Scanning', 
          onPress: () => {
            setFormattedData(null);
            setIsProcessing(false);
            setScanned(false);
            cardAnim.setValue(0);
          }
        }]
      );
      
    } catch (e) {
      console.log(e);
      Alert.alert(
        "❌ Error", 
        "Failed to update check-in status. Please try again.",
        [{ text: 'OK', onPress: () => setIsProcessing(false) }]
      );
    }
  };

  // Permission states
  if (!permission) return <LoadingScreen />;
  
  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.center]}>
        <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
        <Ionicons name="camera-outline" size={80} color="#6c757d" />
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionText}>
          We need camera permission to scan QR codes for student check-ins
        </Text>
        <TouchableOpacity style={styles.grantButton} onPress={requestPermission}>
          <Ionicons name="checkmark-circle" size={20} color="white" />
          <Text style={styles.grantButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Role-based access control
  if (currentUserRole === "Student") {
    return (
      <RestrictedAccess 
        icon="school-outline" 
        title="Student Access Restricted" 
        message="Only drivers and administrators can scan QR codes for check-ins."
      />
    );
  }

  if (currentUserRole === "Parent") {
    return (
      <RestrictedAccess 
        icon="people-outline" 
        title="Parent Access Restricted" 
        message="Please contact the driver for student check-ins. Parents cannot perform scanning operations."
      />
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a1a" />
      
      {/* Camera View */}
      <View style={styles.cameraContainer}>
        <CameraView
          style={styles.camera}
          facing={facing}
          flash={flashMode}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={handleBarcodeScanned}
        >
          {/* Scanning Overlay */}
          <View style={styles.scanOverlay}>
            <View style={styles.scanFrame}>
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
              
              {/* Animated scan line */}
              <Animated.View
                style={[
                  styles.scanLine,
                  {
                    top: scanLineAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%'],
                    }),
                  },
                ]}
              />
            </View>
            
            <Text style={styles.scanText}>
              {scanned ? 'Processing...' : 'Position QR code within the frame'}
            </Text>
          </View>

          {/* Camera Controls */}
          <View style={styles.controlsOverlay}>
            <TouchableOpacity 
              style={[styles.controlButton, flashMode === 'on' && styles.controlButtonActive]} 
              onPress={toggleFlash}
            >
              <Ionicons 
                name={flashMode === 'off' ? 'flash-off' : 'flash'} 
                size={24} 
                color={flashMode === 'on' ? '#fff' : 'rgba(255,255,255,0.8)'} 
              />
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.controlButton} onPress={toggleCameraFacing}>
              <Ionicons name="camera-reverse" size={24} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
          </View>
        </CameraView>
      </View>

      {/* Data Display */}
      <ScrollView style={styles.dataContainer} showsVerticalScrollIndicator={false}>
        {formattedData ? (
          <Animated.View
            style={[
              styles.card,
              {
                opacity: cardAnim,
                transform: [
                  {
                    translateY: cardAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [50, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.cardHeader}>
              <Ionicons name="person-circle" size={40} color="#007AFF" />
              <Text style={styles.cardTitle}>Student Information</Text>
            </View>

            <DataRow icon="person" label="Name" value={formattedData.fullName} />
            <DataRow icon="card" label="Student ID" value={formattedData.id} />
            <DataRow icon="call" label="Mobile" value={formattedData.mobile} />
            <DataRow icon="location" label="Address" value={formattedData.permanentAddress} />
            <DataRow icon="shield-checkmark" label="Role" value={formattedData.role} />

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.actionButton, styles.cancelButton]}
                onPress={() => {
                  setFormattedData(null);
                  setScanned(false);
                  setIsProcessing(false);
                  cardAnim.setValue(0);
                }}
                disabled={isProcessing}
              >
                <Ionicons name="close-circle" size={20} color="#fff" />
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.checkInButton]}
                onPress={handleCheckIn}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                )}
                <Text style={styles.buttonText}>
                  {isProcessing ? 'Processing...' : 'Check In'}
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="qr-code-outline" size={80} color="#e9ecef" />
            <Text style={styles.emptyStateTitle}>Ready to Scan</Text>
            <Text style={styles.emptyStateText}>
              Point your camera at a student's QR code to begin check-in process
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Success Overlay */}
      <Animated.View
        style={[
          styles.successOverlay,
          {
            opacity: successAnim,
            transform: [
              {
                scale: successAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.5, 1],
                }),
              },
            ],
          },
        ]}
        pointerEvents="none"
      >
        <Ionicons name="checkmark-circle" size={80} color="#28a745" />
        <Text style={styles.successText}>Check-In Successful!</Text>
      </Animated.View>
    </View>
  );
}

// Reusable Components
function LoadingScreen() {
  return (
    <View style={[styles.container, styles.center]}>
      <ActivityIndicator size="large" color="#007AFF" />
      <Text style={styles.loadingText}>Loading camera...</Text>
    </View>
  );
}

function RestrictedAccess({ icon, title, message }: { icon: string; title: string; message: string }) {
  return (
    <View style={[styles.container, styles.center]}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
      <Ionicons name={icon as any} size={80} color="#6c757d" />
      <Text style={styles.restrictedTitle}>{title}</Text>
      <Text style={styles.restrictedText}>{message}</Text>
    </View>
  );
}

function DataRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.dataRow}>
      <View style={styles.dataRowLeft}>
        <Ionicons name={icon as any} size={20} color="#6c757d" />
        <Text style={styles.dataLabel}>{label}</Text>
      </View>
      <Text style={styles.dataValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  
  // Permission styles
  permissionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#343a40',
    marginTop: 20,
    marginBottom: 10,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: 16,
    color: '#6c757d',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 24,
  },
  grantButton: {
    backgroundColor: '#007AFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 30,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  grantButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
    marginLeft: 8,
  },

  // Restricted access styles
  restrictedTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#dc3545',
    marginTop: 20,
    marginBottom: 10,
    textAlign: 'center',
  },
  restrictedText: {
    fontSize: 16,
    color: '#6c757d',
    textAlign: 'center',
    lineHeight: 24,
  },

  // Camera styles
  cameraContainer: {
    flex: 1.2,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  scanOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  scanFrame: {
    width: width * 0.7,
    height: width * 0.7,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#007AFF',
    borderWidth: 3,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderBottomWidth: 0,
    borderRightWidth: 0,
  },
  topRight: {
    top: 0,
    right: 0,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderTopWidth: 0,
    borderRightWidth: 0,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderTopWidth: 0,
    borderLeftWidth: 0,
  },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#007AFF',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  scanText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 30,
    fontWeight: '500',
  },
  controlsOverlay: {
    position: 'absolute',
    top: 50,
    right: 20,
    flexDirection: 'column',
  },
  controlButton: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  controlButtonActive: {
    backgroundColor: 'rgba(255,193,7,0.8)',
  },

  // Data container styles
  dataContainer: {
    flex: 1,
    backgroundColor: '#fff',
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    marginTop: -25,
  },
  card: {
    backgroundColor: '#fff',
    margin: 20,
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#343a40',
    marginLeft: 12,
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f8f9fa',
  },
  dataRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  dataLabel: {
    fontWeight: '600',
    fontSize: 16,
    color: '#495057',
    marginLeft: 10,
  },
  dataValue: {
    fontSize: 16,
    color: '#212529',
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    gap: 12,
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
    backgroundColor: '#6c757d',
  },
  checkInButton: {
    backgroundColor: '#28a745',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 60,
    paddingTop: 80,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#495057',
    marginTop: 20,
    marginBottom: 10,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#6c757d',
    textAlign: 'center',
    lineHeight: 24,
  },

  // Success overlay
  successOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  successText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#28a745',
    marginTop: 16,
  },

  // Loading
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6c757d',
  },
});