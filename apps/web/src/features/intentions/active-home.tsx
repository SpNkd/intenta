"use client";

import { api } from "@intenta/api-client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { content } from "../../lib/content";

type Active = {
  status: string;
  amount_minor: number;
  currency: string;
  intention_text_raw: string;
  observation_day: number | null;
};
const amountLabel = (amountMinor: number, currency: string) =>
  `${new Intl.NumberFormat("ru-RU").format(amountMinor / 100)} ${currency === "RUB" ? "₽" : currency}`;

export function ActiveHome() {
  const router = useRouter();
  const [intention, setIntention] = useState<Active | null>(null);
  useEffect(() => {
    void api.GET("/api/v1/intentions/current").then(({ data }) => {
      if (!data) router.replace("/intention");
      else if (data.status !== "active") router.replace("/intention/paper");
      else setIntention(data);
    });
  }, [router]);
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
      <button
        disabled
        title={content.activation.outcome_unavailable}
        className="min-h-14 rounded-full bg-[var(--foreground)] text-white opacity-55"
      >
        {content.activation.happened_action}
      </button>
      <button
        disabled
        title={content.activation.outcome_unavailable}
        className="mt-3 min-h-12 text-sm text-[var(--muted)]"
      >
        {content.activation.finish_action}
      </button>
    </main>
  );
}
