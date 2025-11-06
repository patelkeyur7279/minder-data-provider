#!/bin/bash

# Color codes for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔨 Building package...${NC}"
npm run build

if [ $? -ne 0 ]; then
    echo -e "${YELLOW}❌ Build failed!${NC}"
    exit 1
fi

echo -e "${BLUE}📦 Creating tarball...${NC}"
npm pack

if [ $? -ne 0 ]; then
    echo -e "${YELLOW}❌ Pack failed!${NC}"
    exit 1
fi

# Get the created tarball name
TARBALL=$(ls -t minder-data-provider-*.tgz 2>/dev/null | head -1)

if [ -z "$TARBALL" ]; then
    echo -e "${YELLOW}❌ Tarball not found!${NC}"
    exit 1
fi

echo -e "${BLUE}📥 Installing ${TARBALL} in demo...${NC}"

# Remove old symlink if exists
if [ -L "demo/node_modules/minder-data-provider" ]; then
    rm "demo/node_modules/minder-data-provider"
    echo -e "${GREEN}🗑️  Removed old symlink${NC}"
fi

cd demo

# Install the tarball
npm install "../${TARBALL}" --force

if [ $? -ne 0 ]; then
    echo -e "${YELLOW}❌ Installation failed!${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Package installed successfully!${NC}"
echo -e "${GREEN}📂 Installed from: ${TARBALL}${NC}"
echo -e "${BLUE}🚀 Run 'npm run dev' in the demo folder to start${NC}"
