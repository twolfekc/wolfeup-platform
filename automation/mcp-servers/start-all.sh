#!/bin/bash
# MCP Server Launcher — starts all 15 servers on sequential ports
# Ports: 9001-9015
# Logs: /Users/openclaw/mcp/logs/

export PATH="/usr/local/bin:$PATH"
MCP_DIR="/Users/openclaw/mcp"
NODE="/usr/local/bin/node"
PROXY="$MCP_DIR/node_modules/.bin/mcp-proxy"
LOG_DIR="$MCP_DIR/logs"
mkdir -p "$LOG_DIR"

# Kill old instances
pkill -f "mcp-proxy" 2>/dev/null
sleep 1

echo "[$(date)] Starting MCP servers..."

# 1. filesystem (port 9001)
"$PROXY" --port 9001 --host 0.0.0.0 -- "$NODE" "$MCP_DIR/node_modules/@modelcontextprotocol/server-filesystem/dist/index.js" /Users/openclaw /tmp >> "$LOG_DIR/filesystem.log" 2>&1 &
echo "Started filesystem on :9001 (pid $!)"

# 2. memory (port 9002)
"$PROXY" --port 9002 --host 0.0.0.0 -- "$NODE" "$MCP_DIR/node_modules/@modelcontextprotocol/server-memory/dist/index.js" >> "$LOG_DIR/memory.log" 2>&1 &
echo "Started memory on :9002 (pid $!)"

# 3. sequential-thinking (port 9003)
"$PROXY" --port 9003 --host 0.0.0.0 -- "$NODE" "$MCP_DIR/node_modules/@modelcontextprotocol/server-sequential-thinking/dist/index.js" >> "$LOG_DIR/sequential-thinking.log" 2>&1 &
echo "Started sequential-thinking on :9003 (pid $!)"

# 4. brave-search (port 9004)
BRAVE_API_KEY="$BRAVE_API_KEY" "$PROXY" --port 9004 --host 0.0.0.0 -- "$NODE" "$MCP_DIR/node_modules/@modelcontextprotocol/server-brave-search/dist/index.js" >> "$LOG_DIR/brave-search.log" 2>&1 &
echo "Started brave-search on :9004 (pid $!)"

# 5. github (port 9005)
GITHUB_PERSONAL_ACCESS_TOKEN="$GITHUB_TOKEN" "$PROXY" --port 9005 --host 0.0.0.0 -- "$NODE" "$MCP_DIR/node_modules/@modelcontextprotocol/server-github/dist/index.js" >> "$LOG_DIR/github.log" 2>&1 &
echo "Started github on :9005 (pid $!)"

# 6. playwright — connects to existing Chrome CDP on port 18800 (port 9006)
"$PROXY" --port 9006 --host 0.0.0.0 -- "$NODE" "$MCP_DIR/node_modules/@playwright/mcp/cli.js" --cdp-endpoint http://localhost:18800 >> "$LOG_DIR/playwright.log" 2>&1 &
echo "Started playwright on :9006 (pid $!)"

# 7. puppeteer (port 9007)
"$PROXY" --port 9007 --host 0.0.0.0 -- "$NODE" "$MCP_DIR/node_modules/@modelcontextprotocol/server-puppeteer/dist/index.js" >> "$LOG_DIR/puppeteer.log" 2>&1 &
echo "Started puppeteer on :9007 (pid $!)"

# 8. desktop-commander (port 9008)
"$PROXY" --port 9008 --host 0.0.0.0 -- "$NODE" "$MCP_DIR/node_modules/@wonderwhy-er/desktop-commander/dist/index.js" >> "$LOG_DIR/desktop-commander.log" 2>&1 &
echo "Started desktop-commander on :9008 (pid $!)"

# 9. xcodebuild (port 9009)
"$PROXY" --port 9009 --host 0.0.0.0 -- "$NODE" "$MCP_DIR/node_modules/xcodebuildmcp/dist/index.js" >> "$LOG_DIR/xcodebuild.log" 2>&1 &
echo "Started xcodebuild on :9009 (pid $!)"

# 10. ios-simulator (port 9010)
"$PROXY" --port 9010 --host 0.0.0.0 -- "$NODE" "$MCP_DIR/node_modules/ios-simulator-mcp/dist/index.js" >> "$LOG_DIR/ios-simulator.log" 2>&1 &
echo "Started ios-simulator on :9010 (pid $!)"

# 11. mcp-commands (port 9011)
"$PROXY" --port 9011 --host 0.0.0.0 -- "$NODE" "$MCP_DIR/node_modules/mcp-server-commands/dist/index.js" >> "$LOG_DIR/mcp-commands.log" 2>&1 &
echo "Started mcp-commands on :9011 (pid $!)"

# 12. obsidian (port 9012) — needs OBSIDIAN_API_KEY set if using
OBSIDIAN_API_KEY="" OBSIDIAN_HOST="http://localhost:27123" "$PROXY" --port 9012 --host 0.0.0.0 -- "$NODE" "$MCP_DIR/node_modules/mcp-obsidian/dist/index.js" >> "$LOG_DIR/obsidian.log" 2>&1 &
echo "Started obsidian on :9012 (pid $!)"

# 13. context7 (port 9013)
"$PROXY" --port 9013 --host 0.0.0.0 -- "$NODE" "$MCP_DIR/node_modules/@upstash/context7-mcp/dist/index.js" >> "$LOG_DIR/context7.log" 2>&1 &
echo "Started context7 on :9013 (pid $!)"

# 14. gdrive (port 9014) — needs OAuth, starts but won't auth until configured
"$PROXY" --port 9014 --host 0.0.0.0 -- "$NODE" "$MCP_DIR/node_modules/@modelcontextprotocol/server-gdrive/dist/index.js" >> "$LOG_DIR/gdrive.log" 2>&1 &
echo "Started gdrive on :9014 (pid $!)"

# 15. everything/test (port 9015)
"$PROXY" --port 9015 --host 0.0.0.0 -- "$NODE" "$MCP_DIR/node_modules/@modelcontextprotocol/server-everything/dist/index.js" >> "$LOG_DIR/everything.log" 2>&1 &
echo "Started everything on :9015 (pid $!)"

echo "[$(date)] All 15 MCP servers launched. SSE endpoints at http://\$(hostname):9001-9015/sse"
