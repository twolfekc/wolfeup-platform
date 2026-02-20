"use client";

import { useEffect, useState, useCallback } from "react";
import { AppShell } from "@/components/layout/app-shell";

type McpServer = {
  name: string;
  port: number;
  status: "online" | "offline" | "error";
  description: string;
  pid?: number;
  latencyMs?: number;
};

type McpMarketplaceItem = {
  name: string;
  package: string;
  description: string;
  installed: boolean;
  category: string;
  stars?: number;
};

const MARKETPLACE: McpMarketplaceItem[] = [
  { name: "Filesystem", package: "@modelcontextprotocol/server-filesystem", description: "Read/write/search files on the filesystem", installed: false, category: "Core", stars: 4200 },
  { name: "Memory", package: "@modelcontextprotocol/server-memory", description: "Persistent key-value memory store across sessions", installed: false, category: "Core", stars: 3100 },
  { name: "Sequential Thinking", package: "@modelcontextprotocol/server-sequential-thinking", description: "Structured step-by-step reasoning tool", installed: false, category: "AI", stars: 2800 },
  { name: "Brave Search", package: "@modelcontextprotocol/server-brave-search", description: "Web search via Brave Search API", installed: false, category: "Search", stars: 3500 },
  { name: "GitHub", package: "@modelcontextprotocol/server-github", description: "GitHub repos, issues, PRs, code search", installed: false, category: "Dev Tools", stars: 5100 },
  { name: "Playwright", package: "@playwright/mcp", description: "Browser automation via Chrome CDP", installed: false, category: "Automation", stars: 6200 },
  { name: "Puppeteer", package: "@modelcontextprotocol/server-puppeteer", description: "Headless browser automation with Puppeteer", installed: false, category: "Automation", stars: 2400 },
  { name: "Desktop Commander", package: "@wonderwhy-er/desktop-commander", description: "Terminal commands, file ops, process management", installed: false, category: "System", stars: 1800 },
  { name: "Xcode Build", package: "xcodebuildmcp", description: "Build, run, test Xcode projects and iOS Simulator", installed: false, category: "Dev Tools", stars: 900 },
  { name: "iOS Simulator", package: "ios-simulator-mcp", description: "Control iOS Simulator UI, screenshots, a11y", installed: false, category: "Dev Tools", stars: 700 },
  { name: "Shell Commands", package: "mcp-server-commands", description: "Run shell commands as MCP tools", installed: false, category: "System", stars: 1500 },
  { name: "Obsidian", package: "mcp-obsidian", description: "Read/write Obsidian vault notes", installed: false, category: "Productivity", stars: 2100 },
  { name: "Context7", package: "@upstash/context7-mcp", description: "Up-to-date library docs and code examples", installed: false, category: "AI", stars: 1900 },
  { name: "Google Drive", package: "@modelcontextprotocol/server-gdrive", description: "Google Drive file access via OAuth", installed: false, category: "Productivity", stars: 2700 },
  { name: "Everything", package: "@modelcontextprotocol/server-everything", description: "Demo server exercising all MCP protocol features", installed: false, category: "Testing", stars: 800 },
  { name: "Postgres", package: "@modelcontextprotocol/server-postgres", description: "Read-only PostgreSQL database access", installed: false, category: "Data", stars: 3800 },
  { name: "SQLite", package: "@modelcontextprotocol/server-sqlite", description: "SQLite database operations", installed: false, category: "Data", stars: 2200 },
  { name: "Slack", package: "@modelcontextprotocol/server-slack", description: "Slack workspace messaging and search", installed: false, category: "Communication", stars: 4100 },
  { name: "Fetch", package: "@modelcontextprotocol/server-fetch", description: "HTTP fetch with content extraction", installed: false, category: "Core", stars: 3900 },
  { name: "Git", package: "@modelcontextprotocol/server-git", description: "Git repository operations and history", installed: false, category: "Dev Tools", stars: 3200 },
];

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    online: "bg-emerald-400",
    offline: "bg-slate-500",
    error: "bg-red-400",
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status] || "bg-slate-500"}`} />;
}

function CategoryBadge({ category }: { category: string }) {
  const colors: Record<string, string> = {
    Core: "bg-blue-900/50 text-blue-300 border-blue-700/50",
    AI: "bg-purple-900/50 text-purple-300 border-purple-700/50",
    Search: "bg-amber-900/50 text-amber-300 border-amber-700/50",
    "Dev Tools": "bg-cyan-900/50 text-cyan-300 border-cyan-700/50",
    Automation: "bg-indigo-900/50 text-indigo-300 border-indigo-700/50",
    System: "bg-red-900/50 text-red-300 border-red-700/50",
    Productivity: "bg-green-900/50 text-green-300 border-green-700/50",
    Testing: "bg-slate-700/50 text-slate-300 border-slate-600/50",
    Data: "bg-orange-900/50 text-orange-300 border-orange-700/50",
    Communication: "bg-pink-900/50 text-pink-300 border-pink-700/50",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${colors[category] || "bg-slate-700 text-slate-300 border-slate-600"}`}>
      {category}
    </span>
  );
}

