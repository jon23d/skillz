#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="$HOME/.config/opencode"

# --- Model flags -----------------------------------------------------------
# --model sets all agents except reviewer and local-task.
# Per-agent flags override --model for that specific agent.
# --reviewer-model is an explicit opt-in (reviewer intentionally defaults to a fast model).
# --local-task-model is never touched by --model.
MODEL=""
BUILD_MODEL=""
ARCHITECT_MODEL=""
BACKEND_ENGINEER_MODEL=""
FRONTEND_ENGINEER_MODEL=""
DEVOPS_ENGINEER_MODEL=""
DEVELOPER_ADVOCATE_MODEL=""
QA_MODEL=""
REVIEWER_MODEL=""
TICKET_WRITER_MODEL=""
NOTIFIER_MODEL=""

for arg in "$@"; do
  case "$arg" in
    --model=*)                    MODEL="${arg#*=}" ;;
    --build-model=*)              BUILD_MODEL="${arg#*=}" ;;
    --architect-model=*)          ARCHITECT_MODEL="${arg#*=}" ;;
    --backend-engineer-model=*)   BACKEND_ENGINEER_MODEL="${arg#*=}" ;;
    --frontend-engineer-model=*)  FRONTEND_ENGINEER_MODEL="${arg#*=}" ;;
    --devops-engineer-model=*)    DEVOPS_ENGINEER_MODEL="${arg#*=}" ;;
    --developer-advocate-model=*) DEVELOPER_ADVOCATE_MODEL="${arg#*=}" ;;
    --qa-model=*)                 QA_MODEL="${arg#*=}" ;;
    --reviewer-model=*)           REVIEWER_MODEL="${arg#*=}" ;;
    --ticket-writer-model=*)      TICKET_WRITER_MODEL="${arg#*=}" ;;
    --notifier-model=*)           NOTIFIER_MODEL="${arg#*=}" ;;
    *) echo "Unknown argument: $arg"; exit 1 ;;
  esac
done

# ---------------------------------------------------------------------------

echo "Installing to $TARGET ..."

# Ensure target directory exists
mkdir -p "$TARGET"

# Copy agents/, tools/, plugins/, and skills/ into ~/.opencode/ (preserving subdirectory structure)
for dir in agents tools plugins skills; do
  echo "  Removing existing contents of $dir/"
  rm -fR "$TARGET/$dir/*"
  echo "  Copying $dir/ -> $TARGET/$dir/"
  cp -r "$SCRIPT_DIR/$dir" "$TARGET/"
done

# Copy docs/ contents directly into ~/.opencode/ (not into a docs/ subdirectory)
echo "  Copying docs/* -> $TARGET/"
cp -r "$SCRIPT_DIR/docs/." "$TARGET/"

# Main Agents
echo "  Copying AGENTS.md -> $TARGET/"
cp "$SCRIPT_DIR/AGENTS.md" "$TARGET/"

# Install tool dependencies
echo "  Installing tool dependencies..."
npm install --prefix "$TARGET/tools" --silent

# --- Apply model overrides -------------------------------------------------

set_model() {
  local file="$TARGET/agents/$1.md"
  local model="$2"
  if [ ! -f "$file" ]; then return; fi
  # sed -i behaviour differs between macOS and GNU; use perl for portability
  perl -i -pe "s|^model: .*|model: $model|" "$file"
  echo "  Set $1 model -> $model"
}

# --model applies to all primary agents (excludes reviewer and local-task)
if [ -n "$MODEL" ]; then
  for agent in build architect backend-engineer frontend-engineer devops-engineer developer-advocate qa notifier reviewer ticket-writer; do
    set_model "$agent" "$MODEL"
  done
fi

# Per-agent overrides (applied after --model, so they win)
[ -n "$BUILD_MODEL" ]              && set_model "build"              "$BUILD_MODEL"
[ -n "$ARCHITECT_MODEL" ]          && set_model "architect"          "$ARCHITECT_MODEL"
[ -n "$BACKEND_ENGINEER_MODEL" ]   && set_model "backend-engineer"   "$BACKEND_ENGINEER_MODEL"
[ -n "$FRONTEND_ENGINEER_MODEL" ]  && set_model "frontend-engineer"  "$FRONTEND_ENGINEER_MODEL"
[ -n "$DEVOPS_ENGINEER_MODEL" ]    && set_model "devops-engineer"    "$DEVOPS_ENGINEER_MODEL"
[ -n "$DEVELOPER_ADVOCATE_MODEL" ] && set_model "developer-advocate" "$DEVELOPER_ADVOCATE_MODEL"
[ -n "$QA_MODEL" ]                 && set_model "qa"                 "$QA_MODEL"
[ -n "$REVIEWER_MODEL" ]           && set_model "reviewer"           "$REVIEWER_MODEL"
[ -n "$TICKET_WRITER_MODEL" ]      && set_model "ticket-writer"      "$TICKET_WRITER_MODEL"
[ -n "$NOTIFIER_MODEL" ]           && set_model "notifier"           "$NOTIFIER_MODEL"

# ---------------------------------------------------------------------------

echo "Done."
