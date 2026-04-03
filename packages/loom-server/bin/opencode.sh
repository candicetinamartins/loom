#!/bin/sh
# OpenCode wrapper script for macOS/Linux

NODE="${LOOM_NODE_PATH:-node}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_LIB="${SCRIPT_DIR}/../lib/cli.js"

exec "$NODE" "$SERVER_LIB" "$@"