export default function McpPage() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"running" | "marketplace">("running");
  const [filterCategory, setFilterCategory] = useState<string>("All");

  const fetchServers = useCallback(async () => {
    try {
      const res = await fetch("/api/mcp/servers");
      if (res.ok) {
        const data = await res.json();
        setServers(data.servers || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServers();
    const interval = setInterval(fetchServers, 10000);
    return () => clearInterval(interval);
  }, [fetchServers]);

  const installedNames = new Set(servers.map((s) => s.name));

  const marketplace = MARKETPLACE.map((item) => ({
    ...item,
    installed: installedNames.has(item.name),
  }));

  const categories = ["All", ...Array.from(new Set(MARKETPLACE.map((m) => m.category)))];
  const filteredMarketplace =
    filterCategory === "All" ? marketplace : marketplace.filter((m) => m.category === filterCategory);

  const onlineCount = servers.filter((s) => s.status === "online").length;
  const offlineCount = servers.filter((s) => s.status !== "online").length;

  async function handleInstall(pkg: string) {
    setInstalling(pkg);
    try {
      const res = await fetch("/api/mcp/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package: pkg }),
      });
      if (res.ok) {
        await fetchServers();
      }
    } catch {
      // ignore
    } finally {
      setInstalling(null);
    }
  }

  async function handleRestart(port: number) {
    try {
      await fetch("/api/mcp/restart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ port }),
      });
      setTimeout(fetchServers, 2000);
    } catch {
      // ignore
    }
  }

  return (
    <AppShell>
      <div className="space-y-4">
        <header>
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Infrastructure</p>
          <h2 className="text-3xl font-semibold">MCP Servers</h2>
          <p className="text-sm text-slate-300 mt-1">
            Manage Model Context Protocol servers running on the MCP host
          </p>
        </header>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-400">Total Servers</p>
            <p className="text-2xl font-semibold mt-1">{servers.length}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-400">Online</p>
            <p className="text-2xl font-semibold mt-1 text-emerald-400">{onlineCount}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-400">Offline</p>
            <p className="text-2xl font-semibold mt-1 text-slate-400">{offlineCount}</p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-0 rounded-xl border border-white/10 bg-white/5 p-1 w-fit">
          <button
            onClick={() => setActiveTab("running")}
            className={`flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-medium transition ${
              activeTab === "running"
                ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            Running ({onlineCount}/{servers.length})
          </button>
          <button
            onClick={() => setActiveTab("marketplace")}
            className={`flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-medium transition ${
              activeTab === "marketplace"
                ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2L3 7v11a2 2 0 002 2h14a2 2 0 002-2V7l-3-5z"/><line x1="3" y1="7" x2="21" y2="7"/><path d="M16 11a4 4 0 01-8 0"/></svg>
            Marketplace ({MARKETPLACE.length})
          </button>
        </div>

        {/* Running Servers */}
        {activeTab === "running" && (
          <div className="space-y-2">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-indigo-500" />
              </div>
            ) : servers.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-slate-400">
                No MCP servers detected. Start them on iMac.local or install from the Marketplace.
              </div>
            ) : (
              servers.map((server) => (
                <div
                  key={server.port}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/[0.07] transition"
                >
                  <div className="flex items-center gap-3">
                    <StatusDot status={server.status} />
                    <div>
                      <p className="font-medium">{server.name}</p>
                      <p className="text-xs text-slate-400">
                        :{server.port} &middot; {server.description}
                        {server.latencyMs !== undefined && (
                          <span className="text-slate-500"> &middot; {server.latencyMs}ms</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        server.status === "online"
                          ? "bg-emerald-900/40 text-emerald-300"
                          : "bg-slate-700/50 text-slate-400"
                      }`}
                    >
                      {server.status}
                    </span>
                    {server.status !== "online" && (
                      <button
                        onClick={() => handleRestart(server.port)}
                        className="text-xs px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white transition"
                      >
                        Restart
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Marketplace */}
        {activeTab === "marketplace" && (
          <div className="space-y-3">
            {/* Category filter */}
            <div className="flex gap-1.5 flex-wrap">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  className={`text-xs px-3 py-1.5 rounded-lg transition ${
                    filterCategory === cat
                      ? "bg-indigo-500 text-white"
                      : "bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Server list */}
            <div className="grid gap-2">
              {filteredMarketplace.map((item) => (
                <div
                  key={item.package}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/[0.07] transition"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{item.name}</p>
                      <CategoryBadge category={item.category} />
                      {item.installed && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-300 border border-emerald-700/50">
                          Installed
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{item.description}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5 font-mono">{item.package}</p>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    {item.stars && (
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                        {(item.stars / 1000).toFixed(1)}k
                      </span>
                    )}
                    {item.installed ? (
                      <span className="text-xs text-emerald-400 font-medium px-3 py-1.5">Active</span>
                    ) : (
                      <button
                        onClick={() => handleInstall(item.package)}
                        disabled={installing === item.package}
                        className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition disabled:opacity-50"
                      >
                        {installing === item.package ? "Installing..." : "Install"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
