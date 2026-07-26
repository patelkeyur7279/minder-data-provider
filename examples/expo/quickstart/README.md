# Expo Quick Start

Quick start example showing **Minder Data Provider** integration with Expo's platform features.

Targets **Expo SDK 52** / React Native 0.76 / React 18.3.1.

## 🎯 What You'll Learn

- `useMinder()` for data fetching
- **SecureStore** for encrypted storage
- **FileSystem** for file operations
- **ImagePicker** for camera/gallery
- Platform-specific features
- Expo development workflow

## 🚀 Quick Start

```bash
# Install dependencies (also resolves minder-data-provider, declared as
# "file:../../../" in package.json — npm links it automatically, no
# separate `npm link` step needed)
npm install

# Start Expo
npm start
```

Scan QR code with Expo Go app (iOS/Android) or run in a simulator.

> This example is not covered by Confirmed-status device/simulator testing
> in CI (see "CI Evidence" below) — running it on a real device or
> simulator is the way to fully validate it end to end.

## 📱 Features Demonstrated

### 1. Data Fetching with useMinder()

```typescript
const { data, loading, error } = useMinder<User>(
  "https://api.example.com/users/1"
);
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
├── App.tsx                        # Main component
├── index.js                       # Expo entry point (registerRootComponent)
├── app.json                       # Expo configuration
├── babel.config.js                # babel-preset-expo
├── metro.config.js                # Metro resolver config (see comments —
│                                     needed because of the local file: link)
├── jest.config.js                 # jest-expo preset + react singleton mapping
├── __tests__/useMinder.expo.test.tsx  # runtime-path tests (see CI Evidence)
├── scripts/
│   ├── assert-bundle.mjs          # bundle-content proof
│   └── ci-smoke.mjs               # jest + assert-bundle, self-contained
├── package.json                   # Dependencies
└── README.md                      # This file
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

The classic `expo build:ios` / `expo build:android` commands were removed
years ago — production builds now go through **EAS Build**:

```bash
# Install EAS CLI
npm install -g eas-cli

# Build
eas build --platform all
```

`npm run build` in this example does **not** produce an installable app —
see "CI Evidence" below for what it actually does.

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

## ✅ CI Evidence

There is **no iOS/Android simulator available in this repo's CI**, so this
example cannot prove "the app runs on a device." What it proves instead —
honestly and without overstating it — is that **the library actually
bundles and executes inside a React Native / Hermes JS runtime**, which is
the failure mode that matters most (a broken export map, an unresolvable
subpath, a Node-only API leaking into the RN bundle, etc.).

### `npm run build`

```bash
npm run build   # expo export --platform ios --platform android --clear
```

Runs Metro (the same bundler `expo start` / EAS Build use) with the bundler
cache disabled, and exports Hermes bytecode bundles for **both iOS and
Android** to `dist/_expo/static/js/{ios,android}/*.hbc`. This is the load-bearing
artifact: if `minder-data-provider/expo` can't be resolved, or something in
the library reaches for a Node-only API on the require path, this step
fails loudly, for both platforms, right here.

### `npm run ci:smoke`

```bash
npm run ci:smoke   # jest-expo suite + scripts/assert-bundle.mjs
```

Assumes `npm run build` already ran. Two checks:

1. **`__tests__/useMinder.expo.test.tsx`** (jest-expo preset,
   `@testing-library/react-native` + `react-test-renderer`) — renders a
   real React Native component tree that imports `useMinder` and
   `MinderDataProvider` from `minder-data-provider/expo`, against a mocked
   `global.fetch` (minder's `ApiClient` is axios-based; in this Jest
   environment axios auto-selects its `fetch` adapter, so mocking
   `global.fetch` genuinely intercepts requests rather than silently
   missing them — verified empirically, not assumed). Covers: loading →
   resolved-data, loading → error, and the `MinderDataProvider` + relative-route
   path (the code path that also wires up `ExpoStorageAdapter`). This
   proves the hook, the query cache, and the expo platform entry's exports
   all execute correctly in an RN JS runtime.
2. **`scripts/assert-bundle.mjs`** — greps both exported `.hbc` bundles for
   strings that only exist in minder's own source (e.g.
   `"useMinderContext must be used within MinderDataProvider"`,
   `"ExpoStorageAdapter"`). Hermes bytecode is binary, but its string
   constant pool stores literal strings as plain bytes, so this reliably
   proves the library's code is *actually in* what Metro shipped for both
   platforms — not stubbed out, not tree-shaken away by mistake.

### What this evidence proves

- `minder-data-provider/expo` resolves and bundles cleanly for iOS and
  Android via the real Expo/Metro toolchain.
- The library's expo-platform code (not just `/core`) is present in both
  exported bundles.
- `useMinder()` and `MinderDataProvider` execute correctly against a real
  React Native component tree and query cache, for the success, error, and
  provider-context paths.

### What this evidence does NOT prove

- **Nothing about a real device or simulator.** No screen was rendered, no
  native module (SecureStore, FileSystem, ImagePicker, the real
  `ExpoStorageAdapter`/Keychain/KeyStore backing) actually ran — Jest mocks
  native modules, it doesn't execute them.
  Per the Support Matrix rules, this does **not** upgrade Expo's platform
  status to "Confirmed" — that requires a runnable example app validated on
  real device/simulator CI, which does not exist here.
- **No real network behavior.** `global.fetch` is fully mocked; nothing here
  proves actual HTTP behavior against a live or mocked *server*.
- **No visual/UI correctness.** The bundle-content check is a string
  presence check, not a rendering or snapshot check.

### A note on the `file:../../../` dependency

This example depends on the library via `"minder-data-provider":
"file:../../../"`, which npm installs as a **symlink** to the repo root —
not a real npm-published package layout. Two consequences worth knowing if
you're touching this example's config:

- `metro.config.js` explicitly adds the repo root to `watchFolders` and
  turns on `resolver.unstable_enablePackageExports` — without both, Metro
  cannot see through the symlink at all and `minder-data-provider/expo`
  fails to resolve.
- `jest.config.js` maps `react`, `react-native`, and `react-test-renderer`
  to this project's own `node_modules` copies. The repo root has its own
  (different-major-version) `react` in its own `node_modules`; Node/Jest's
  default resolver walks up from the symlinked library source's *real*
  path and finds that copy instead of this app's, producing two React
  instances in one tree (`Cannot read properties of null (reading
  'useContext')`). This is exclusively a local-dev-via-symlink artifact —
  it does not affect real consumers who `npm install minder-data-provider`
  from the registry, which was confirmed by proving this same `build` +
  `ci:smoke` sequence against a real `npm pack` tarball install (no
  symlink, no repo-root node_modules involved) with identical results.

## 🤝 Contributing

Found a bug or have a suggestion? Please file an issue!
