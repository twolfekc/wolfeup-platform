"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { AppShell } from "@/components/layout/app-shell";
import { useEffect } from "react";

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-emerald-400 shadow-emerald-400/50",
    idle: "bg-amber-400 shadow-amber-400/50",
    spawning: "bg-blue-400 shadow-blue-400/50 animate-pulse",
    offline: "bg-slate-500 shadow-slate-500/50",
  };
  return (
    <span className={`inline-block h-2.5 w-2.5 rounded-full shadow-[0_0_6px] ${colors[status] || colors.offline}`} title={status} />
  );
}

function TypeBadge({ type }: { type: string }) {
  return type === "primary" ? (
    <span className="rounded-full bg-indigo-900/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-300">Primary</span>
  ) : (
    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Sub-agent</span>
  );
}

export default function TeamPage() {
  const teamData = useQuery(api.teamStructure.listTeamStructure);
  const ensureSeeded = useMutation(api.teamStructure.ensureSeeded);

  useEffect(() => {
    ensureSeeded().catch(() => {});
  }, [ensureSeeded]);

  const isLoading = teamData === undefined;

  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Team</p>
          <h2 className="text-3xl font-semibold">Team & Agents</h2>
          <p className="text-sm text-slate-300">Roles, agents, responsibilities, and real-time status</p>
        </header>

        {isLoading ? (
          <div className="flex items-center gap-3 text-slate-400">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-500 border-t-indigo-400" />
            Loading team structure...
          </div>
        ) : teamData && teamData.length > 0 ? (
          <div className="space-y-8">
            {teamData.map((group) => (
              <section key={group.role._id} className="space-y-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-xl font-semibold text-white">{group.role.label}</h3>
                  {group.role.description && (
                    <span className="text-sm text-slate-400">— {group.role.description}</span>
                  )}
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-slate-300">
                    {group.agents.length} agent{group.agents.length !== 1 ? "s" : ""}
                  </span>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {group.agents.map((agent) => (
                    <div key={agent._id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 hover:border-white/20 transition space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <StatusDot status={agent.currentStatus?.status || "offline"} />
                            <h4 className="font-semibold text-white">{agent.name}</h4>
                          </div>
                          <p className="text-xs text-slate-500 font-mono">{agent.key}</p>
                        </div>
                        <TypeBadge type={agent.type} />
                      </div>

                      <div>
                        <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Responsibilities</p>
                        <ul className="space-y-1">
                          {agent.responsibilities.map((r) => (
                            <li key={r._id} className="flex items-start gap-2 text-xs text-slate-300">
                              <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-slate-500" />
                              {r.responsibility}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Recent Tasks</p>
                        {agent.recentTasks.length > 0 ? (
                          <ul className="space-y-1">
                            {agent.recentTasks.map((task) => (
                              <li key={task._id} className="flex items-start gap-2 text-xs text-slate-400">
                                <span className="mt-0.5 text-emerald-500">✓</span>
                                {task.title}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-slate-500 italic">No recent tasks</p>
                        )}
                      </div>

                      <div className="rounded-xl border border-white/5 bg-black/20 p-3 space-y-1.5">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500">Spawn Controls</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                          <span className="text-slate-500">Can Spawn</span>
                          <span className={agent.spawnControls.canSpawn ? "text-emerald-400" : "text-red-400"}>
                            {agent.spawnControls.canSpawn ? "Yes" : "No"}
                          </span>
                          <span className="text-slate-500">Max Children</span>
                          <span className="text-slate-300">{agent.spawnControls.maxParallelChildren}</span>
                          <span className="text-slate-500">Runtime</span>
                          <span className="text-slate-300 truncate" title={agent.spawnControls.defaultRuntime}>{agent.spawnControls.defaultRuntime}</span>
                          <span className="text-slate-500">Escalation</span>
                          <span className="text-slate-300 truncate" title={agent.spawnControls.escalationRoute}>{agent.spawnControls.escalationRoute}</span>
                        </div>
                      </div>

                      <div className="text-[10px] text-slate-500">
                        <span className="font-medium">Memory:</span> {agent.memoryScope}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/20 p-10 text-center">
            <p className="text-slate-400">No team data yet. Seeding in progress...</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
