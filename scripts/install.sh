#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PRODUCT_NAME="4U2CtheUVC"
JOB_LABEL="io.github.4u2ctheuvc.server"
APP_SUPPORT="$HOME/Library/Application Support/$PRODUCT_NAME"
INSTALL_DIR="$APP_SUPPORT/app"
DATA_DIR="$APP_SUPPORT/data"
LOG_FILE="$APP_SUPPORT/server.log"
LAUNCH_AGENT="$HOME/Library/LaunchAgents/$JOB_LABEL.plist"
APP_BUNDLE="$HOME/Applications/$PRODUCT_NAME.app"
JOB_TARGET="gui/$(id -u)/$JOB_LABEL"

find_node() {
  local candidate=""
  if command -v node >/dev/null 2>&1; then
    candidate="$(command -v node)"
    [ -x "$candidate" ] && { printf '%s\n' "$candidate"; return; }
  fi

  while IFS= read -r candidate; do
    [ -x "$candidate" ] && { printf '%s\n' "$candidate"; return; }
  done < <(find "${NVM_DIR:-$HOME/.nvm}/versions/node" -path '*/bin/node' -type f 2>/dev/null | sort -Vr)
}

NODE_BIN="$(find_node)"
if [ -z "$NODE_BIN" ]; then
  echo "Node.js 20 or newer is required. Install it from https://nodejs.org and run this installer again."
  exit 1
fi

NODE_MAJOR="$($NODE_BIN -p 'Number(process.versions.node.split(".")[0])')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js 20 or newer is required; found $($NODE_BIN --version)."
  exit 1
fi

NPM_BIN="$(dirname "$NODE_BIN")/npm"
if [ ! -x "$NPM_BIN" ]; then
  NPM_BIN="$(command -v npm 2>/dev/null || true)"
fi
if [ -z "$NPM_BIN" ] || [ ! -x "$NPM_BIN" ]; then
  echo "npm was not found alongside Node.js."
  exit 1
fi

if ! command -v xcrun >/dev/null 2>&1 || ! xcrun --find clang++ >/dev/null 2>&1; then
  echo "Apple Command Line Tools are required. Run 'xcode-select --install', then run this installer again."
  exit 1
fi

echo "Installing $PRODUCT_NAME with $($NODE_BIN --version)…"
"$NPM_BIN" ci --prefix "$SOURCE_DIR" --omit=dev

mkdir -p "$INSTALL_DIR/native/bin" "$DATA_DIR/presets" "$HOME/Library/LaunchAgents" "$HOME/Applications"
ditto "$SOURCE_DIR/server.js" "$INSTALL_DIR/server.js"
ditto "$SOURCE_DIR/public" "$INSTALL_DIR/public"
ditto "$SOURCE_DIR/node_modules" "$INSTALL_DIR/node_modules"
ditto "$SOURCE_DIR/native/uvc_iokit.cpp" "$INSTALL_DIR/native/uvc_iokit.cpp"

NATIVE_SOURCE="$INSTALL_DIR/native/uvc_iokit.cpp"
NATIVE_BINARY="$INSTALL_DIR/native/bin/uvc_iokit"
if ! xcrun clang++ -std=c++17 -Wall -Wextra -Werror -arch arm64 -arch x86_64 \
  -framework IOKit -framework CoreFoundation "$NATIVE_SOURCE" -o "$NATIVE_BINARY"; then
  echo "Universal build unavailable; compiling for this Mac ($(uname -m))…"
  xcrun clang++ -std=c++17 -Wall -Wextra -Werror \
    -framework IOKit -framework CoreFoundation "$NATIVE_SOURCE" -o "$NATIVE_BINARY"
fi
chmod 755 "$NATIVE_BINARY"

launchctl bootout "$JOB_TARGET" >/dev/null 2>&1 || true

PORT_PID="$(lsof -tiTCP:3847 -sTCP:LISTEN 2>/dev/null | head -n 1 || true)"
if [ -n "$PORT_PID" ]; then
  echo "Port 3847 is already in use by process $PORT_PID. Stop that application and run the installer again."
  exit 1
fi

ditto "$SCRIPT_DIR/$JOB_LABEL.plist" "$LAUNCH_AGENT"
/usr/libexec/PlistBuddy -c "Set :ProgramArguments:0 $NODE_BIN" "$LAUNCH_AGENT"
/usr/libexec/PlistBuddy -c "Set :ProgramArguments:1 $INSTALL_DIR/server.js" "$LAUNCH_AGENT"
/usr/libexec/PlistBuddy -c "Set :WorkingDirectory $INSTALL_DIR" "$LAUNCH_AGENT"
/usr/libexec/PlistBuddy -c "Set :EnvironmentVariables:CAMUTIL_DATA_DIR $DATA_DIR" "$LAUNCH_AGENT"
/usr/libexec/PlistBuddy -c "Set :StandardOutPath $LOG_FILE" "$LAUNCH_AGENT"
/usr/libexec/PlistBuddy -c "Set :StandardErrorPath $LOG_FILE" "$LAUNCH_AGENT"

mkdir -p "$APP_BUNDLE/Contents/MacOS"
ditto "$SOURCE_DIR/packaging/Info.plist" "$APP_BUNDLE/Contents/Info.plist"
ditto "$SCRIPT_DIR/app-launcher" "$APP_BUNDLE/Contents/MacOS/$PRODUCT_NAME"
chmod 755 "$APP_BUNDLE/Contents/MacOS/$PRODUCT_NAME"

launchctl bootstrap "gui/$(id -u)" "$LAUNCH_AGENT"

echo
echo "$PRODUCT_NAME was installed successfully."
echo "App: $APP_BUNDLE"
echo "Data: $DATA_DIR"
echo "Log: $LOG_FILE"
echo
echo "Opening ${PRODUCT_NAME}…"
open "$APP_BUNDLE"
