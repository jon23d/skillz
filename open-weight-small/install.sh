#!/bin/bash
set -euo pipefail

CONFIG_DIR="$HOME/.config/opencode"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Installing open-weight-small agent harness..."

# Copy agents
mkdir -p "$CONFIG_DIR/agents"
cp -r "$SCRIPT_DIR/agents/"* "$CONFIG_DIR/agents/"

# Copy skills
mkdir -p "$CONFIG_DIR/skills"
cp -r "$SCRIPT_DIR/skills/"* "$CONFIG_DIR/skills/"

# Copy global config
cp "$SCRIPT_DIR/AGENTS.md" "$CONFIG_DIR/AGENTS.md"
cp "$SCRIPT_DIR/opencode.json" "$CONFIG_DIR/opencode.json"

echo "Installed to $CONFIG_DIR"
echo ""
echo "Agents:"
ls -1 "$CONFIG_DIR/agents/"
echo ""
echo "Skills:"
ls -1 "$CONFIG_DIR/skills/"
