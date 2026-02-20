import { NextResponse } from "next/server";

const MCP_HOST = process.env.MCP_HOST || "localhost";

type ServerDef = {
  name: string;
  port: number;
  description: string;
};

const SERVERS: ServerDef[] = [
  { name: "Filesystem", port: 9001, description: "Read/write/search files" },
  { name: "Memory", port: 9002, description: "Persistent key-value store" },
  { name: "Sequential Thinking", port: 9003, description: "Step-by-step reasoning" },
  { name: "Brave Search", port: 9004, description: "Web search via Brave API" },
  { name: "GitHub", port: 9005, description: "GitHub repos, issues, PRs" },
  { name: "Playwright", port: 9006, description: "Browser automation (Chrome CDP)" },
  { name: "Puppeteer", port: 9007, description: "Headless browser automation" },
  { name: "Desktop Commander", port: 9008, description: "Terminal & file ops" },
  { name: "Xcode Build", port: 9009, description: "Build/run/test Xcode projects" },
  { name: "iOS Simulator", port: 9010, description: "iOS Simulator control" },
  { name: "Shell Commands", port: 9011, description: "Run shell commands as MCP tools" },
  { name: "Obsidian", port: 9012, description: "Obsidian vault notes" },
  { name: "Context7", port: 9013, description: "Library docs & code examples" },
  { name: "Google Drive", port: 9014, description: "Google Drive file access" },
  { name: "Everything", port: 9015, description: "MCP protocol test server" },
];

async function checkServer(server: ServerDef): Promise<{
  name: string;
  port: number;
  description: string;
  status: "online" | "offline" | "error";
  latencyMs: number;
}> {
  const start = Date.now();
  try {
    const res = await fetch(`http://${MCP_HOST}:${server.port}/sse`, {
      signal: AbortSignal.timeout(3000),
    });
    const latencyMs = Date.now() - start;
    return {
      ...server,
      status: res.ok ? "online" : "error",
      latencyMs,
    };
  } catch {
    return {
      ...server,
      status: "offline",
      latencyMs: Date.now() - start,
    };
  }
}

export async function GET() {
  const results = await Promise.all(SERVERS.map(checkServer));
  const online = results.filter((r) => r.status === "online").length;
  return NextResponse.json({
    servers: results,
    summary: { total: results.length, online, offline: results.length - online },
    host: MCP_HOST,
    checkedAt: new Date().toISOString(),
  });
}
