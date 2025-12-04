#!/bin/bash

# Install git hooks from scripts/hooks/ to .git/hooks/
# Run this after cloning the repo: ./scripts/install-hooks.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOKS_SOURCE="$SCRIPT_DIR/hooks"
HOOKS_TARGET="$(git rev-parse --show-toplevel)/.git/hooks"

if [ ! -d "$HOOKS_SOURCE" ]; then
    echo "❌ No hooks directory found at $HOOKS_SOURCE"
    exit 1
fi

echo "Installing git hooks..."

for hook in "$HOOKS_SOURCE"/*; do
    if [ -f "$hook" ]; then
        hook_name=$(basename "$hook")
        cp "$hook" "$HOOKS_TARGET/$hook_name"
        chmod +x "$HOOKS_TARGET/$hook_name"
        echo "  ✅ Installed: $hook_name"
    fi
done

echo ""
echo "✅ Git hooks installed successfully!"
echo "   Hooks will run automatically on git operations."
