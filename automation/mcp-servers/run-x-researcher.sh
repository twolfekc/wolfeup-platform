#!/bin/bash
# Run x-reply-researcher.js — called by cron
# Ensures Chrome CDP is running, then executes the researcher
export PATH="/usr/local/bin:$PATH"
CDP_PORT="${CDP_PORT:-9222}"
MCP_DIR="${MCP_DIR:-$HOME/mcp}"
cd "$MCP_DIR"

# Check if Chrome CDP is running
if ! curl -s -o /dev/null "http://localhost:$CDP_PORT/json/version" 2>/dev/null; then
  echo "[$(date -u +%FT%TZ)] Chrome CDP not running, launching..."
  kill -9 $(pgrep -f 'Google Chrome') 2>/dev/null
  sleep 2
  rm -f "$HOME/chrome-cdp/SingletonLock"
  nohup '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
    "--remote-debugging-port=$CDP_PORT" --no-first-run --no-default-browser-check \
    "--user-data-dir=$HOME/chrome-cdp" 'https://x.com/home' \
    > /dev/null 2>&1 &
  sleep 8
fi

# Run the researcher
/usr/local/bin/node "$MCP_DIR/x-reply-researcher.js" >> "$MCP_DIR/logs/x-researcher.log" 2>&1
