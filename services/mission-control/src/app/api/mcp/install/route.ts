import { NextRequest, NextResponse } from "next/server";

const MCP_HOST = process.env.MCP_HOST || "localhost";

// This endpoint triggers npm install on the MCP host via the desktop-commander MCP server
// For security, only allow known packages from the MCP registry
const ALLOWED_PACKAGES = new Set([
  "@modelcontextprotocol/server-filesystem",
  "@modelcontextprotocol/server-memory",
  "@modelcontextprotocol/server-sequential-thinking",
  "@modelcontextprotocol/server-brave-search",
  "@modelcontextprotocol/server-github",
  "@playwright/mcp",
  "@modelcontextprotocol/server-puppeteer",
  "@wonderwhy-er/desktop-commander",
  "xcodebuildmcp",
  "ios-simulator-mcp",
  "mcp-server-commands",
  "mcp-obsidian",
  "@upstash/context7-mcp",
  "@modelcontextprotocol/server-gdrive",
  "@modelcontextprotocol/server-everything",
  "@modelcontextprotocol/server-postgres",
  "@modelcontextprotocol/server-sqlite",
  "@modelcontextprotocol/server-slack",
  "@modelcontextprotocol/server-fetch",
  "@modelcontextprotocol/server-git",
]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const pkg = body.package;

    if (!pkg || !ALLOWED_PACKAGES.has(pkg)) {
      return NextResponse.json(
        { error: "Package not in allowed list", package: pkg },
        { status: 400 }
      );
    }

    // Use desktop-commander on .11 to run npm install
    // Port 9008 is the desktop-commander MCP server
    const commanderUrl = `http://${MCP_HOST}:9008`;

    // For now, return a message indicating the install would happen
    // In production, this would send an MCP tool call to desktop-commander
    return NextResponse.json({
      status: "queued",
      package: pkg,
      message: `Install queued for ${pkg} on ${MCP_HOST}. Use SSH to run: cd /Users/openclaw/mcp && npm install ${pkg}`,
      host: MCP_HOST,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Install failed", detail: e.message },
      { status: 500 }
    );
  }
}
