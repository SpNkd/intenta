"use client";

import { api } from "@intenta/api-client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { content } from "../../lib/content";

type Draft = {
  id: string;
  status: string;
  technique: { title: string; instruction: string };
};

export function TechniqueScreen() {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [csrf, setCsrf] = useState("");
  const [error, setError] = useState("");
  const [activating, setActivating] = useState(false);
  useEffect(() => {
    void Promise.all([
      api.GET("/api/v1/intentions/current"),
      api.GET("/api/v1/auth/csrf"),
    ]).then(([current, csrfResponse]) => {
      const data = current.data;
      if (!data) router.replace("/intention");
      else if (data.status === "active") router.replace("/home");
      else setDraft(data);
      if (csrfResponse.data) setCsrf(csrfResponse.data.csrf_token);
    });
  }, [router]);
  async function activate() {
    if (!draft) return;
    setActivating(true);
    setError("");
    const { data } = await api.POST(
      "/api/v1/intentions/{intention_id}/activation",
      {
        params: { path: { intention_id: draft.id } },
        headers: { "X-CSRF-Token": csrf },
      },
    );
    if (!data) {
      setError(content.activation.activation_error);
      setActivating(false);
      return;
    }
    const me = await api.GET("/api/v1/me");
    router.push(me.data?.credential_exists ? "/home" : "/recovery");
  }
  if (!draft)
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
        {draft.technique.title}
      </h1>
      <p className="mt-8 text-xl leading-8 text-[var(--muted)]">
        {draft.technique.instruction}
      </p>
      <div className="mt-12">
        {error ? (
          <p role="alert" className="mb-3 text-sm text-[var(--error)]">
            {error}
          </p>
        ) : null}
        <button
          disabled={activating || !csrf}
          onClick={() => void activate()}
          className="min-h-14 w-full rounded-full bg-[var(--foreground)] text-white disabled:opacity-60"
        >
          {activating ? content.loading : content.activation.activate_action}
        </button>
      </div>
    </main>
  );
}
