#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="$HOME/.opencode"

echo "Installing to $TARGET ..."

# Ensure target directory exists
mkdir -p "$TARGET"

# Copy agents/, tools/, and skills/ into ~/.opencode/ (preserving subdirectory structure)
for dir in agents tools skills; do
  echo "  Copying $dir/ -> $TARGET/$dir/"
  cp -r "$SCRIPT_DIR/$dir" "$TARGET/"
done

# Copy docs/ contents directly into ~/.opencode/ (not into a docs/ subdirectory)
echo "  Copying docs/* -> $TARGET/"
cp -r "$SCRIPT_DIR/docs/." "$TARGET/"

# Main Agents
cp "$SCRIPT_DIR/AGENTS.md" "$TARGET/"

echo "Done."
