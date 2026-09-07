"use client";

import { api } from "@intenta/api-client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { content } from "../../lib/content";

type Technique = { title: string; instruction: string };

export function TechniqueScreen() {
  const router = useRouter();
  const [technique, setTechnique] = useState<Technique | null>(null);
  useEffect(() => {
    void api.GET("/api/v1/intentions/current").then(({ data }) => {
      if (!data) router.replace("/intention");
      else setTechnique(data.technique);
    });
  }, [router]);
  if (!technique)
    return (
      <main className="grid min-h-dvh place-items-center text-sm text-[var(--muted)]">
        {content.loading}
      </main>
    );
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10 sm:px-7">
      <p className="text-xs font-semibold tracking-[0.28em] text-[var(--muted)]">
        {content.intentions.technique_label}
      </p>
      <h1 className="mt-10 text-[clamp(2.8rem,13vw,4rem)] leading-none font-medium tracking-[-0.05em]">
        {technique.title}
      </h1>
      <p className="mt-8 text-xl leading-8 text-[var(--muted)]">
        {technique.instruction}
      </p>
    </main>
  );
}
