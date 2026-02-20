"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState, useEffect } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { NewPostSection } from "@/components/social/new-post-section";
import { ReplySection } from "@/components/social/reply-section";
import { JobsSection } from "@/components/social/jobs-section";

type Tab = "new-post" | "reply" | "jobs";

function TweetBotContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<Tab>(
    tabParam === "replies" || tabParam === "reply"
      ? "reply"
      : tabParam === "jobs"
      ? "jobs"
      : "new-post"
  );

  useEffect(() => {
    if (tabParam === "replies" || tabParam === "reply") {
      setActiveTab("reply");
    } else if (tabParam === "jobs") {
      setActiveTab("jobs");
    }
  }, [tabParam]);

  function switchTab(tab: Tab) {
    setActiveTab(tab);
    const paramMap: Record<Tab, string> = {
      "new-post": "/social",
      reply: "/social?tab=replies",
      jobs: "/social?tab=jobs",
    };
    router.replace(paramMap[tab], { scroll: false });
  }

  return (
    <AppShell>
      <div className="space-y-4">
        {/* Header */}
        <header>
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">@WolfeUpHQ</p>
          <h2 className="text-3xl font-semibold">Tweet Bot</h2>
          <p className="text-sm text-slate-300 mt-1">Create new posts, find and reply to trending tweets, or review job history</p>
        </header>

        {/* Tab Switcher */}
        <div className="flex gap-0 rounded-xl border border-white/10 bg-white/5 p-1 w-fit">
          <button
            onClick={() => switchTab("new-post")}
            className={`flex items-center gap-2.5 rounded-lg px-5 py-3 text-sm font-medium transition ${
              activeTab === "new-post"
                ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0"><path d="M12 5v14M5 12h14"/></svg>
            New Post
          </button>
          <button
            onClick={() => switchTab("reply")}
            className={`flex items-center gap-2.5 rounded-lg px-5 py-3 text-sm font-medium transition ${
              activeTab === "reply"
                ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0"><path d="M9 17l-5-5 5-5"/><path d="M4 12h11a4 4 0 0 1 0 8h-1"/></svg>
            Reply to People
          </button>
          <button
            onClick={() => switchTab("jobs")}
            className={`flex items-center gap-2.5 rounded-lg px-5 py-3 text-sm font-medium transition ${
              activeTab === "jobs"
                ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 14l2 2 4-4"/></svg>
            Jobs & History
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "new-post" ? (
          <NewPostSection />
        ) : activeTab === "reply" ? (
          <ReplySection />
        ) : (
          <JobsSection />
        )}
      </div>
    </AppShell>
  );
}

export default function SocialPage() {
  return (
    <Suspense fallback={
      <AppShell>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-indigo-500" />
        </div>
      </AppShell>
    }>
      <TweetBotContent />
    </Suspense>
  );
}
