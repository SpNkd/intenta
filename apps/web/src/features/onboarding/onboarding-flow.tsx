"use client";

import { api } from "@intenta/api-client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { content } from "../../lib/content";

export function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = content.onboardingSteps[step];
  const isLast = step === content.onboardingSteps.length - 1;

  useEffect(() => {
    let active = true;
    void Promise.all([
      api.GET("/api/v1/me"),
      api.GET("/api/v1/auth/csrf"),
    ]).then(([me, csrf]) => {
      if (!active) return;
      if (!me.data) {
        router.replace("/");
        return;
      }
      if (me.data.onboarding_completed) {
        router.replace(
          me.data.flow_state === "paper" ? "/intention/paper" : "/intention",
        );
        return;
      }
      if (!csrf.data) {
        setError(content.requestError);
      } else {
        setCsrfToken(csrf.data.csrf_token);
      }
      setIsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [router]);

  async function complete() {
    if (!csrfToken) return;
    setIsSubmitting(true);
    setError(null);
    const { data, error: requestError } = await api.POST(
      "/api/v1/me/onboarding-completion",
      { headers: { "X-CSRF-Token": csrfToken } },
    );
    if (requestError || !data) {
      setError(content.requestError);
      setIsSubmitting(false);
      return;
    }
    router.push("/intention");
  }

  if (isLoading) {
    return (
      <main className="grid min-h-dvh place-items-center px-5 text-sm text-[var(--muted)]">
        {content.loading}
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-7 sm:pt-12">
      <div className="flex items-center justify-between text-xs text-[var(--muted)]">
        <span className="font-semibold tracking-[0.28em]">
          {content.appName}
        </span>
        <span
          aria-label={`Шаг ${step + 1} из ${content.onboardingSteps.length}`}
        >
          {step + 1} / {content.onboardingSteps.length}
        </span>
      </div>
      <section className="flex flex-1 items-center py-12">
        <h1 className="text-[clamp(2rem,10vw,3.35rem)] leading-[1.08] font-medium tracking-[-0.045em]">
          {current.title}
        </h1>
      </section>
      <div>
        {error ? (
          <p
            role="alert"
            className="mb-3 text-center text-sm text-[var(--error)]"
          >
            {error}
          </p>
        ) : null}
        <div className="flex gap-3">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep((value) => value - 1)}
              className="min-h-14 flex-1 rounded-full border border-[var(--border)] px-4 font-medium"
            >
              {content.backAction}
            </button>
          ) : null}
          <button
            type="button"
            disabled={isSubmitting || (isLast && !csrfToken)}
            onClick={() =>
              isLast ? void complete() : setStep((value) => value + 1)
            }
            className="min-h-14 flex-1 rounded-full bg-[var(--foreground)] px-4 font-medium text-white disabled:opacity-60"
          >
            {isSubmitting
              ? content.loading
              : isLast
                ? content.startAction
                : content.nextAction}
          </button>
        </div>
      </div>
    </main>
  );
}
