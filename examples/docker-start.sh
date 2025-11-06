#!/bin/bash

echo "🐳 Starting all Minder examples with Docker"
echo "==========================================="

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose is not installed."
    echo "Install it from: https://docs.docker.com/compose/install/"
    exit 1
fi

echo ""
echo "📦 Building and starting services..."
docker-compose up --build -d

echo ""
echo "⏳ Waiting for services to be ready..."
sleep 5

echo ""
echo "✅ All services are starting!"
echo ""
echo "🌐 Service URLs:"
echo "  Mock API:    http://localhost:3001"
echo "  Web App:     http://localhost:3000"
echo "  Next.js:     http://localhost:3002"
echo "  API Server:  http://localhost:3003"
echo ""
echo "📊 View logs:"
echo "  docker-compose logs -f [service]"
echo ""
echo "🛑 Stop all services:"
echo "  docker-compose down"
echo ""
echo "Happy coding! 🚀"
