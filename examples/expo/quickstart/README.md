# Expo Quick Start

Quick start example showing **Minder Data Provider** integration with Expo's platform features.

## 🎯 What You'll Learn

- `useMinder()` for data fetching
- **SecureStore** for encrypted storage
- **FileSystem** for file operations
- **ImagePicker** for camera/gallery
- Platform-specific features
- Expo development workflow

## 🚀 Quick Start

```bash
# Install Expo CLI globally
npm install -g expo-cli

# Install dependencies
npm install

# Link minder package
npm link ../../../

# Start Expo
npm start
```

Scan QR code with Expo Go app (iOS/Android) or run in simulator.

## 📱 Features Demonstrated

### 1. Data Fetching with useMinder()

```typescript
const { data, isLoading, error } = useMinder<User>({
  route: "https://api.example.com/users/1",
});
```

**Why useMinder()?**

- Works same as web
- Automatic caching
- Loading states
- Error handling

### 2. Secure Storage

```typescript
// Save encrypted data
await SecureStore.setItemAsync("token", "abc123");

// Load encrypted data
const token = await SecureStore.getItemAsync("token");
```

**When to use?**

- API tokens
- User credentials
- Sensitive settings
- Encryption keys

**Platform:**

- iOS: Keychain
- Android: KeyStore
- Web: Not available

### 3. File System

```typescript
// Download file
const downloadResumable = FileSystem.createDownloadResumable(
  "https://example.com/image.jpg",
  FileSystem.documentDirectory + "image.jpg"
);

const result = await downloadResumable.downloadAsync();
```

**Use cases:**

- Download/upload files
- Cache images
- Offline storage
- File management

### 4. Image Picker

```typescript
const result = await ImagePicker.launchImageLibraryAsync({
  mediaTypes: ImagePicker.MediaTypeOptions.Images,
  allowsEditing: true,
  quality: 1,
});

if (!result.canceled) {
  setImage(result.assets[0].uri);
}
```

**Features:**

- Camera access
- Gallery selection
- Crop/edit
- Multiple selection

## 📁 Project Structure

```
.
├── App.tsx              # Main component
├── app.json             # Expo configuration
├── package.json         # Dependencies
└── README.md            # This file
```

## 🎨 Try These Features

1. **Data Fetching**

   - Click "Next User" to fetch different users
   - See automatic caching in action
   - Loading states handled automatically

2. **Secure Storage**

   - Click "Save Token" to store encrypted
   - Click "Load Token" to retrieve
   - Token persists across app restarts

3. **File Downloads**

   - Click "Download Image"
   - File saved to device
   - Check FileSystem paths

4. **Image Selection**
   - Click "Pick Image"
   - Select from gallery
   - Preview selected image

## 🔧 Configuration

### Adding More Expo Modules

```bash
# Install module
npx expo install expo-location

# Use in code
import * as Location from 'expo-location';
```

### Permissions

Edit `app.json` to add required permissions:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-camera",
        {
          "cameraPermission": "Allow app to access camera"
        }
      ]
    ]
  }
}
```

## 📱 Platform Support

- ✅ **iOS**: All features work
- ✅ **Android**: All features work
- ⚠️ **Web**: Limited (no SecureStore)

## 🚀 Building for Production

### iOS

```bash
expo build:ios
```

### Android

```bash
expo build:android
```

### Expo Application Services (EAS)

```bash
# Install EAS CLI
npm install -g eas-cli

# Build
eas build --platform all
```

## 🎓 Learning Resources

- [Expo Documentation](https://docs.expo.dev/)
- [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)
- [Expo FileSystem](https://docs.expo.dev/versions/latest/sdk/filesystem/)
- [Expo ImagePicker](https://docs.expo.dev/versions/latest/sdk/imagepicker/)

## 🔗 Integration with Minder

### Upload with FileSystem

```typescript
const uploadImage = async (uri: string) => {
  const { data } = await minder(
    "/upload",
    {
      file: {
        uri,
        name: "photo.jpg",
        type: "image/jpeg",
      },
    },
    {
      method: "POST",
      headers: {
        "Content-Type": "multipart/form-data",
      },
    }
  );

  return data;
};
```

### Authenticated Requests

```typescript
// Load token from SecureStore
const token = await SecureStore.getItemAsync("authToken");

// Use with minder
const { data } = await minder("/protected", undefined, {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});
```

## 🤝 Contributing

Found a bug or have a suggestion? Please file an issue!
