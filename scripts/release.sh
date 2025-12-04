#!/bin/bash
set -e

# AI Skeleton Extension - Automated Release Script
# Usage: ./scripts/release.sh [version]
# Example: ./scripts/release.sh 0.1.17

VERSION=$1

if [ -z "$VERSION" ]; then
  echo "❌ Error: Version number required"
  echo "Usage: ./scripts/release.sh [version]"
  echo "Example: ./scripts/release.sh 0.1.17"
  exit 1
fi

# Validate version format (basic check)
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "❌ Error: Invalid version format. Use semantic versioning (e.g., 0.1.17)"
  exit 1
fi

echo "🚀 Starting release process for v$VERSION"
echo ""

# Step 1: Update version in package.json
echo "📝 Step 1: Updating version in package.json..."
if command -v jq &> /dev/null; then
  # Use jq if available (more reliable)
  jq --arg ver "$VERSION" '.version = $ver' package.json > package.json.tmp && mv package.json.tmp package.json
else
  # Fallback to sed
  sed -i.bak "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" package.json
  rm -f package.json.bak
fi
echo "✅ Version updated to $VERSION"
echo ""

# Step 2: Re-embed prompts and agents
echo "📦 Step 2: Re-embedding prompts and agents as base64..."
npm run embed-all
echo "✅ Prompts and agents embedded"
echo ""

# Step 3: Build extension
echo "🔨 Step 3: Building extension..."
npm run compile
echo "✅ Extension built"
echo ""

# Step 4: Verify embeddings (GATE - must pass before release)
echo "🔍 Step 4: Verifying embeddings..."
npm run test:verify-embeddings || {
  echo "❌ Embedding verification failed!"
  echo "⚠️  Run 'npm run embed-all' to fix, then try again"
  exit 1
}
echo "✅ All embeddings valid - Ready for release"
echo ""

# Step 5: Update CHANGELOG (manual prompt)
echo "📋 Step 5: Update CHANGELOG.md"
echo "⚠️  Please ensure CHANGELOG.md is updated with release notes for v$VERSION"
read -p "Press Enter when CHANGELOG is ready, or Ctrl+C to abort..."
echo ""

# Step 6: Git commit
echo "💾 Step 6: Committing changes..."
git add src/promptStore.ts src/agentStore.ts package.json CHANGELOG.md dist/
git commit -m "chore: release v$VERSION

- Re-embedded prompts and agents with latest updates
- Updated version to $VERSION
- Built extension
" || echo "ℹ️  No changes to commit (already committed?)"
echo "✅ Changes committed"
echo ""

# Step 7: Push to main
echo "⬆️  Step 7: Pushing to main..."
git push origin main
echo "✅ Pushed to main"
echo ""

# Step 8: Create and push tag
echo "🏷️  Step 8: Creating and pushing tag v$VERSION..."
git tag -f "v$VERSION"
git push -f origin "v$VERSION"
echo "✅ Tag v$VERSION created and pushed"
echo ""

echo "✨ Release process complete!"
echo ""
echo "📊 Next steps:"
echo "  1. Monitor GitHub Actions: gh run watch"
echo "  2. Verify GitHub Release: https://github.com/JasdeepN/ai-skeleton-extension/releases/tag/v$VERSION"
echo "  3. Check Marketplace (5-15 min): https://marketplace.visualstudio.com/items?itemName=JasdeepN.ai-skeleton-extension"
echo ""
