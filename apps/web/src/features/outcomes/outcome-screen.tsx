"use client";

import { api, type components } from "@intenta/api-client";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { content } from "../../lib/content";

type Intention = {
  id: string;
  status: string;
  amount_minor: number;
  currency: string;
  intention_text_raw: string;
};

type SavedOutcome = {
  resolution: string;
  outcome_type: string;
  source_type: string | null;
  amount_received_minor: number | null;
  was_expected: string;
  followed_original_intention: string;
  user_note: string | null;
  created_at: string;
};

type OutcomeInput = components["schemas"]["OutcomeInput"];

const money = (value: number) =>
  new Intl.NumberFormat("ru-RU").format(value / 100);

const eventTypeLabels: Record<string, string> = {
  money: content.outcomes.event_type_money,
  other_amount: content.outcomes.event_type_other_amount,
  opportunity: content.outcomes.event_type_opportunity,
  similar: content.outcomes.event_type_similar,
  other: content.outcomes.event_type_other,
};
const expectedLabels: Record<string, string> = {
  yes: content.outcomes.expected_yes,
  no: content.outcomes.expected_no,
  unsure: content.outcomes.expected_unsure,
};
const spendingLabels: Record<string, string> = {
  yes: content.outcomes.spending_yes,
  not_yet: content.outcomes.spending_not_yet,
  chose_other: content.outcomes.spending_chose_other,
  did_not_spend: content.outcomes.spending_did_not_spend,
};

