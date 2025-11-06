#!/bin/bash

echo "🚀 Setting up Node.js API Example"
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
cd examples/nodejs/api
npm link ../../../

echo ""
echo "📄 Creating .env file..."
if [ ! -f .env ]; then
    cp .env.example .env
    echo "✓ Created .env from .env.example"
else
    echo "✓ .env file already exists"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Available commands:"
echo "  npm run dev        - Start development server with hot reload"
echo "  npm run build      - Build for production"
echo "  npm start          - Start production server"
echo "  npm test           - Run tests"
echo ""
echo "🌐 Server will run at: http://localhost:3001"
echo ""
echo "Try these endpoints:"
echo "  GET    http://localhost:3001/health"
echo "  GET    http://localhost:3001/api/users"
echo "  GET    http://localhost:3001/api/users/1"
echo "  POST   http://localhost:3001/api/users"
echo ""
