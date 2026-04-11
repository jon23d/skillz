#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---------------------------------------------------------------------------

TARGET="${1:-}"

if [ -z "$TARGET" ]; then
  echo "Error: a target directory is required."
  echo ""
  echo "Usage: $(basename "$0") <target-dir>"
  echo ""
  echo "Examples:"
  echo "  $(basename "$0") ~/.config/opencode"
  echo "  $(basename "$0") ~/code/<project>/.opencode"
  exit 1
fi

# Expand a leading ~ to $HOME
TARGET="${TARGET/#\~/$HOME}"

echo "Installing to $TARGET ..."

# Ensure target directory exists
mkdir -p "$TARGET"

# Always remove these directories from the target — their presence affects system behaviour
# regardless of whether this harness provides them.
for dir in agents tools plugins skills; do
  DEST="$TARGET/$dir"
  if [ -d "$DEST" ]; then
    echo "  Removing existing $dir/"
    rm -rf "$DEST"
  fi
done

# Also remove any loose docs that a previous harness may have deposited at the target root
if [ -d "$TARGET/docs" ]; then
  echo "  Removing existing docs/"
  rm -rf "$TARGET/docs"
fi

# Now copy whatever this harness provides
for dir in agents tools plugins skills; do
  SRC="$SCRIPT_DIR/$dir"
  if [ -d "$SRC" ]; then
    echo "  Copying $dir -> $TARGET/$dir"
    cp -r "$SRC" "$TARGET/"
  else
    echo "  Skipping $dir (not provided by this harness)"
  fi
done

# Copy docs/ contents directly into ~/.opencode/ (not into a docs/ subdirectory)
if [ -d "$SCRIPT_DIR/docs" ]; then
  echo "  Copying docs/* -> $TARGET/"
  cp -r "$SCRIPT_DIR/docs/." "$TARGET/"
fi

# Main AGENTS.md
if [ -f "$SCRIPT_DIR/AGENTS.md" ]; then
  echo "  Copying AGENTS.md -> $TARGET/"
  cp "$SCRIPT_DIR/AGENTS.md" "$TARGET/"
else
  echo "  AGENTS.md not found, skipping"
fi

# Opencode config
if [ -f "$SCRIPT_DIR/opencode.json" ]; then
  echo "  Copying opencode.json -> $TARGET/"
  cp "$SCRIPT_DIR/opencode.json" "$TARGET/"
else
  echo "  opencode.json not found, skipping"
fi

# Install tool dependencies (only when package.json is present in the tools target)
if [ -f "$TARGET/tools/package.json" ]; then
  echo "  Installing tool dependencies..."
  npm install --prefix "$TARGET/tools" --silent
else
  echo "  No package.json in $TARGET/tools, skipping npm install"
fi

echo "Done."
