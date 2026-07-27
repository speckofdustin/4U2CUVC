#!/bin/bash

set -euo pipefail

PRODUCT_NAME="4U2CtheUVC"
JOB_LABEL="io.github.4u2ctheuvc.server"
APP_SUPPORT="$HOME/Library/Application Support/$PRODUCT_NAME"
INSTALL_DIR="$APP_SUPPORT/app"
DATA_DIR="$APP_SUPPORT/data"
LAUNCH_AGENT="$HOME/Library/LaunchAgents/$JOB_LABEL.plist"
APP_BUNDLE="$HOME/Applications/$PRODUCT_NAME.app"
JOB_TARGET="gui/$(id -u)/$JOB_LABEL"
PURGE_DATA=0

if [ "${1:-}" = "--purge-data" ]; then
  PURGE_DATA=1
elif [ "$#" -gt 0 ]; then
  echo "Usage: $0 [--purge-data]"
  exit 64
fi

launchctl bootout "$JOB_TARGET" >/dev/null 2>&1 || true
rm -f "$LAUNCH_AGENT"
rm -rf "$APP_BUNDLE" "$INSTALL_DIR"

if [ "$PURGE_DATA" -eq 1 ]; then
  rm -rf "$DATA_DIR"
  echo "Removed $PRODUCT_NAME, including presets and saved data."
else
  echo "Removed $PRODUCT_NAME. Presets remain in: $DATA_DIR"
fi
