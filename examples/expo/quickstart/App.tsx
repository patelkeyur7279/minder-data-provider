import { StatusBar } from "expo-status-bar";
import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  Button,
  ScrollView,
  Image,
  Alert,
} from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMinder } from "minder-data-provider";
import * as SecureStore from "expo-secure-store";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";

/**
 * Expo Quick Start - Minder Data Provider
 *
 * Demonstrates:
 * - useMinder() for data fetching
 * - SecureStore for sensitive data
 * - FileSystem for file operations
 * - ImagePicker integration
 * - Platform-specific features
 */

const queryClient = new QueryClient();

interface User {
  id: number;
  name: string;
  email: string;
  phone: string;
}

function MainApp() {
  const [userId, setUserId] = useState(1);
  const [savedToken, setSavedToken] = useState<string | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);

  /**
   * Fetch user data with useMinder()
   *
   * Why useMinder()?
   * - Automatic caching
   * - Loading/error states
   * - Refetch on focus
   * - Same API across platforms
   */
  const {
    data: user,
    isLoading,
    error,
  } = useMinder<User>({
    route: `https://jsonplaceholder.typicode.com/users/${userId}`,
  });

  /**
   * SecureStore Example
   *
   * Why SecureStore?
   * - Encrypted storage for sensitive data
   * - API tokens, passwords, secrets
   * - Native keychain (iOS) / KeyStore (Android)
   */
  const handleSaveToken = async () => {
    try {
      const token = `token_${Date.now()}`;
      await SecureStore.setItemAsync("userToken", token);
      Alert.alert("Success", "Token saved securely!");
    } catch (error) {
      Alert.alert("Error", "Failed to save token");
    }
  };

  const handleLoadToken = async () => {
    try {
      const token = await SecureStore.getItemAsync("userToken");
      setSavedToken(token);
      Alert.alert("Token", token || "No token found");
    } catch (error) {
      Alert.alert("Error", "Failed to load token");
    }
  };

  /**
   * FileSystem Example
   *
   * Why FileSystem?
   * - Download/upload files
   * - Cache images/videos
   * - Offline storage
   * - File manipulation
   */
  const handleDownloadFile = async () => {
    try {
      const downloadResumable = FileSystem.createDownloadResumable(
        "https://picsum.photos/200",
        FileSystem.documentDirectory + "photo.jpg"
      );

      const result = await downloadResumable.downloadAsync();
      if (result) {
        Alert.alert("Success", `Downloaded to: ${result.uri}`);
      }
    } catch (error) {
      Alert.alert("Error", "Download failed");
    }
  };

  /**
   * ImagePicker Example
   *
   * Why ImagePicker?
   * - Camera/gallery access
   * - Image selection
   * - Upload preparation
   * - Crop/resize
   */
  const handlePickImage = async () => {
    // Request permission
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission denied", "Need camera roll permissions");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled) {
      setImageUri(result.assets[0].uri);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>🚀 Expo + Minder</Text>
      <Text style={styles.subtitle}>Quick Start Example</Text>

      {/* Data Fetching Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📡 Data Fetching</Text>

        {isLoading && <Text>Loading user...</Text>}
        {error && <Text style={styles.error}>Error: {error.message}</Text>}

        {user && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{user.name}</Text>
            <Text style={styles.cardText}>Email: {user.email}</Text>
            <Text style={styles.cardText}>Phone: {user.phone}</Text>
          </View>
        )}

        <View style={styles.buttonRow}>
          <Button
            title='Prev User'
            onPress={() => setUserId((id) => Math.max(1, id - 1))}
          />
          <Button
            title='Next User'
            onPress={() => setUserId((id) => Math.min(10, id + 1))}
          />
        </View>
      </View>

      {/* SecureStore Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔐 Secure Storage</Text>
        <Text style={styles.description}>
          SecureStore uses native encryption for sensitive data
        </Text>

        {savedToken && (
          <View style={styles.card}>
            <Text style={styles.cardText}>Token: {savedToken}</Text>
          </View>
        )}

        <View style={styles.buttonRow}>
          <Button title='Save Token' onPress={handleSaveToken} />
          <Button title='Load Token' onPress={handleLoadToken} />
        </View>
      </View>

      {/* FileSystem Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📁 File System</Text>
        <Text style={styles.description}>
          Download, cache, and manage files
        </Text>

        <Button title='Download Image' onPress={handleDownloadFile} />
      </View>

      {/* ImagePicker Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📸 Image Picker</Text>
        <Text style={styles.description}>Access camera and photo library</Text>

        {imageUri && <Image source={{ uri: imageUri }} style={styles.image} />}

        <Button title='Pick Image' onPress={handlePickImage} />
      </View>

      {/* Platform Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ℹ️ Platform Info</Text>
        <View style={styles.card}>
          <Text style={styles.cardText}>
            Document Dir: {FileSystem.documentDirectory}
          </Text>
          <Text style={styles.cardText}>
            Cache Dir: {FileSystem.cacheDirectory}
          </Text>
        </View>
      </View>

      <StatusBar style='auto' />
    </ScrollView>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MainApp />
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    textAlign: "center",
    marginTop: 60,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 24,
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: "#666",
    marginBottom: 16,
  },
  card: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  cardText: {
    fontSize: 14,
    color: "#374151",
    marginBottom: 4,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    gap: 12,
  },
  error: {
    color: "#ef4444",
    marginBottom: 12,
  },
  image: {
    width: "100%",
    height: 200,
    borderRadius: 8,
    marginBottom: 12,
  },
});
