"use client";

interface JwtPayload {
  userId: string;
  email: string;
  username: string;
  isAdmin: boolean;
}

export function getJwtPayload(): JwtPayload | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith("wolfeup_jwt="));
  if (!match) return null;
  const token = match.split("=")[1];
  try {
    const payload = token.split(".")[1];
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export async function logout() {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/login";
}
