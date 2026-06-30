#!/usr/bin/env bash
#
# cdragon installer — clones this repo to ~/.cdragon and links the `cdragon`
# command onto your PATH. Re-run any time to update.
#
#   curl -fsSL https://raw.githubusercontent.com/speardragon/skills/main/install.sh | bash
#
# Env overrides:
#   CDRAGON_HOME   where to install    (default: ~/.cdragon)
#   CDRAGON_REPO   git source to clone (default: the GitHub repo)
#   CDRAGON_BIN    dir to link into    (default: /usr/local/bin or ~/.local/bin)
#
set -euo pipefail

REPO_URL="${CDRAGON_REPO:-https://github.com/speardragon/skills.git}"
CDRAGON_HOME="${CDRAGON_HOME:-$HOME/.cdragon}"

info() { printf '\033[36m▸\033[0m %s\n' "$1"; }
warn() { printf '\033[33m!\033[0m %s\n' "$1"; }
err()  { printf '\033[31m✖\033[0m %s\n' "$1" >&2; exit 1; }

command -v git  >/dev/null 2>&1 || err "git is required."
command -v node >/dev/null 2>&1 || err "Node.js (>=18) is required — cdragon is a Node CLI. Install Node first."

# 1. Clone or update.
if [ -d "$CDRAGON_HOME/.git" ]; then
  info "Updating existing install at $CDRAGON_HOME"
  git -C "$CDRAGON_HOME" pull --ff-only --quiet
else
  info "Cloning into $CDRAGON_HOME"
  git clone --depth 1 --quiet "$REPO_URL" "$CDRAGON_HOME"
fi

chmod +x "$CDRAGON_HOME/bin/cdragon.js"

# 2. Pick a bin dir that's (ideally) already on PATH.
if [ -n "${CDRAGON_BIN:-}" ]; then
  BIN_DIR="$CDRAGON_BIN"
  mkdir -p "$BIN_DIR"
elif [ -w "/usr/local/bin" ]; then
  BIN_DIR="/usr/local/bin"
else
  BIN_DIR="$HOME/.local/bin"
  mkdir -p "$BIN_DIR"
fi

ln -sf "$CDRAGON_HOME/bin/cdragon.js" "$BIN_DIR/cdragon"
info "Linked cdragon → $BIN_DIR/cdragon"

# 3. PATH hint if needed.
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) warn "$BIN_DIR is not on your PATH. Add this to your shell rc:"
     printf '      export PATH="%s:$PATH"\n' "$BIN_DIR" ;;
esac

info "Done. Run:  cdragon"
