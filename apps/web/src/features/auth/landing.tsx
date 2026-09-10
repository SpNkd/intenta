"use client";

import { api } from "@intenta/api-client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { content } from "../../lib/content";
import { routeForFlowState } from "../../lib/flow";

export function Landing() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void api.GET("/api/v1/me").then(({ data }) => {
      if (!active || !data) return;
      router.replace(routeForFlowState(data.flow_state));
    });
    return () => {
      active = false;
    };
  }, [router]);

  async function start() {
    setIsSubmitting(true);
    setError(null);
    const { data, error: requestError } = await api.POST(
      "/api/v1/auth/anonymous",
    );
    if (requestError || !data) {
      setError(content.requestError);
      setIsSubmitting(false);
      return;
    }
    router.push(
      data.user.onboarding_completed
        ? routeForFlowState(data.user.flow_state)
        : "/onboarding",
    );
  }

  return (
    <main className="app-shell flex flex-col">
      <p className="app-eyebrow">{content.appName}</p>
      <section className="flex flex-1 flex-col justify-center py-16">
        <h1 className="max-w-sm text-[clamp(3.5rem,18vw,5rem)] leading-[0.92] font-medium tracking-[-0.065em]">
          {content.appName}
        </h1>
        <p className="app-lead mt-7 max-w-xs">{content.tagline}</p>
        <p className="mt-5 max-w-sm text-sm leading-6 text-[var(--muted)]">
          {content.landingDescription}
        </p>
      </section>
      <div className="space-y-3">
        {error ? (
          <p role="alert" className="text-center text-sm text-[var(--error)]">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => void start()}
          className="primary-action"
        >
          {isSubmitting ? content.loading : content.tryAction}
        </button>
        <button
          type="button"
          onClick={() => router.push("/recover")}
          className="quiet-action"
        >
          {content.recoverAction}
        </button>
        <button
          type="button"
          onClick={() => router.push("/about?returnTo=/")}
          className="quiet-action"
        >
          {content.learnAction}
        </button>
      </div>
    </main>
  );
}
