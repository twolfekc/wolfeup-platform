import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set("wolfeup_jwt", "", {
    domain: ".wolfeup.com",
    path: "/",
    maxAge: 0,
  });
  return response;
}
