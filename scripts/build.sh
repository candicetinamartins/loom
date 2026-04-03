#!/bin/bash
# Cross-platform build script for Loom
# Usage: ./scripts/build.sh [platform] [arch]
# Platforms: win32, darwin, linux
# Architectures: x64, arm64

set -e

PLATFORM=${1:-"all"}
ARCH=${2:-"x64"}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "🔧 Loom Cross-Platform Build"
echo "=============================="
echo "Platform: $PLATFORM"
echo "Architecture: $ARCH"
echo ""

cd "$ROOT_DIR"

# Install dependencies
echo "📦 Installing dependencies..."
npm ci

# Build packages
echo "🏗️ Building packages..."
npm run build --workspaces

# Build Electron app based on platform
cd packages/loom-electron

case "$PLATFORM" in
  "win32"|"windows"|"win")
    echo "🪟 Building for Windows ($ARCH)..."
    npm run build
    npx electron-builder --win --$ARCH
    ;;
  "darwin"|"mac"|"macos"|"osx")
    echo "🍎 Building for macOS ($ARCH)..."
    npm run build
    npx electron-builder --mac --$ARCH
    ;;
  "linux"|"ubuntu")
    echo "🐧 Building for Linux ($ARCH)..."
    npm run build
    npx electron-builder --linux --$ARCH
    ;;
  "all")
    echo "🌍 Building for all platforms..."
    npm run build
    echo "  → Windows x64"
    npx electron-builder --win --x64
    echo "  → macOS x64 & arm64"
    npx electron-builder --mac --x64 --arm64
    echo "  → Linux x64"
    npx electron-builder --linux --x64
    ;;
  *)
    echo "❌ Unknown platform: $PLATFORM"
    echo "Usage: $0 [win32|darwin|linux|all] [x64|arm64]"
    exit 1
    ;;
esac

echo ""
echo "✅ Build complete!"
echo "Artifacts in: packages/loom-electron/dist/"
