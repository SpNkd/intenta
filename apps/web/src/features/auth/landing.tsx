"use client";

import { api } from "@intenta/api-client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { content } from "../../lib/content";

export function Landing() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void api.GET("/api/v1/me").then(({ data }) => {
      if (!active || !data) return;
      router.replace(
        data.flow_state === "onboarding"
          ? "/onboarding"
          : data.flow_state === "paper"
            ? "/intention/paper"
            : "/intention",
      );
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
    router.push(data.user.onboarding_completed ? "/intention" : "/onboarding");
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-7 sm:pt-12">
      <p className="text-xs font-semibold tracking-[0.28em] text-[var(--muted)]">
        {content.appName}
      </p>
      <section className="flex flex-1 flex-col justify-center py-12">
        <h1 className="max-w-sm text-[clamp(2.75rem,14vw,4.5rem)] leading-[0.98] font-medium tracking-[-0.055em]">
          {content.appName}
        </h1>
        <p className="mt-6 max-w-xs text-lg leading-7 text-[var(--muted)]">
          {content.tagline}
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
          className="min-h-14 w-full rounded-full bg-[var(--foreground)] px-6 text-base font-medium text-white transition-opacity disabled:opacity-60"
        >
          {isSubmitting ? content.loading : content.tryAction}
        </button>
        <button
          type="button"
          disabled
          title={content.recoverUnavailable}
          className="min-h-12 w-full rounded-full px-6 text-sm font-medium text-[var(--muted)] opacity-65"
        >
          {content.recoverAction}
        </button>
      </div>
    </main>
  );
}
