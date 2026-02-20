import { NextResponse } from "next/server";

const GAMES_API_URL = process.env.GAMES_API_URL || "http://games_api:4000";

export async function GET() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    // Try the games API for game list
    const res = await fetch(`${GAMES_API_URL}/api/games`, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      return NextResponse.json({ error: "Games API returned error", status: res.status }, { status: 502 });
    }

    const games = await res.json();
    const gameList = Array.isArray(games) ? games : games.games || [];

    const stats = {
      total: gameList.length,
      active: gameList.filter((g: any) => g.status === "active" || g.status === "running").length,
      stopped: gameList.filter((g: any) => g.status === "stopped" || g.status === "exited").length,
      error: gameList.filter((g: any) => g.status === "error").length,
    };

    return NextResponse.json({
      stats,
      games: gameList,
      fetchedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Cannot reach games API", detail: e.message }, { status: 502 });
  }
}
