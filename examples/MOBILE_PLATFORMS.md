# 📱 Mobile & Cross-Platform Examples

This guide covers the **React Native** and **Expo** examples that demonstrate mobile-specific features of minder-data-provider.

## 📋 Available Mobile Examples

| Platform | Example | Key Features |
|----------|---------|--------------|
| **React Native** | Offline Todo | Offline-first, AsyncStorage, Background sync |
| **Expo** | Quick Start | SecureStore, FileSystem, ImagePicker |

---

## 1️⃣ React Native - Offline Todo App

**Location:** `examples/react-native/offline-todo/`

### Features Demonstrated
✅ **Offline-First Architecture** - Works completely without internet  
✅ **AsyncStorage Integration** - Persistent local storage  
✅ **Background Sync** - Syncs data when connection returns  
✅ **Network Status Detection** - Shows online/offline status  
✅ **Conflict Resolution** - Handles sync conflicts gracefully  
✅ **Optimistic Updates** - Instant UI feedback  
✅ **Queue Management** - Queues operations when offline  

### Prerequisites
```bash
# For iOS (macOS only)
- Xcode 14+
- CocoaPods
- iOS Simulator or physical device

# For Android
- Android Studio
- Android SDK
- Android Emulator or physical device

# For both
- Node.js 18+
- React Native CLI
```

### Setup Instructions

#### Step 1: Install Dependencies
```bash
cd examples/react-native/offline-todo
npm install --legacy-peer-deps
```

#### Step 2: iOS Setup (macOS only)
```bash
# Install CocoaPods dependencies
cd ios
pod install
cd ..
```

#### Step 3: Start Metro Bundler
```bash
npm start
```

#### Step 4: Run on iOS (separate terminal)
```bash
npm run ios
# Or for specific simulator
npx react-native run-ios --simulator="iPhone 15 Pro"
```

#### Step 5: Run on Android (separate terminal)
```bash
# Make sure Android emulator is running or device is connected
npm run android
```

### What to Try

1. **Add Todos Offline**
   - Turn off WiFi on your device/simulator
   - Add several todos
   - Notice they save immediately (optimistic update)

2. **Test Sync**
   - Turn WiFi back on
   - Watch todos sync to backend
   - Check network tab to see queued requests

3. **Test Conflict Resolution**
   - Add todo offline
   - Modify same todo on another device
   - Turn WiFi on and watch conflict resolution

4. **Background Sync**
   - Add todos offline
   - Close app
   - Turn WiFi on
   - Reopen app - todos should sync

### Architecture

```
src/
├── App.tsx              # Main app component
├── components/
│   ├── TodoList.tsx     # Todo list view
│   ├── TodoItem.tsx     # Individual todo
│   ├── AddTodo.tsx      # Add todo form
│   └── NetworkStatus.tsx # Online/offline indicator
├── hooks/
│   ├── useTodos.tsx     # Todo CRUD operations
│   └── useNetworkStatus.tsx # Network detection
├── services/
│   ├── storage.ts       # AsyncStorage wrapper
│   ├── sync.ts          # Background sync logic
│   └── api.ts           # API client
└── types/
    └── todo.ts          # TypeScript types
```

### Testing

```bash
# Run tests
npm test

# Watch mode
npm run test:watch

# Type checking
npm run type-check
```

---

## 2️⃣ Expo - Quick Start

**Location:** `examples/expo/quickstart/`

### Features Demonstrated
✅ **Expo SecureStore** - Encrypted storage for tokens  
✅ **Expo FileSystem** - File upload/download  
✅ **Expo ImagePicker** - Image selection and upload  
✅ **Camera Integration** - Take photos directly  
✅ **Cross-Platform** - Runs on iOS, Android, and Web  

### Prerequisites
```bash
# Install Expo CLI globally
npm install -g expo-cli

# Or use npx (recommended)
npx expo --version
```

### Setup Instructions

#### Step 1: Install Dependencies
```bash
cd examples/expo/quickstart
npm install --legacy-peer-deps
```

#### Step 2: Start Expo
```bash
npm start
# or
expo start
```

#### Step 3: Run on Platform

**iOS (requires macOS):**
- Press `i` in terminal to open iOS simulator
- Or scan QR code with Camera app on iPhone

**Android:**
- Press `a` in terminal to open Android emulator
- Or scan QR code with Expo Go app on Android phone

**Web:**
- Press `w` in terminal to open in browser

### What to Try

1. **Secure Authentication**
   ```typescript
   // Login saves token to SecureStore
   await login({ username, password });
   // Token automatically retrieved on next app launch
   ```

2. **Image Upload**
   - Click "Pick Image" button
   - Select photo from gallery
   - Watch it upload to server
   - See preview with minder caching

3. **Camera Integration**
   - Click "Take Photo" button
   - Take picture with camera
   - Auto-uploads and displays

4. **File Management**
   - Upload files
   - Download files
   - See progress indicators
   - Files cached locally

### Architecture

