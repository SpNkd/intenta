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
  if (!draft) return <main className="screen-state">{content.loading}</main>;
  return (
    <main className="app-shell flex flex-col">
      <p className="app-eyebrow">{content.appName} · 2 / 3</p>
      <h1 className="app-title mt-9">{content.intentions.paper_title}</h1>
      <p className="app-lead mt-6">{content.intentions.paper_instruction}</p>
      <blockquote className="surface-card my-10 whitespace-pre-line border-l-2 border-l-[var(--foreground)] p-5 text-xl leading-8">
        {draft.intention_statement}
      </blockquote>
      <div className="mt-auto space-y-3">
        <button
          onClick={() => router.push("/intention/technique")}
          className="primary-action"
        >
          {content.intentions.paper_written_action}
        </button>
        <button
          onClick={() => router.push("/intention")}
          className="quiet-action"
        >
          {content.intentions.edit_action}
        </button>
      </div>
    </main>
  );
}
