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
  SRC="$SCRIPT_DIR/$dir"
  DEST="$TARGET/$dir"

  if [ ! -d "$SRC" ]; then
    echo "  Skipping $dir (source not found: $SRC)"
    continue
  fi

  echo "  Ensuring target directory $dir/ exists"
  mkdir -p "$DEST"

  echo "  Removing existing contents of $dir/"
  # Remove only the immediate children of the destination safely (handles files, dirs, dotfiles)
  if [ -d "$DEST" ]; then
    find "$DEST" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  fi

  echo "  Copying $dir -> $DEST"
  cp -r "$SRC" "$TARGET/"
done

# Copy docs/ contents directly into ~/.opencode/ (not into a docs/ subdirectory)
if [ -d "$SCRIPT_DIR/docs" ]; then
  echo "  Copying docs/* -> $TARGET/"
  cp -r "$SCRIPT_DIR/docs/." "$TARGET/"
else
  echo "  No docs/ directory found, skipping"
fi

# Main Agents.md
if [ -f "$SCRIPT_DIR/AGENTS.md" ]; then
  echo "  Copying AGENTS.md -> $TARGET/"
  cp "$SCRIPT_DIR/AGENTS.md" "$TARGET/"
else
  echo "  AGENTS.md not found, skipping"
fi

# Opencode config
if [ -f "$SCRIPT_DIR/opencode.json" ]; then
  echo "   Copying opencode.json"
  cp "$SCRIPT_DIR/opencode.json" "$TARGET/"
else
  echo "   opencode.json not found, skipping"
fi

# Install tool dependencies (only when package.json is present in the tools target)
if [ -f "$TARGET/tools/package.json" ]; then
  echo "  Installing tool dependencies..."
  npm install --prefix "$TARGET/tools" --silent
else
  echo "  No package.json in $TARGET/tools, skipping npm install"
fi



echo "Done."