export function OutcomeScreen() {
  const router = useRouter();
  const params = useParams<{ intentionId: string }>();
  const searchParams = useSearchParams();
  const intentionId = params.intentionId;
  const [intention, setIntention] = useState<Intention | null>(null);
  const [outcome, setOutcome] = useState<SavedOutcome | null>(null);
  const [csrf, setCsrf] = useState("");
  const requestedResolution = searchParams.get("resolution");
  const initialCloseResolution =
    requestedResolution === "uncertain" ? "uncertain" : "not_happened";
  const [resolution, setResolution] = useState<
    "happened" | "not_happened" | "uncertain"
  >(searchParams.get("mode") === "close" ? initialCloseResolution : "happened");
  const [closeChosen, setCloseChosen] = useState(
    searchParams.get("mode") !== "close" ||
      requestedResolution === "not_happened" ||
      requestedResolution === "uncertain",
  );
  const [eventType, setEventType] =
    useState<OutcomeInput["outcome_type"]>("money");
  const [sourceType, setSourceType] = useState<
    Exclude<OutcomeInput["source_type"], null | undefined> | ""
  >("");
  const [amount, setAmount] = useState("");
  const [wasExpected, setWasExpected] =
    useState<OutcomeInput["was_expected"]>("no");
  const [spending, setSpending] =
    useState<OutcomeInput["followed_original_intention"]>("not_yet");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void Promise.all([
      api.GET("/api/v1/intentions/{intention_id}", {
        params: { path: { intention_id: intentionId } },
      }),
      api.GET("/api/v1/auth/csrf"),
    ]).then(async ([intentionResponse, csrfResponse]) => {
      if (!intentionResponse.data) {
        router.replace("/");
        return;
      }
      setIntention(intentionResponse.data);
      if (csrfResponse.data) setCsrf(csrfResponse.data.csrf_token);
      if (intentionResponse.data.status === "completed") {
        const saved = await api.GET(
          "/api/v1/intentions/{intention_id}/outcome",
          {
            params: { path: { intention_id: intentionId } },
          },
        );
        if (saved.data) setOutcome(saved.data);
      }
    });
  }, [intentionId, router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const body: OutcomeInput =
      resolution === "happened"
        ? {
            resolution,
            outcome_type: eventType,
            source_type: sourceType || null,
            amount_received_minor: amount
              ? Math.round(Number(amount) * 100)
              : null,
            was_expected: wasExpected,
            followed_original_intention: spending,
            user_note: note || null,
            occurred_at: null,
          }
        : {
            resolution,
            outcome_type: "none",
            source_type: null,
            amount_received_minor: null,
            was_expected: "not_applicable",
            followed_original_intention: "not_applicable",
            user_note: note || null,
            occurred_at: null,
          };
    const { data } = await api.POST(
      "/api/v1/intentions/{intention_id}/outcome",
      {
        params: { path: { intention_id: intentionId } },
        body,
        headers: { "X-CSRF-Token": csrf },
      },
    );
    if (!data) {
      setError(content.outcomes.save_error);
      setBusy(false);
      return;
    }
    setOutcome(data);
  }

  if (!intention) {
    return (
      <main className="grid min-h-dvh place-items-center text-sm text-[var(--muted)]">
        {content.loading}
      </main>
    );
  }
  if (outcome) {
    const summary =
      outcome.resolution === "happened"
        ? content.outcomes.summary_happened
        : outcome.resolution === "uncertain"
          ? content.outcomes.summary_uncertain
          : content.outcomes.summary_not_happened;
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10 sm:px-7">
        <p className="text-xs font-semibold tracking-[0.28em] text-[var(--muted)]">
          {content.appName}
        </p>
        <h1 className="mt-10 text-4xl font-medium tracking-[-0.05em]">
          {content.outcomes.summary_title}
        </h1>
        <p className="mt-6 text-lg leading-7 text-[var(--muted)]">
          {content.outcomes.summary_description}
        </p>
        <p className="mt-8 text-base leading-7">{summary}</p>
        <section className="mt-10 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <p className="text-sm text-[var(--muted)]">
            {intention.intention_text_raw}
          </p>
          {outcome.resolution === "happened" ? (
            <div className="mt-4 space-y-2 text-sm">
              <p>
                <span className="text-[var(--muted)]">
                  {content.outcomes.summary_result_label}:
                </span>
                {eventTypeLabels[outcome.outcome_type]}
              </p>
              <p>
                <span className="text-[var(--muted)]">
                  {content.outcomes.summary_expected_label}:
                </span>
                {expectedLabels[outcome.was_expected]}
              </p>
              <p>
                <span className="text-[var(--muted)]">
                  {content.outcomes.summary_spending_label}:
                </span>
                {spendingLabels[outcome.followed_original_intention]}
              </p>
            </div>
          ) : null}
          {outcome.amount_received_minor !== null ? (
            <p className="mt-3 text-2xl">
              {money(outcome.amount_received_minor)} ₽
            </p>
          ) : null}
          {outcome.user_note ? (
            <p className="mt-4 whitespace-pre-wrap">{outcome.user_note}</p>
          ) : null}
          <p className="mt-4 text-sm text-[var(--muted)]">
            {content.outcomes.summary_date_label}:{" "}
            {new Intl.DateTimeFormat("ru-RU", { dateStyle: "long" }).format(
              new Date(outcome.created_at),
            )}
          </p>
        </section>
        <button
          onClick={() => router.push("/intention")}
          className="mt-10 min-h-14 rounded-full bg-[var(--foreground)] text-white"
        >
          {content.outcomes.continue_experiment_action}
        </button>
        <button
          disabled
          className="mt-3 min-h-12 text-sm text-[var(--muted)] disabled:opacity-60"
        >
          {content.outcomes.view_history_action}
        </button>
      </main>
    );
  }
  if (resolution !== "happened" && !closeChosen) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10 sm:px-7">
        <h1 className="text-4xl font-medium tracking-[-0.05em]">
          {content.outcomes.close_title}
        </h1>
        <p className="mt-6 text-lg leading-7 text-[var(--muted)]">
          {content.outcomes.close_description}
        </p>
        <button
          onClick={() => {
            setResolution("not_happened");
            setCloseChosen(true);
          }}
          className="mt-10 min-h-14 rounded-full bg-[var(--foreground)] text-white"
        >
          {content.outcomes.not_happened_action}
        </button>
        <button
          onClick={() => {
            setResolution("uncertain");
            setCloseChosen(true);
          }}
          className="mt-3 min-h-12 text-sm text-[var(--muted)]"
        >
          {content.outcomes.uncertain_action}
        </button>
      </main>
    );
  }
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-10 sm:px-7">
      <h1 className="text-4xl font-medium tracking-[-0.05em]">
        {resolution === "happened"
          ? content.outcomes.happened_title
          : content.outcomes.close_title}
      </h1>
      <p className="mt-5 text-lg leading-7 text-[var(--muted)]">
        {resolution === "happened"
          ? content.outcomes.happened_description
          : content.outcomes.close_confirm_description}
      </p>
      <form onSubmit={(event) => void submit(event)} className="mt-8 space-y-6">
        {resolution === "happened" ? (
          <>
            <label className="block text-sm text-[var(--muted)]">
              {content.outcomes.event_type_label}
              <select
                value={eventType}
                onChange={(event) =>
                  setEventType(
                    event.target.value as OutcomeInput["outcome_type"],
                  )
                }
                className="mt-2 min-h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-[var(--foreground)]"
              >
                <option value="money">
                  {content.outcomes.event_type_money}
                </option>
                <option value="other_amount">
                  {content.outcomes.event_type_other_amount}
                </option>
                <option value="opportunity">
                  {content.outcomes.event_type_opportunity}
                </option>
                <option value="similar">
                  {content.outcomes.event_type_similar}
                </option>
                <option value="other">
                  {content.outcomes.event_type_other}
                </option>
              </select>
            </label>
            <label className="block text-sm text-[var(--muted)]">
              {content.outcomes.amount_label}
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="mt-2 min-h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-[var(--foreground)]"
              />
            </label>
            <label className="block text-sm text-[var(--muted)]">
              {content.outcomes.source_label}
              <select
                value={sourceType}
                onChange={(event) =>
                  setSourceType(
                    event.target.value as Exclude<
                      OutcomeInput["source_type"],
                      null | undefined
                    >,
                  )
                }
                className="mt-2 min-h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-[var(--foreground)]"
              >
                <option value="">{content.outcomes.source_none}</option>
                <option value="gift">{content.outcomes.source_gift}</option>
                <option value="refund">{content.outcomes.source_refund}</option>
                <option value="bonus_or_cashback">
                  {content.outcomes.source_bonus_or_cashback}
                </option>
                <option value="extra_income">
                  {content.outcomes.source_extra_income}
                </option>
                <option value="found_money">
                  {content.outcomes.source_found_money}
                </option>
                <option value="saving_or_discount">
                  {content.outcomes.source_saving_or_discount}
                </option>
                <option value="other">{content.outcomes.source_other}</option>
              </select>
            </label>
            <fieldset>
              <legend className="text-sm text-[var(--muted)]">
                {content.outcomes.expected_label}
              </legend>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  ["yes", content.outcomes.expected_yes],
                  ["no", content.outcomes.expected_no],
                  ["unsure", content.outcomes.expected_unsure],
                ].map(([value, label]) => (
                  <label
                    key={value}
                    className="rounded-xl border border-[var(--border)] p-3 text-center text-sm"
                  >
                    <input
                      type="radio"
                      name="expected"
                      value={value}
                      checked={wasExpected === value}
                      onChange={() =>
                        setWasExpected(value as OutcomeInput["was_expected"])
                      }
                      className="sr-only"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="block text-sm text-[var(--muted)]">
              {content.outcomes.spending_label}
              <select
                value={spending}
                onChange={(event) =>
                  setSpending(
                    event.target
                      .value as OutcomeInput["followed_original_intention"],
                  )
                }
                className="mt-2 min-h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-[var(--foreground)]"
              >
                <option value="yes">{content.outcomes.spending_yes}</option>
                <option value="not_yet">
                  {content.outcomes.spending_not_yet}
                </option>
                <option value="chose_other">
                  {content.outcomes.spending_chose_other}
                </option>
                <option value="did_not_spend">
                  {content.outcomes.spending_did_not_spend}
                </option>
              </select>
            </label>
          </>
        ) : null}
        <label className="block text-sm text-[var(--muted)]">
          {content.outcomes.note_label}
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="mt-2 min-h-28 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-[var(--foreground)]"
          />
        </label>
        {error ? (
          <p role="alert" className="text-sm text-[var(--error)]">
            {error}
          </p>
        ) : null}
        <button
          disabled={!csrf || busy}
          className="min-h-14 w-full rounded-full bg-[var(--foreground)] text-white disabled:opacity-60"
        >
          {busy ? content.loading : content.outcomes.save_action}
        </button>
      </form>
    </main>
  );
}
