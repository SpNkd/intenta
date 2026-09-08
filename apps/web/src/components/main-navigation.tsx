"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { content } from "../lib/content";

export function MainNavigation() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Основная навигация"
      className="mt-6 flex rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-1"
    >
      <Link
        href="/home"
        aria-current={pathname === "/home" ? "page" : undefined}
        className="min-h-11 flex-1 rounded-xl px-3 py-3 text-center text-sm aria-[current=page]:bg-[var(--background)]"
      >
        {content.history.nav_intention}
      </Link>
      <Link
        href="/history"
        aria-current={pathname === "/history" ? "page" : undefined}
        className="min-h-11 flex-1 rounded-xl px-3 py-3 text-center text-sm aria-[current=page]:bg-[var(--background)]"
      >
        {content.history.nav_history}
      </Link>
    </nav>
  );
}
