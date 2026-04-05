#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="$HOME/.config/opencode"

# ---------------------------------------------------------------------------

echo "Installing to $TARGET ..."

# Ensure target directory exists
mkdir -p "$TARGET"

# Copy agents/, tools/, plugins/, and skills/ into ~/.opencode/ (preserving subdirectory structure)
for dir in agents tools plugins skills; do
  echo "  Removing existing contents of $dir/"
  rm -fR "$TARGET/$dir/*"
  echo "  Copying $dir -> $TARGET/$dir"
  cp -r "$SCRIPT_DIR/$dir" "$TARGET/"
done

# Copy docs/ contents directly into ~/.opencode/ (not into a docs/ subdirectory)
echo "  Copying docs/* -> $TARGET/"
cp -r "$SCRIPT_DIR/docs/." "$TARGET/"

# Main Agents.md
echo "  Copying AGENTS.md -> $TARGET/"
cp "$SCRIPT_DIR/AGENTS.md" "$TARGET/"

# Opencode config
echo "   Copying opencode.json"
cp "$SCRIPT_DIR/opencode.json" "$TARGET/"

# Install tool dependencies
echo "  Installing tool dependencies..."
npm install --prefix "$TARGET/tools" --silent



echo "Done."
