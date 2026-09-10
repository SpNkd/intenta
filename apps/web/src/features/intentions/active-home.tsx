"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { api } from "@intenta/api-client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MainNavigation } from "../../components/main-navigation";
import { content } from "../../lib/content";
import { isUnauthorized } from "../../lib/private-request";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function load() {
    setLoading(true);
    setError("");
    try {
      const [current, csrfResponse] = await Promise.all([
        api.GET("/api/v1/intentions/current"),
        api.GET("/api/v1/auth/csrf"),
      ]);
      if (isUnauthorized(current) || isUnauthorized(csrfResponse))
        return router.replace("/");
      const data = current.data;
      if (!data) return router.replace("/intention");
      if (data.status !== "active") return router.replace("/intention/paper");
      setIntention(data);
      if (csrfResponse.data) setCsrf(csrfResponse.data.csrf_token);
    } catch {
      setError(content.requestError);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    // The initial private-state lookup runs once; retries are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
  if (loading) return <main className="screen-state">{content.loading}</main>;
  if (error)
    return (
      <main className="screen-state text-center">
        <div>
          <p role="alert" className="text-sm text-[var(--error)]">
            {error}
          </p>
          <button onClick={() => void load()} className="quiet-action mt-4">
            {content.retryAction}
          </button>
        </div>
      </main>
    );
  if (!intention) return null;
  return (
    <main className="app-shell flex flex-col">
      <p className="app-eyebrow">{content.appName}</p>
      <section className="flex flex-1 flex-col justify-center py-10">
        <p className="inline-flex w-fit rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--muted)]">
          {content.activation.observing_status} ·{" "}
          {content.activation.day_label.replace(
            "{day}",
            String(intention.observation_day ?? 1),
          )}
        </p>
        <h1 className="mt-5 text-[clamp(4.5rem,23vw,7rem)] leading-none font-medium tracking-[-0.07em]">
          {amountLabel(intention.amount_minor, intention.currency)}
        </h1>
        <p className="mt-8 border-l-2 border-[var(--foreground)] pl-5 text-xl leading-8">
          {intention.intention_text_raw}
        </p>
      </section>
      <h2 className="text-xl font-medium tracking-[-0.03em]">
        {content.activation.created_title}
      </h2>
      <p className="mt-3 mb-6 text-base leading-7 text-[var(--muted)]">
        {content.activation.created_description}
      </p>
      {intention.reflection_due ? (
        <section className="surface-card mb-6 p-5">
          <h2 className="text-xl font-medium tracking-[-0.03em]">
            {content.reflections.title}
          </h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            {content.reflections.description}
          </p>
          <div className="mt-5 space-y-2">
            <button
              onClick={() =>
                router.push(`/outcome/${intention.id}?mode=happened`)
              }
              className="primary-action min-h-12 text-sm"
            >
              {content.reflections.happened_action}
            </button>
            <button
              onClick={() =>
                router.push(
                  `/outcome/${intention.id}?mode=close&resolution=not_happened`,
                )
              }
              className="secondary-action min-h-12 text-sm"
            >
              {content.reflections.not_happened_action}
            </button>
            <button
              onClick={() =>
                router.push(
                  `/outcome/${intention.id}?mode=close&resolution=uncertain`,
                )
              }
              className="secondary-action min-h-12 text-sm"
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
            className="quiet-action mt-3"
          >
            {deferring ? content.loading : content.reflections.continue_action}
          </button>
        </section>
      ) : null}
      <button
        onClick={() => router.push(`/outcome/${intention.id}?mode=happened`)}
        className="primary-action"
      >
        {content.activation.happened_action}
      </button>
      <button
        onClick={() => router.push(`/outcome/${intention.id}?mode=close`)}
        className="secondary-action mt-3"
      >
        {content.activation.finish_action}
      </button>
      <button
        onClick={() => router.push("/recovery")}
        className="quiet-action mt-2"
      >
        {content.activation.manage_recovery_action}
      </button>
      <button
        onClick={() => router.push("/about?returnTo=/home")}
        className="quiet-action"
      >
        {content.learnAction}
      </button>
      <MainNavigation />
    </main>
  );
}
