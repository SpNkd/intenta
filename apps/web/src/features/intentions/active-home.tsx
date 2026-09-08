"use client";

import { api } from "@intenta/api-client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { content } from "../../lib/content";

type Active = {
  id: string;
  status: string;
  amount_minor: number;
  currency: string;
  intention_text_raw: string;
  observation_day: number | null;
  reflection_due: boolean;
};
const amountLabel = (amountMinor: number, currency: string) =>
  `${new Intl.NumberFormat("ru-RU").format(amountMinor / 100)} ${currency === "RUB" ? "₽" : currency}`;

export function ActiveHome() {
  const router = useRouter();
  const [intention, setIntention] = useState<Active | null>(null);
  const [csrf, setCsrf] = useState("");
  const [deferring, setDeferring] = useState(false);
  const [deferralError, setDeferralError] = useState("");
  useEffect(() => {
    void Promise.all([
      api.GET("/api/v1/intentions/current"),
      api.GET("/api/v1/auth/csrf"),
    ]).then(([current, csrfResponse]) => {
      const data = current.data;
      if (!data) router.replace("/intention");
      else if (data.status !== "active") router.replace("/intention/paper");
      else setIntention(data);
      if (csrfResponse.data) setCsrf(csrfResponse.data.csrf_token);
    });
  }, [router]);
  async function defer() {
    if (!intention) return;
    setDeferring(true);
    setDeferralError("");
    const { data } = await api.POST(
      "/api/v1/intentions/{intention_id}/reflection-deferral",
      {
        params: { path: { intention_id: intention.id } },
        headers: { "X-CSRF-Token": csrf },
      },
    );
    if (!data) {
      setDeferralError(content.reflections.deferral_error);
      setDeferring(false);
      return;
    }
    setIntention(data);
    setDeferring(false);
  }
  if (!intention)
    return (
      <main className="grid min-h-dvh place-items-center text-sm text-[var(--muted)]">
        {content.loading}
      </main>
    );
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-8 sm:px-7">
      <p className="text-xs font-semibold tracking-[0.28em] text-[var(--muted)]">
        {content.appName}
      </p>
      <section className="flex flex-1 flex-col justify-center">
        <p className="text-sm text-[var(--muted)]">
          {content.activation.observing_status} ·{" "}
          {content.activation.day_label.replace(
            "{day}",
            String(intention.observation_day ?? 1),
          )}
        </p>
        <h1 className="mt-5 text-[clamp(4.5rem,23vw,7rem)] leading-none font-medium tracking-[-0.07em]">
          {amountLabel(intention.amount_minor, intention.currency)}
        </h1>
        <p className="mt-8 text-xl leading-8">{intention.intention_text_raw}</p>
      </section>
      <h2 className="text-2xl font-medium tracking-[-0.03em]">
        {content.activation.created_title}
      </h2>
      <p className="mt-3 mb-5 text-base leading-7 text-[var(--muted)]">
        {content.activation.created_description}
      </p>
      {intention.reflection_due ? (
        <section className="mb-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-xl font-medium tracking-[-0.03em]">
            {content.reflections.title}
          </h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            {content.reflections.description}
          </p>
          <div className="mt-5 grid grid-cols-3 gap-2">
            <button
              onClick={() =>
                router.push(`/outcome/${intention.id}?mode=happened`)
              }
              className="min-h-12 rounded-full bg-[var(--foreground)] px-2 text-sm text-white"
            >
              {content.reflections.happened_action}
            </button>
            <button
              onClick={() =>
                router.push(
                  `/outcome/${intention.id}?mode=close&resolution=not_happened`,
                )
              }
              className="min-h-12 rounded-full border border-[var(--border)] px-2 text-sm"
            >
              {content.reflections.not_happened_action}
            </button>
            <button
              onClick={() =>
                router.push(
                  `/outcome/${intention.id}?mode=close&resolution=uncertain`,
                )
              }
              className="min-h-12 rounded-full border border-[var(--border)] px-2 text-sm"
            >
              {content.reflections.uncertain_action}
            </button>
          </div>
          {deferralError ? (
            <p role="alert" className="mt-3 text-sm text-[var(--error)]">
              {deferralError}
            </p>
          ) : null}
          <button
            disabled={!csrf || deferring}
            onClick={() => void defer()}
            className="mt-3 min-h-12 text-sm text-[var(--muted)] disabled:opacity-60"
          >
            {deferring ? content.loading : content.reflections.continue_action}
          </button>
        </section>
      ) : null}
      <button
        onClick={() => router.push(`/outcome/${intention.id}?mode=happened`)}
        className="min-h-14 rounded-full bg-[var(--foreground)] text-white"
      >
        {content.activation.happened_action}
      </button>
      <button
        onClick={() => router.push(`/outcome/${intention.id}?mode=close`)}
        className="mt-3 min-h-12 text-sm text-[var(--muted)]"
      >
        {content.activation.finish_action}
      </button>
      <button
        onClick={() => router.push("/recovery")}
        className="mt-3 min-h-12 text-sm text-[var(--muted)]"
      >
        {content.activation.manage_recovery_action}
      </button>
    </main>
  );
}