```
app/
├── index.tsx            # Home screen
├── auth/
│   ├── login.tsx        # Login screen
│   └── register.tsx     # Register screen
├── media/
│   ├── photos.tsx       # Photo gallery
│   └── upload.tsx       # File upload
└── profile/
    └── index.tsx        # User profile

components/
├── ImagePicker.tsx      # Image picker component
├── FileUploader.tsx     # File upload component
└── SecureAuth.tsx       # Auth component

hooks/
├── useAuth.tsx          # Authentication hook
├── useSecureStorage.tsx # SecureStore wrapper
└── useFileUpload.tsx    # File upload hook
```

### Testing

```bash
# Run tests
npm test

# Run on specific platform
npm run ios
npm run android
npm run web
```

---

## 🔧 Installation Commands Summary

### Install All Mobile Examples
```bash
# React Native
cd examples/react-native/offline-todo
npm install --legacy-peer-deps
cd ios && pod install && cd ..

# Expo
cd examples/expo/quickstart
npm install --legacy-peer-deps
```

### Quick Start All Platforms
```bash
# Terminal 1 - React Native Metro
cd examples/react-native/offline-todo
npm start

# Terminal 2 - React Native iOS
cd examples/react-native/offline-todo
npm run ios

# Terminal 3 - Expo
cd examples/expo/quickstart
npm start
```

---

## 📊 Feature Comparison

| Feature | React Native | Expo | Web | Next.js | Node.js |
|---------|--------------|------|-----|---------|---------|
| Offline Support | ✅ | ✅ | ✅ | ❌ | ❌ |
| Secure Storage | ✅ | ✅ | 🔶 | ❌ | ❌ |
| File Upload | ✅ | ✅ | ✅ | ✅ | ✅ |
| Camera Access | ✅ | ✅ | 🔶 | ❌ | ❌ |
| Background Sync | ✅ | ✅ | ✅ | ❌ | ❌ |
| Push Notifications | ✅ | ✅ | 🔶 | ❌ | ❌ |
| Native Modules | ✅ | 🔶 | ❌ | ❌ | ❌ |
| Web Support | ❌ | ✅ | ✅ | ✅ | ❌ |

**Legend:** ✅ Full Support | 🔶 Partial Support | ❌ Not Applicable

---

## 🐛 Common Issues & Solutions

### React Native

**Issue: Metro bundler won't start**
```bash
# Clear cache and restart
npm start -- --reset-cache

# Or
npx react-native start --reset-cache
```

**Issue: iOS build fails**
```bash
# Clean build
cd ios
rm -rf Pods Podfile.lock
pod install
cd ..

# Clean Xcode cache
rm -rf ~/Library/Developer/Xcode/DerivedData
```

**Issue: Android build fails**
```bash
# Clean Gradle cache
cd android
./gradlew clean
cd ..

# Reset
cd android && ./gradlew clean && cd ..
npx react-native run-android
```

### Expo

**Issue: Expo Go won't connect**
```bash
# Make sure on same WiFi network
# Try tunnel mode
expo start --tunnel
```

**Issue: Module not found**
```bash
# Clear Expo cache
expo start -c

# Or reinstall
rm -rf node_modules
npm install --legacy-peer-deps
```

**Issue: Camera permissions denied**
- Go to device Settings
- Find your app
- Enable Camera permissions
- Restart app

---

## 🎯 Platform-Specific Features

### React Native Only
```typescript
// Direct AsyncStorage access
import AsyncStorage from '@react-native-async-storage/async-storage';

// Network status monitoring
import NetInfo from '@react-native-community/netinfo';

// Native animations
import { Animated } from 'react-native';
```

### Expo Only
```typescript
// Secure storage
import * as SecureStore from 'expo-secure-store';

// File system
import * as FileSystem from 'expo-file-system';

// Image picker
import * as ImagePicker from 'expo-image-picker';

// Camera
import { Camera } from 'expo-camera';
```

---

## 📱 Device Requirements

### iOS
- iOS 13.4 or higher
- iPhone 8 or newer (recommended)
- 64-bit device

### Android
- Android 6.0 (API 23) or higher
- ARMv7 or ARM64 processor
- 2GB RAM minimum (4GB recommended)

---

## 🚀 Next Steps

1. **Try React Native Example**
   - Run on iOS/Android
   - Test offline features
   - Examine sync logic

2. **Try Expo Example**
   - Run on multiple platforms
   - Test SecureStore
   - Upload images

3. **Build Your Own**
   - Combine features from both
   - Add custom functionality
   - Deploy to app stores

---

## 📚 Additional Resources

- **React Native Docs**: https://reactnative.dev/
- **Expo Docs**: https://docs.expo.dev/
- **Minder API Docs**: `/docs/API_REFERENCE.md`
- **Offline Guide**: `/docs/OFFLINE_GUIDE.md` (if exists)

---

## 💡 Tips for Mobile Development

1. **Always test on real devices** - Simulators don't show true performance
2. **Handle offline gracefully** - Mobile connections are unreliable
3. **Optimize images** - Large images slow down mobile apps
4. **Use pagination** - Don't load all data at once
5. **Test on different screen sizes** - Support all devices
6. **Monitor memory usage** - Mobile devices have limited RAM
7. **Handle permissions properly** - Request only when needed

---

**Ready to develop mobile apps with Minder Data Provider!** 📱✨

For web and server examples, see `RUNNING_EXAMPLES.md`.
