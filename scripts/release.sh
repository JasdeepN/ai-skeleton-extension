#!/bin/bash
set -e

# AI Skeleton Extension - Automated Release Script
# Usage: ./scripts/release.sh [version] [--noBump]
# Examples:
#   ./scripts/release.sh              # Auto-bump patch (0.1.19 -> 0.1.20)
#   ./scripts/release.sh 0.2.0        # Explicit version
#   ./scripts/release.sh --noBump     # Release without bumping

EXPLICIT_VERSION=$1
NO_BUMP=false

# Check for --noBump flag
if [ "$1" == "--noBump" ]; then
  NO_BUMP=true
  EXPLICIT_VERSION=""
elif [ "$2" == "--noBump" ]; then
  NO_BUMP=true
fi

# Get current version from package.json
CURRENT_VERSION=$(jq -r '.version' package.json 2>/dev/null || grep '"version"' package.json | head -1 | sed 's/.*"version": "\([^"]*\)".*/\1/')

# Determine version to use
if [ -n "$EXPLICIT_VERSION" ] && [ "$EXPLICIT_VERSION" != "--noBump" ]; then
  # Explicit version provided
  VERSION="$EXPLICIT_VERSION"
elif [ "$NO_BUMP" = true ]; then
  # Use current version without bumping
  VERSION="$CURRENT_VERSION"
else
  # Auto-bump patch version
  IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
  PATCH=$((PATCH + 1))
  VERSION="$MAJOR.$MINOR.$PATCH"
fi

# Validate version format
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "❌ Error: Invalid version format. Use semantic versioning (e.g., 0.1.17)"
  exit 1
fi

# Show what we're doing
if [ "$VERSION" != "$CURRENT_VERSION" ]; then
  echo "📌 Version will be bumped: $CURRENT_VERSION → $VERSION"
else
  echo "📌 Releasing current version: $VERSION (no bump)"
fi
echo ""

echo "🚀 Starting release process for v$VERSION"
echo ""

# Pre-check: Verify embeddings are up-to-date
echo "🔍 Pre-check: Verifying embeddings are current..."
PROMPTS_MODIFIED=$(stat -c %Y embeds/prompts/*.prompt.md 2>/dev/null | sort -n | tail -1 || echo 0)
AGENTS_MODIFIED=$(stat -c %Y embeds/agents/*.agent.md 2>/dev/null | sort -n | tail -1 || echo 0)
PROTECTED_MODIFIED=$(stat -c %Y embeds/protected/* 2>/dev/null | sort -n | tail -1 || echo 0)
PROMPTS_STORE_MODIFIED=$(stat -c %Y src/promptStore.ts 2>/dev/null || echo 0)
AGENTS_STORE_MODIFIED=$(stat -c %Y src/agentStore.ts 2>/dev/null || echo 0)

# Compare timestamps to determine if re-embedding is needed
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
  echo "⚠️  Embeddings are stale - source files have been updated"
  echo "🔨 Auto-running embed-all..."
  npm run embed-all
  echo "✅ Embeddings refreshed"
else
  echo "✅ Embeddings are current"
fi
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

# Step 5: Auto-generate CHANGELOG entry
echo "📋 Step 5: Generating CHANGELOG entry..."
CHANGELOG_ENTRY="## $VERSION - $(date +%Y-%m-%d)

### Fixed
- Updated embedded agent and prompt assets

### Technical
- Re-embedded prompts and agents with latest updates
- Verified all embeddings match source files
"

# Check if entry already exists
if grep -q "## $VERSION" CHANGELOG.md; then
  echo "ℹ️  CHANGELOG entry for v$VERSION already exists, skipping auto-generation"
else
  # Insert after first # Changelog line
  awk -v entry="$CHANGELOG_ENTRY" 'NR==1{print; print ""; print entry; next} 1' CHANGELOG.md > CHANGELOG.md.tmp
  mv CHANGELOG.md.tmp CHANGELOG.md
  echo "✅ Auto-generated CHANGELOG entry for v$VERSION"
fi
echo ""
echo "📝 CHANGELOG.md is ready - you can edit it now if needed"
read -p "Press Enter to continue with commit, or Ctrl+C to abort and make changes..."
echo ""

# Step 6: Git add and show status
echo "💾 Step 6: Staging changes..."
git add src/promptStore.ts src/agentStore.ts package.json CHANGELOG.md dist/
echo ""
echo "📊 Changes to be committed:"
git status --short
echo ""
read -p "Press Enter to commit, or Ctrl+C to abort and modify files..."
echo ""

# Step 7: Git commit
echo "💾 Step 7: Committing changes..."
git commit -m "chore: release v$VERSION

- Re-embedded prompts and agents with latest updates
- Updated version to $VERSION
- Built extension
" || echo "ℹ️  No changes to commit (already committed?)"
echo "✅ Changes committed"
echo ""

# Step 8: Push to main
echo "⬆️  Step 8: Pushing to main..."
git push origin main
echo "✅ Pushed to main"
echo ""

# Step 9: Create and push tag
echo "🏷️  Step 9: Creating and pushing tag v$VERSION..."
git tag -f "v$VERSION"
git push -f origin "v$VERSION"
echo "✅ Tag v$VERSION created and pushed"
echo ""

echo "✨ Git release process complete!"
echo ""
echo "📊 Next steps:"
echo "  1. Monitor GitHub Actions build: gh run watch"
echo "  2. Verify GitHub Release: https://github.com/JasdeepN/ai-skeleton-extension/releases/tag/v$VERSION"
echo ""
echo "🚀 To publish to Marketplace:"
echo "  1. Go to: https://github.com/JasdeepN/ai-skeleton-extension/actions/workflows/publish-marketplace.yml"
echo "  2. Click 'Run workflow'"
echo "  3. Enter tag: v$VERSION"
echo "  4. Click 'Run workflow' button"
echo "  5. Monitor workflow and check marketplace (5-15 min): https://marketplace.visualstudio.com/items?itemName=JasdeepN.ai-skeleton-extension"
echo ""
