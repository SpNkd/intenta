"use client";

import { api } from "@intenta/api-client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { content } from "../../lib/content";

type Draft = { intention_statement: string };

export function PaperWriting() {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  useEffect(() => {
    void api.GET("/api/v1/intentions/current").then(({ data }) => {
      if (!data) router.replace("/intention");
      else setDraft(data);
    });
  }, [router]);
  if (!draft)
    return (
      <main className="grid min-h-dvh place-items-center text-sm text-[var(--muted)]">
        {content.loading}
      </main>
    );
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-8 sm:px-7">
      <h1 className="text-[clamp(2.6rem,13vw,4rem)] leading-none font-medium tracking-[-0.05em]">
        {content.intentions.paper_title}
      </h1>
      <p className="mt-6 text-base leading-7 text-[var(--muted)]">
        {content.intentions.paper_instruction}
      </p>
      <blockquote className="my-10 whitespace-pre-line border-l-2 border-[var(--foreground)] pl-5 text-xl leading-8">
        {draft.intention_statement}
      </blockquote>
      <div className="mt-auto space-y-3">
        <button
          onClick={() => router.push("/intention/technique")}
          className="min-h-14 w-full rounded-full bg-[var(--foreground)] text-white"
        >
          {content.intentions.paper_written_action}
        </button>
        <button
          onClick={() => router.push("/intention")}
          className="min-h-12 w-full text-sm text-[var(--muted)]"
        >
          {content.intentions.edit_action}
        </button>
      </div>
    </main>
  );
}
