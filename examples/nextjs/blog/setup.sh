#!/bin/bash

echo "🚀 Setting up Next.js Blog Example"
echo "=================================="

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install Node.js first."
    exit 1
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
cd examples/nextjs/blog
npm link ../../../

echo ""
echo "✅ Setup complete!"
echo ""
echo "Available commands:"
echo "  npm run dev        - Start development server (http://localhost:3000)"
echo "  npm run build      - Build for production"
echo "  npm start          - Start production server"
echo "  npm test           - Run tests"
echo ""
echo "📚 Try these URLs:"
echo "  http://localhost:3000                - Home (SSG)"
echo "  http://localhost:3000/posts/1        - Post detail (SSR)"
echo "  http://localhost:3000/blog/1         - Post detail (ISR)"
echo "  http://localhost:3000/api/posts      - API route"
echo ""
