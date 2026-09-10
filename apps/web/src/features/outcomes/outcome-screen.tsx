"use client";
/* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

import { api, type components } from "@intenta/api-client";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { content } from "../../lib/content";
import { isUnauthorized } from "../../lib/private-request";

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

export const MAX_OUTCOME_AMOUNT_MINOR = 10_000_000_000;

export function parseOutcomeAmountToMinor(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;

  const [whole, fraction = ""] = normalized.split(".");
  const minorText =
    `${whole.replace(/^0+/, "") || "0"}${fraction.padEnd(2, "0")}`.replace(
      /^0+/,
      "",
    ) || "0";
  const maximumText = String(MAX_OUTCOME_AMOUNT_MINOR);
  if (
    minorText.length > maximumText.length ||
    (minorText.length === maximumText.length && minorText > maximumText)
  ) {
    return null;
  }

  return Number(minorText);
}

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
  const [wasExpected, setWasExpected] = useState<
    Exclude<OutcomeInput["was_expected"], "not_applicable"> | ""
  >("");
  const [spending, setSpending] = useState<
    Exclude<OutcomeInput["followed_original_intention"], "not_applicable"> | ""
  >("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  async function load() {
    setLoading(true);
    setLoadError("");
    try {
      const [intentionResponse, csrfResponse] = await Promise.all([
        api.GET("/api/v1/intentions/{intention_id}", {
          params: { path: { intention_id: intentionId } },
        }),
        api.GET("/api/v1/auth/csrf"),
      ]);
      if (!intentionResponse.data) {
        if (isUnauthorized(intentionResponse)) router.replace("/");
        else setLoadError(content.requestError);
        return;
      }
      setIntention(intentionResponse.data);
      if (csrfResponse.data) setCsrf(csrfResponse.data.csrf_token);
      if (intentionResponse.data.status === "completed") {
        const saved = await api.GET(
          "/api/v1/intentions/{intention_id}/outcome",
          { params: { path: { intention_id: intentionId } } },
        );
        if (saved.data) setOutcome(saved.data);
        else if (!isUnauthorized(saved)) setLoadError(content.requestError);
      }
    } catch {
      setLoadError(content.requestError);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // Route id is immutable during this screen lifetime; retry is explicit.
  }, [intentionId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    let amountReceivedMinor: number | null = null;
    if (resolution === "happened") {
      if (!wasExpected || !spending) {
        setError(content.outcomes.required_answers_error);
        return;
      }
      if (amount) {
        amountReceivedMinor = parseOutcomeAmountToMinor(amount);
        if (amountReceivedMinor === null) {
          setError(content.outcomes.amount_validation_error);
          return;
        }
      }
    }
    setBusy(true);
    const body: OutcomeInput =
      resolution === "happened"
        ? {
            resolution,
            outcome_type: eventType,
            source_type: sourceType || null,
            amount_received_minor: amountReceivedMinor,
            was_expected: wasExpected as Exclude<
              OutcomeInput["was_expected"],
              "not_applicable"
            >,
            followed_original_intention: spending as Exclude<
              OutcomeInput["followed_original_intention"],
              "not_applicable"
            >,
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

  if (loading) {
    return <main className="screen-state">{content.loading}</main>;
  }
  if (loadError || !intention) {
    return (
      <main className="screen-state text-center">
        <div>
          <p role="alert" className="text-sm text-[var(--error)]">
            {loadError || content.requestError}
          </p>
          <button className="quiet-action mt-4" onClick={() => void load()}>
            {content.retryAction}
          </button>
        </div>
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
      <main className="app-shell flex flex-col justify-center">
        <p className="app-eyebrow">{content.appName}</p>
        <h1 className="app-title mt-10">{content.outcomes.summary_title}</h1>
        <p className="app-lead mt-6">{content.outcomes.summary_description}</p>
        <p className="mt-8 text-base leading-7">{summary}</p>
        <section className="surface-card mt-10 p-5">
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
          className="primary-action mt-10"
        >
          {content.outcomes.continue_experiment_action}
        </button>
        <button
          onClick={() => router.push("/history")}
          className="quiet-action mt-3"
        >
          {content.outcomes.view_history_action}
        </button>
      </main>
    );
  }
  if (resolution !== "happened" && !closeChosen) {
    return (
      <main className="app-shell flex flex-col justify-center">
        <p className="app-eyebrow">{content.appName}</p>
        <h1 className="app-title mt-10">{content.outcomes.close_title}</h1>
        <p className="app-lead mt-6">{content.outcomes.close_description}</p>
        <button
          onClick={() => {
            setResolution("not_happened");
            setCloseChosen(true);
          }}
          className="primary-action mt-10"
        >
          {content.outcomes.not_happened_action}
        </button>
        <button
          onClick={() => {
            setResolution("uncertain");
            setCloseChosen(true);
          }}
          className="secondary-action mt-3"
        >
          {content.outcomes.uncertain_action}
        </button>
      </main>
    );
  }
  return (
    <main className="app-shell flex flex-col">
      <p className="app-eyebrow">{content.appName}</p>
      <h1 className="app-title mt-8">
        {resolution === "happened"
          ? content.outcomes.happened_title
          : content.outcomes.close_title}
      </h1>
      <p className="app-lead mt-5">
        {resolution === "happened"
          ? content.outcomes.happened_description
          : content.outcomes.close_confirm_description}
      </p>
      <form
        onSubmit={(event) => void submit(event)}
        className="mt-8 space-y-7 pb-4"
      >
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
                className="field-control mt-2"
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
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="field-control mt-2"
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
                className="field-control mt-2"
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
                    className={`min-h-12 rounded-xl border p-3 text-center text-sm transition-colors ${
                      wasExpected === value
                        ? "border-[var(--foreground)] bg-[var(--surface)] text-[var(--foreground)]"
                        : "border-[var(--border)]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="expected"
                      value={value}
                      checked={wasExpected === value}
                      onChange={() =>
                        setWasExpected(
                          value as Exclude<
                            OutcomeInput["was_expected"],
                            "not_applicable"
                          >,
                        )
                      }
                      className="mr-2 size-4 accent-[var(--foreground)]"
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
                    event.target.value as Exclude<
                      OutcomeInput["followed_original_intention"],
                      "not_applicable"
                    >,
                  )
                }
                className="field-control mt-2"
              >
                <option value="" disabled>
                  {content.outcomes.spending_placeholder}
                </option>
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
            className="field-control mt-2 min-h-28 resize-y"
          />
        </label>
        {error ? (
          <p role="alert" className="text-sm text-[var(--error)]">
            {error}
          </p>
        ) : null}
        <button
          disabled={
            !csrf ||
            busy ||
            (resolution === "happened" && (!wasExpected || !spending))
          }
          className="primary-action mt-2"
        >
          {busy ? content.loading : content.outcomes.save_action}
        </button>
      </form>
    </main>
  );
}
