#!/bin/bash

echo "🚀 Setting up React Native Offline Todo Example"
echo "================================================"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install Node.js first."
    exit 1
fi

# Check if React Native CLI is installed
if ! command -v npx react-native &> /dev/null; then
    echo "📱 Installing React Native CLI..."
    npm install -g react-native-cli
fi

echo ""
echo "📦 Installing dependencies..."
npm install

echo ""
echo "🔗 Linking minder-data-provider..."
# Go to root and build
cd ../../..
npm run build

# Link the package
cd examples/react-native/offline-todo
npm link ../../../

echo ""
echo "📱 Setting up iOS (macOS only)..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    if command -v pod &> /dev/null; then
        cd ios && pod install && cd ..
        echo "✅ iOS pods installed"
    else
        echo "⚠️  CocoaPods not found. Install with: sudo gem install cocoapods"
    fi
else
    echo "⏭️  Skipping iOS setup (not on macOS)"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Available commands:"
echo "  npm start          - Start Metro bundler"
echo "  npm run android    - Run on Android device/emulator"
echo "  npm run ios        - Run on iOS simulator (macOS only)"
echo "  npm test           - Run tests"
echo ""
echo "🎯 Getting Started:"
echo "1. Start Metro: npm start"
echo "2. In a new terminal:"
echo "   - Android: npm run android"
echo "   - iOS: npm run ios"
echo ""
echo "📚 Features to try:"
echo "  - Add todos while offline"
echo "  - Toggle airplane mode"
echo "  - See pending sync status"
echo "  - Come back online to auto-sync"
echo "  - Pull to refresh"
echo ""
