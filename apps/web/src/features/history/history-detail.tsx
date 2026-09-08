"use client";
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import { api, type components } from "@intenta/api-client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { content } from "../../lib/content";
import { isUnauthorized } from "../../lib/private-request";

type IntentionDetail = components["schemas"]["IntentionResponse"];
type Outcome = components["schemas"]["OutcomeResponse"];

const amountLabel = (amountMinor: number, currency: string) =>
  `${new Intl.NumberFormat("ru-RU").format(amountMinor / 100)} ${currency === "RUB" ? "₽" : currency}`;

const eventTypeLabels: Record<Outcome["outcome_type"], string> = {
  money: content.outcomes.event_type_money,
  other_amount: content.outcomes.event_type_other_amount,
  opportunity: content.outcomes.event_type_opportunity,
  similar: content.outcomes.event_type_similar,
  other: content.outcomes.event_type_other,
  none: "",
};

const outcomeLabels: Record<Outcome["resolution"], string> = {
  happened: content.history.outcome_happened,
  not_happened: content.history.outcome_not_happened,
  uncertain: content.history.outcome_uncertain,
};

const sourceLabels: Record<NonNullable<Outcome["source_type"]>, string> = {
  gift: content.outcomes.source_gift,
  refund: content.outcomes.source_refund,
  bonus_or_cashback: content.outcomes.source_bonus_or_cashback,
  extra_income: content.outcomes.source_extra_income,
  found_money: content.outcomes.source_found_money,
  saving_or_discount: content.outcomes.source_saving_or_discount,
  other: content.outcomes.source_other,
};

const expectedLabels: Record<Outcome["was_expected"], string> = {
  yes: content.outcomes.expected_yes,
  no: content.outcomes.expected_no,
  unsure: content.outcomes.expected_unsure,
  not_applicable: "",
};

const spendingLabels: Record<Outcome["followed_original_intention"], string> = {
  yes: content.outcomes.spending_yes,
  not_yet: content.outcomes.spending_not_yet,
  chose_other: content.outcomes.spending_chose_other,
  did_not_spend: content.outcomes.spending_did_not_spend,
  not_applicable: "",
};

