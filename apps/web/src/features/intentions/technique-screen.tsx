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
  if (!draft) return <main className="screen-state">{content.loading}</main>;
  return (
    <main className="app-shell flex flex-col justify-center">
      <p className="app-eyebrow">{content.appName} · 3 / 3</p>
      <p className="mt-8 text-sm text-[var(--muted)]">
        {content.intentions.technique_label}
      </p>
      <h1 className="app-title mt-4">{draft.technique.title}</h1>
      <p className="surface-card mt-8 p-5 text-lg leading-8 text-[var(--muted)]">
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
          className="primary-action"
        >
          {activating ? content.loading : content.activation.activate_action}
        </button>
      </div>
    </main>
  );
}
