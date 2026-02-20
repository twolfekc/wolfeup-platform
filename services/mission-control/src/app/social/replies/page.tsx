"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RepliesRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/social?tab=replies");
  }, [router]);
  return null;
}