export function HistoryDetail() {
  const router = useRouter();
  const { intentionId } = useParams<{ intentionId: string }>();
  const [intention, setIntention] = useState<IntentionDetail | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState("");
  const [outcomeError, setOutcomeError] = useState("");

  async function load() {
    setError("");
    setOutcomeError("");
    try {
      const result = await api.GET("/api/v1/intentions/{intention_id}", {
        params: { path: { intention_id: intentionId } },
      });
      if (!result.data) {
        if (isUnauthorized(result)) router.replace("/");
        else setError(content.history.detail_load_error);
        return;
      }
      setIntention(result.data);
      if (result.data.status === "completed") {
        const saved = await api.GET(
          "/api/v1/intentions/{intention_id}/outcome",
          {
            params: { path: { intention_id: intentionId } },
          },
        );
        if (saved.data) setOutcome(saved.data);
        else if (isUnauthorized(saved)) router.replace("/");
        else setOutcomeError(content.history.outcome_load_error);
      }
    } catch {
      setError(content.history.detail_load_error);
    }
  }
  useEffect(() => {
    void load();
  }, [intentionId]);

  if (error) {
    return (
      <main className="grid min-h-dvh place-items-center px-5 text-center">
        <p role="alert" className="text-sm text-[var(--error)]">
          {error}
        </p>
        <button
          className="mt-4 text-sm text-[var(--muted)]"
          onClick={() => router.push("/history")}
        >
          {content.history.back_action}
        </button>
        <button
          className="mt-2 text-sm text-[var(--muted)]"
          onClick={() => void load()}
        >
          {content.retryAction}
        </button>
      </main>
    );
  }
  if (!intention) {
    return (
      <main className="grid min-h-dvh place-items-center text-sm text-[var(--muted)]">
        {content.loading}
      </main>
    );
  }

  const date = (value: string) =>
    new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(
      new Date(value),
    );
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-8 sm:px-7">
      <Link href="/history" className="min-h-11 text-sm text-[var(--muted)]">
        ← {content.history.back_action}
      </Link>
      <p className="mt-7 text-xs font-semibold tracking-[0.28em] text-[var(--muted)]">
        {content.appName}
      </p>
      <h1 className="mt-5 text-4xl font-medium tracking-[-0.05em]">
        {content.history.detail_title}
      </h1>
      <p className="mt-6 text-[clamp(3.5rem,18vw,5.5rem)] leading-none font-medium tracking-[-0.07em]">
        {amountLabel(intention.amount_minor, intention.currency)}
      </p>

      <section className="mt-10 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="text-sm text-[var(--muted)]">
          {content.history.intention_label}
        </h2>
        <p className="mt-3 text-lg leading-7">{intention.intention_text_raw}</p>
      </section>
      <section className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="text-sm text-[var(--muted)]">
          {content.history.statement_label}
        </h2>
        <p className="mt-3 whitespace-pre-wrap text-base leading-7">
          {intention.intention_statement}
        </p>
      </section>
      <section className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="text-sm text-[var(--muted)]">
          {content.history.technique_label}
        </h2>
        <h3 className="mt-3 text-lg font-medium">
          {intention.technique.title}
        </h3>
        <p className="mt-2 leading-7 text-[var(--muted)]">
          {intention.technique.instruction}
        </p>
      </section>

      <section className="mt-8 text-sm leading-6 text-[var(--muted)]">
        <p>
          {intention.activated_at
            ? content.history.activated_label.replace(
                "{date}",
                date(intention.activated_at),
              )
            : content.history.not_activated_label}
        </p>
        {intention.completed_at ? (
          <p className="mt-1">
            {content.history.completed_label.replace(
              "{date}",
              date(intention.completed_at),
            )}
          </p>
        ) : null}
        {intention.observation_days ? (
          <p className="mt-1">
            {content.history.observation_days_label.replace(
              "{days}",
              String(intention.observation_days),
            )}
          </p>
        ) : null}
      </section>

      <section className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="text-xl font-medium tracking-[-0.03em]">
          {content.history.outcome_title}
        </h2>
        {outcome ? (
          <div className="mt-4 space-y-3 text-base leading-7">
            <p>{outcomeLabels[outcome.resolution]}</p>
            {outcome.resolution === "happened" ? (
              <>
                <p>{eventTypeLabels[outcome.outcome_type]}</p>
                {outcome.source_type ? (
                  <p>
                    {content.outcomes.source_label}:{" "}
                    {sourceLabels[outcome.source_type]}
                  </p>
                ) : null}
                <p>
                  {content.outcomes.expected_label}:{" "}
                  {expectedLabels[outcome.was_expected]}
                </p>
                <p>
                  {content.outcomes.spending_label}:{" "}
                  {spendingLabels[outcome.followed_original_intention]}
                </p>
              </>
            ) : null}
            {outcome.amount_received_minor !== null ? (
              <p className="text-2xl">
                {amountLabel(outcome.amount_received_minor, "RUB")}
              </p>
            ) : null}
            {outcome.user_note ? (
              <p className="whitespace-pre-wrap">{outcome.user_note}</p>
            ) : null}
            {outcome.occurred_at ? (
              <p>
                {content.history.occurred_label}: {date(outcome.occurred_at)}
              </p>
            ) : null}
            <p className="text-sm text-[var(--muted)]">
              {content.outcomes.summary_date_label}: {date(outcome.created_at)}
            </p>
          </div>
        ) : outcomeError ? (
          <div className="mt-3">
            <p role="alert" className="text-sm text-[var(--error)]">
              {outcomeError}
            </p>
            <button
              onClick={() => void load()}
              className="mt-3 min-h-11 text-sm text-[var(--muted)]"
            >
              {content.retryAction}
            </button>
          </div>
        ) : (
          <p className="mt-3 leading-7 text-[var(--muted)]">
            {content.history.outcome_pending}
          </p>
        )}
      </section>
    </main>
  );
}
