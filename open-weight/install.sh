#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="$HOME/.opencode"


echo "Installing to $TARGET ..."

# Ensure target directory exists
mkdir -p "$TARGET"

# Remove existing agents/, tools, plugins, and skills
for dir in agents tools plugins skills; do
  echo "  Removing $TARGET/$dir/"
  rm -rf "$TARGET/$dir/"
done

# Copy agents/, tand skills/ into ~/.opencode/ (preserving subdirectory structure)
for dir in agents skills; do
  echo "  Copying $dir/ -> $TARGET/$dir/"
  cp -r "$SCRIPT_DIR/$dir" "$TARGET/"
done

# Main Agents
echo "  Copying AGENTS.md -> $TARGET/"
cp "$SCRIPT_DIR/AGENTS.md" "$TARGET/"

echo "Done."
