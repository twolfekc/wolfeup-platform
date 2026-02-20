"use client";

import { FormEvent, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";

const paginationOptions = { initialNumItems: 12 };

export default function MemoryPage() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return (
      <AppShell>
        <Card title="Memory" subtitle="Searchable memory + conversation index">
          <p className="text-sm text-slate-300">
            Convex is not configured yet. Set <code>NEXT_PUBLIC_CONVEX_URL</code> to enable memory and conversation search.
          </p>
        </Card>
      </AppShell>
    );
  }

  const [search, setSearch] = useState("");
  const [selectedMemoryId, setSelectedMemoryId] = useState<any>(null);
  const [draft, setDraft] = useState({ title: "", body: "", tags: "" });

  const memories = usePaginatedQuery(
    api.memory.searchMemories,
    { q: search },
    paginationOptions,
  );

  const conversations = usePaginatedQuery(
    api.memory.searchConversationsMetadata,
    { q: search },
    paginationOptions,
  );

  const selectedMemory = useQuery(
    api.memory.getMemory,
    selectedMemoryId ? { id: selectedMemoryId } : "skip",
  );

  const createMemory = useMutation(api.memory.createMemory);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const id = await createMemory({
      title: draft.title,
      body: draft.body,
      tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
    });
    setDraft({ title: "", body: "", tags: "" });
    setSelectedMemoryId(id);
  }

  return (
    <AppShell>
      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <Card title="Memory index" subtitle="Document list + global search across memory and conversations metadata">
          <div className="space-y-3">
            <input className="w-full rounded-lg border border-white/10 bg-white/5 p-2" placeholder="Search memories + conversations" value={search} onChange={(e) => setSearch(e.target.value)} />

            <form className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3" onSubmit={onCreate}>
              <p className="text-sm font-medium">New memory</p>
              <input className="w-full rounded-lg border border-white/10 bg-white/5 p-2" placeholder="Title" required value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
              <textarea className="w-full rounded-lg border border-white/10 bg-white/5 p-2" placeholder="Body" required value={draft.body} onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} />
              <input className="w-full rounded-lg border border-white/10 bg-white/5 p-2" placeholder="tags, comma,separated" value={draft.tags} onChange={(e) => setDraft((d) => ({ ...d, tags: e.target.value }))} />
              <button className="rounded-lg bg-indigo-500 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-400">Create</button>
            </form>

            <div className="space-y-2">
              {memories.results?.map((memory) => (
                <button key={memory._id} className="w-full rounded-xl border border-white/10 bg-black/20 p-3 text-left hover:border-indigo-300/40" onClick={() => setSelectedMemoryId(memory._id)}>
                  <p className="font-medium text-white">{memory.title}</p>
                  <p className="text-xs text-slate-300">Updated {new Date(memory.updatedAt).toLocaleString()}</p>
                </button>
              ))}
              {memories.status === "CanLoadMore" ? (
                <button className="rounded-lg border border-white/20 px-3 py-2 text-sm" onClick={() => memories.loadMore(12)}>Load more memories</button>
              ) : null}
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <Card title="Memory detail" subtitle="Focused document reader">
            {selectedMemory ? (
              <article className="space-y-3">
                <h3 className="text-2xl font-semibold">{selectedMemory.title}</h3>
                <p className="whitespace-pre-wrap text-sm leading-6 text-slate-200">{selectedMemory.body}</p>
                <p className="text-xs text-slate-300">Tags: {selectedMemory.tags.length ? selectedMemory.tags.join(", ") : "none"}</p>
              </article>
            ) : (
              <p className="text-sm text-slate-300">Select a memory from the list.</p>
            )}
          </Card>

          <Card title="Conversation metadata matches" subtitle="Global search results from conversations index">
            <div className="space-y-2">
              {conversations.results?.map((conversation) => (
                <article key={conversation._id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="font-medium text-white">{conversation.title}</p>
                  <p className="text-xs text-slate-300">{conversation.channel} · {conversation.participants.join(", ")}</p>
                  {conversation.summary ? <p className="mt-1 text-sm text-slate-200">{conversation.summary}</p> : null}
                </article>
              ))}
              {conversations.status === "CanLoadMore" ? (
                <button className="rounded-lg border border-white/20 px-3 py-2 text-sm" onClick={() => conversations.loadMore(12)}>Load more conversations</button>
              ) : null}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
