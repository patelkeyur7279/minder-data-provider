#!/bin/bash

# Setup script for e-commerce example
# Handles linking to parent minder-data-provider package

set -e

echo "🚀 Setting up E-commerce Example..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
  echo "❌ Error: package.json not found. Run this from examples/web/e-commerce/"
  exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Link to parent package
echo "🔗 Linking to minder-data-provider..."
cd ../../..
npm link
cd examples/web/e-commerce
npm link minder-data-provider

echo "✅ Setup complete!"
echo ""
echo "Run the app:"
echo "  npm run dev"
echo ""
echo "Run tests:"
echo "  npm test"
