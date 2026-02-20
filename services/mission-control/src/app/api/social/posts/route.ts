import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";

const DATA_DIR = join(process.cwd(), ".data");
const POSTS_FILE = join(DATA_DIR, "social-posts.json");

type Post = {
  id: string;
  content: string;
  platform: string;
  model: string;
  modelEndpoint: string;
  prompt: string;
  tone: string;
  status: string;
  generatedAt: number;
  postedAt?: number;
  externalId?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
};

async function loadPosts(): Promise<Post[]> {
  try {
    const data = await readFile(POSTS_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function savePosts(posts: Post[]) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(POSTS_FILE, JSON.stringify(posts, null, 2));
}

export async function GET() {
  const posts = await loadPosts();
  return NextResponse.json(posts.sort((a, b) => b.createdAt - a.createdAt));
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const posts = await loadPosts();
  const post: Post = {
    id: crypto.randomUUID(),
    content: body.content,
    platform: body.platform,
    model: body.model,
    modelEndpoint: body.modelEndpoint || "",
    prompt: body.prompt,
    tone: body.tone,
    status: body.status || "generated",
    generatedAt: body.generatedAt || Date.now(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  posts.unshift(post);
  await savePosts(posts);
  return NextResponse.json(post);
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const posts = await loadPosts();
  const idx = posts.findIndex((p) => p.id === body.id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  posts[idx] = { ...posts[idx], ...body, updatedAt: Date.now() };
  await savePosts(posts);
  return NextResponse.json(posts[idx]);
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const posts = await loadPosts();
  const filtered = posts.filter((p) => p.id !== id);
  await savePosts(filtered);
  return NextResponse.json({ ok: true });
}
