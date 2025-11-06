#!/bin/bash

# 🚀 Minder Examples - Master Setup Script
# This script installs all dependencies for all examples

set -e  # Exit on error

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  🚀 MINDER EXAMPLES - MASTER SETUP                      ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

echo -e "${BLUE}📦 Node.js version:${NC} $(node --version)"
echo -e "${BLUE}📦 npm version:${NC} $(npm --version)"
echo ""

# Function to setup an example
setup_example() {
    local dir=$1
    local name=$2
    
    echo -e "${YELLOW}📦 Setting up: $name${NC}"
    echo "   Location: $dir"
    
    if [ -d "$dir" ]; then
        cd "$dir"
        
        if [ -f "package.json" ]; then
            echo "   Installing dependencies..."
            npm install --legacy-peer-deps 2>&1 | grep -v "deprecated" || true
            echo -e "${GREEN}   ✅ $name setup complete${NC}"
        else
            echo -e "${YELLOW}   ⚠️  No package.json found, skipping${NC}"
        fi
        
        cd - > /dev/null
    else
        echo -e "${RED}   ❌ Directory not found: $dir${NC}"
    fi
    echo ""
}

# Get the examples directory
EXAMPLES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  INSTALLING EXAMPLE DEPENDENCIES                        ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Setup each example
setup_example "$EXAMPLES_DIR/mock-api" "Mock API Server"
setup_example "$EXAMPLES_DIR/web/e-commerce" "Web E-commerce (React + Vite)"
setup_example "$EXAMPLES_DIR/nextjs/blog" "Next.js Blog"
setup_example "$EXAMPLES_DIR/nodejs/api" "Node.js Express API"

echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅ ALL EXAMPLES SETUP COMPLETE!                        ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${BLUE}🚀 Next Steps:${NC}"
echo ""
echo -e "${YELLOW}Option 1: Run with Docker (Recommended)${NC}"
echo "  ./docker-start.sh"
echo ""
echo -e "${YELLOW}Option 2: Run individually${NC}"
echo "  1. Mock API:     cd mock-api && npm start"
echo "  2. Web App:      cd web/e-commerce && npm run dev"
echo "  3. Next.js:      cd nextjs/blog && npm run dev"
echo "  4. Node.js API:  cd nodejs/api && npm run dev"
echo ""
echo -e "${BLUE}📚 Documentation:${NC}"
echo "  - Docker Guide:  cat DOCKER_GUIDE.md"
echo "  - Examples:      cat EXAMPLES_COMPLETE.md"
echo "  - Features:      cat ../docs/FEATURE_CODE_SNIPPETS.md"
echo ""
echo "Happy coding! 🎉"
