#!/bin/bash
set -e

# AI Skeleton Extension - Local VSIX Build Script
# Usage: ./scripts/release.sh [version]
# Examples:
#   ./scripts/release.sh              # Use version from package.json
#   ./scripts/release.sh 0.2.0        # Use explicit version (updates package.json)
#
# Publishing is handled by GitHub Actions workflows, not this script.

EXPLICIT_VERSION=""

# Parse arguments
for arg in "$@"; do
  if [[ "$arg" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    EXPLICIT_VERSION="$arg"
  fi
done

# Get current version from package.json
CURRENT_VERSION=$(jq -r '.version' package.json 2>/dev/null || grep '"version"' package.json | head -1 | sed 's/.*"version": "\([^"]*\)".*/\1/')

# Determine version to use
if [ -n "$EXPLICIT_VERSION" ]; then
  VERSION="$EXPLICIT_VERSION"
else
  VERSION="$CURRENT_VERSION"
fi

# Validate version format
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "❌ Error: Invalid version format. Use semantic versioning (e.g., 0.1.22)"
  exit 1
fi

echo "🏠 LOCAL VSIX BUILD"
echo "📌 Version: $VERSION"
echo ""

# Step 1: Update version if explicit version provided
if [ -n "$EXPLICIT_VERSION" ] && [ "$VERSION" != "$CURRENT_VERSION" ]; then
  echo "📝 Step 1: Updating version in package.json ($CURRENT_VERSION → $VERSION)..."
  if command -v jq &> /dev/null; then
    jq --arg ver "$VERSION" '.version = $ver' package.json > package.json.tmp && mv package.json.tmp package.json
  else
    sed -i.bak "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" package.json
    rm -f package.json.bak
  fi
  echo "✅ Version updated"
else
  echo "📝 Step 1: Using version $VERSION from package.json"
fi
echo ""

# Step 2: Check if embeddings need refresh
echo "🔍 Step 2: Checking embeddings..."
PROMPTS_MODIFIED=$(stat -c %Y embeds/prompts/*.prompt.md 2>/dev/null | sort -n | tail -1 || echo 0)
AGENTS_MODIFIED=$(stat -c %Y embeds/agents/*.agent.md 2>/dev/null | sort -n | tail -1 || echo 0)
PROTECTED_MODIFIED=$(stat -c %Y embeds/protected/* 2>/dev/null | sort -n | tail -1 || echo 0)
PROMPTS_STORE_MODIFIED=$(stat -c %Y src/promptStore.ts 2>/dev/null || echo 0)
AGENTS_STORE_MODIFIED=$(stat -c %Y src/agentStore.ts 2>/dev/null || echo 0)

NEEDS_EMBED=false
if [ "$PROMPTS_MODIFIED" -gt "$PROMPTS_STORE_MODIFIED" ]; then
  NEEDS_EMBED=true
fi
if [ "$AGENTS_MODIFIED" -gt "$AGENTS_STORE_MODIFIED" ]; then
  NEEDS_EMBED=true
fi
if [ "$PROTECTED_MODIFIED" -gt "$AGENTS_STORE_MODIFIED" ]; then
  NEEDS_EMBED=true
fi

if [ "$NEEDS_EMBED" = true ]; then
  echo "⚠️  Embeddings stale - refreshing..."
  npm run embed-all
  echo "✅ Embeddings refreshed"
else
  echo "✅ Embeddings current"
fi
echo ""

# Step 3: Build extension
echo "🔨 Step 3: Building extension..."
npm run compile
echo "✅ Build complete"
echo ""

# Step 4: Verify embeddings
echo "🔍 Step 4: Verifying embeddings..."
npm run test:verify-embeddings || {
  echo "❌ Embedding verification failed!"
  echo "⚠️  Run 'npm run embed-all' to fix"
  exit 1
}
echo "✅ Embeddings verified"
echo ""

# Step 5: Create VSIX package
echo "📦 Step 5: Creating VSIX..."
mkdir -p vsix
npx vsce package --out "vsix/ai-skeleton-extension-$VERSION.vsix"
VSIX_PATH="vsix/ai-skeleton-extension-$VERSION.vsix"
echo ""

echo "✨ Build complete!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 VSIX: $VSIX_PATH"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🔧 Install locally:"
echo "   code --install-extension $VSIX_PATH"
echo ""
echo "🚀 To publish: Use GitHub Actions workflows"
echo "   https://github.com/JasdeepN/ai-skeleton-extension/actions"
echo ""
