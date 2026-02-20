import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";

const DATA_DIR = join(process.cwd(), ".data");
const JOBS_FILE = join(DATA_DIR, "reply-jobs.json");

type JobSummary = {
  id: string;
  status: string;
  queries: string[];
  tweetsFound: number;
  repliesSent: number;
  duration: number;
  createdAt: number;
  results?: unknown[];
};

async function loadJobs(): Promise<JobSummary[]> {
  try {
    const data = await readFile(JOBS_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function saveJobs(jobs: JobSummary[]) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(JOBS_FILE, JSON.stringify(jobs, null, 2));
}

export async function GET() {
  return NextResponse.json(await loadJobs());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const jobs = await loadJobs();
  const job: JobSummary = {
    id: body.id || crypto.randomUUID(),
    status: body.status || "completed",
    queries: body.queries || [],
    tweetsFound: body.tweetsFound || 0,
    repliesSent: body.repliesSent || 0,
    duration: body.duration || 0,
    createdAt: body.createdAt || Date.now(),
    results: body.results,
  };
  jobs.unshift(job);
  if (jobs.length > 100) jobs.length = 100;
  await saveJobs(jobs);
  return NextResponse.json(job, { status: 201 });
}
