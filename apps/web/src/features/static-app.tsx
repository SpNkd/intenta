"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { content } from "../lib/content";
import {
  issueRecovery,
  hasRecoveryCredential,
  loadState,
  nextAmount,
  recover,
  saveState,
  type StaticIntention,
  type StaticOutcome,
  type StaticState,
} from "../lib/static-store";

type Screen =
  | "landing"
  | "onboarding"
  | "amount"
  | "write"
  | "paper"
  | "technique"
  | "active"
  | "outcome"
  | "outcome-summary"
  | "history"
  | "detail"
  | "recovery"
  | "code";

const statement = (amount: number, intentionText: string) =>
  content.intentions.statement_template
    .replace("{amount}", `${amount.toLocaleString("ru-RU")} ₽`)
    .replace("{intention_text}", intentionText);

function displayStatement(intention: StaticIntention): string {
  // Drafts made by the first static release contain the old generic sentence.
  // The original intention text remains encrypted in `text`, so render the
  // canonical statement rather than asking a person to enter it again.
  return intention.statement.includes(intention.text)
    ? intention.statement
    : statement(intention.amount, intention.text);
}

const outcomeTypeLabels: Record<StaticOutcome["outcomeType"], string> = {
  money: content.outcomes.event_type_money,
  other_amount: content.outcomes.event_type_other_amount,
  opportunity: content.outcomes.event_type_opportunity,
  similar: content.outcomes.event_type_similar,
  other: content.outcomes.event_type_other,
  none: "",
};

const sourceLabels: Record<NonNullable<StaticOutcome["sourceType"]>, string> = {
  gift: content.outcomes.source_gift,
  refund: content.outcomes.source_refund,
  bonus_or_cashback: content.outcomes.source_bonus_or_cashback,
  extra_income: content.outcomes.source_extra_income,
  found_money: content.outcomes.source_found_money,
  saving_or_discount: content.outcomes.source_saving_or_discount,
  other: content.outcomes.source_other,
};

const expectedLabels: Record<NonNullable<StaticOutcome["wasExpected"]>, string> = {
  yes: content.outcomes.expected_yes,
  no: content.outcomes.expected_no,
  unsure: content.outcomes.expected_unsure,
};

const spendingLabels: Record<NonNullable<StaticOutcome["spending"]>, string> = {
  yes: content.outcomes.spending_yes,
  not_yet: content.outcomes.spending_not_yet,
  chose_other: content.outcomes.spending_chose_other,
  did_not_spend: content.outcomes.spending_did_not_spend,
};

const persistentScreens = new Set<Exclude<Screen, "recovery" | "code">>([
  "landing",
  "onboarding",
  "amount",
  "write",
  "paper",
  "technique",
  "active",
  "outcome",
  "outcome-summary",
  "history",
  "detail",
]);

function isPersistentScreen(
  screen: Screen,
): screen is Exclude<Screen, "recovery" | "code"> {
  return persistentScreens.has(screen as Exclude<Screen, "recovery" | "code">);
}

export function StaticApp() {
  const [state, setState] = useState<StaticState | null>(null);
  const [screen, setScreen] = useState<Screen>("landing");
  const [text, setText] = useState("");
  const [outcomeResolution, setOutcomeResolution] = useState<
    StaticOutcome["resolution"]
  >("happened");
  const [outcomeType, setOutcomeType] = useState<StaticOutcome["outcomeType"]>(
    "money",
  );
  const [sourceType, setSourceType] = useState<StaticOutcome["sourceType"]>();
  const [receivedAmount, setReceivedAmount] = useState("");
  const [wasExpected, setWasExpected] = useState<StaticOutcome["wasExpected"]>();
  const [spending, setSpending] = useState<StaticOutcome["spending"]>();
  const [note, setNote] = useState("");
  const [code, setCode] = useState("");
  const [shownCode, setShownCode] = useState("");
  const [hasRecovery, setHasRecovery] = useState(false);
  const [confirmReplacement, setConfirmReplacement] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const hasLoaded = useRef(false);
  const current = useMemo(() => {
    if (!state) return undefined;
    // Old test builds could leave several drafts. An active Intention always
    // wins; otherwise continue the newest draft, never an earlier one.
    return (
      state.intentions.find((item) => item.status === "active") ??
      [...state.intentions]
        .reverse()
        .find((item) => item.status === "draft")
    );
  }, [state]);

  useEffect(() => {
    void Promise.all([loadState(), hasRecoveryCredential()])
      .then(([loaded, recoveryExists]) => {
        setState(loaded);
        setHasRecovery(recoveryExists);
        if (loaded.onboarding) {
          setScreen(
            loaded.lastScreen ??
              (loaded.intentions.find((item) => item.status === "active")
                ? "active"
                : "amount"),
          );
        }
        hasLoaded.current = true;
      })
      .catch(() => setScreen("landing"));
  }, []);

  useEffect(() => {
    if (
      !hasLoaded.current ||
      !state ||
      !isPersistentScreen(screen) ||
      state.lastScreen === screen
    )
      return;
    const next = { ...state, lastScreen: screen };
    setState(next);
    void saveState(next).catch(() => {
      // A navigation change must never trap someone on a screen. The next
      // successful product action will save it again.
    });
  }, [screen, state]);

  async function persist(next: StaticState, destination?: Screen) {
    setBusy(true);
    setError("");
    try {
      const nextState =
        destination && isPersistentScreen(destination)
          ? { ...next, lastScreen: destination }
          : next;
      await saveState(nextState);
      setState(nextState);
      if (destination) setScreen(destination);
    } catch {
      setError("Не удалось сохранить. Проверь соединение и попробуй ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  if (!state) return <main className="screen-state">{content.loading}</main>;
  const amount = nextAmount(state);

  if (screen === "landing")
    return (
      <main className="app-shell flex flex-col">
        <p className="app-eyebrow">ИНТЕНТА</p>
        <section className="flex flex-1 flex-col justify-center">
          <h1 className="app-title">Интента</h1>
          <p className="app-lead mt-7">
            Личный эксперимент: выбери, на что готов потратить небольшую
            неожиданную сумму, запиши намерение и спокойно наблюдай.
          </p>
        </section>
        <button
          className="primary-action"
          onClick={() => setScreen(state.onboarding ? "amount" : "onboarding")}
        >
          Попробовать
        </button>
        <button
          className="quiet-action mt-3"
          onClick={() => setScreen("recovery")}
        >
          У меня уже есть код
        </button>
      </main>
    );
  if (screen === "onboarding")
    return (
      <main className="app-shell flex flex-col">
        <p className="app-eyebrow">ИНТЕНТА</p>
        <section className="flex flex-1 flex-col justify-center">
          <h1 className="app-title">Что такое Интента</h1>
          <p className="app-lead mt-7">
            Выбираешь небольшую сумму, формулируешь намерение, записываешь его
            от руки — и наблюдаешь без ожиданий.
          </p>
        </section>
        <button
          className="primary-action"
          disabled={busy}
          onClick={() => void persist({ ...state, onboarding: true }, "amount")}
        >
          Продолжить
        </button>
        <button
          className="quiet-action mt-3"
          onClick={() => setScreen("landing")}
        >
          {content.backAction}
        </button>
      </main>
    );
  if (screen === "recovery")
    return (
      <main className="app-shell flex flex-col justify-center">
        <p className="app-eyebrow">ИНТЕНТА</p>
        <h1 className="app-title mt-8">Вернуть доступ</h1>
        <form
          className="mt-8"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            void recover(code)
              .then((loaded) => {
                setState(loaded);
                setScreen(
                  loaded.intentions.find((item) => item.status === "active")
                    ? "active"
                    : "amount",
                );
              })
              .catch(() =>
                setError(
                  "Не удалось восстановить доступ. Проверь код и попробуй ещё раз.",
                ),
              )
              .finally(() => setBusy(false));
          }}
        >
          <textarea
            className="field-control min-h-32 p-4"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="INTENTA-..."
            required
          />
          {error && (
            <p role="alert" className="mt-3 text-sm text-[var(--error)]">
              {error}
            </p>
          )}
          <button className="primary-action mt-6" disabled={busy}>
            Восстановить
          </button>
        </form>
        <button
          className="quiet-action mt-3"
          onClick={() => setScreen("landing")}
        >
          {content.backAction}
        </button>
      </main>
    );
  if (screen === "amount")
    return (
      <main className="app-shell flex flex-col">
        <p className="app-eyebrow">ИНТЕНТА</p>
        <section className="flex flex-1 flex-col justify-center">
          {amount ? (
            <>
              <p className="text-sm text-[var(--muted)]">Следующая сумма</p>
              <h1 className="mt-4 text-[clamp(4.5rem,23vw,7rem)] leading-none font-medium tracking-[-.07em]">
                {amount.toLocaleString("ru-RU")} ₽
              </h1>
            </>
          ) : (
            <>
              <h1 className="app-title">Эксперимент завершён</h1>
              <p className="app-lead mt-6">Ты прошёл все доступные шаги.</p>
            </>
          )}
        </section>
        {amount ? (
          <button
            className="primary-action"
            onClick={() => setScreen(current?.status === "draft" ? "paper" : "write")}
          >
            {current?.status === "draft"
              ? "Продолжить черновик"
              : "Сформулировать намерение"}
          </button>
        ) : null}
        <button
          className="quiet-action mt-3"
          onClick={() => setScreen("history")}
        >
          История
        </button>
        <button
          className="quiet-action mt-3"
          onClick={() => setScreen("onboarding")}
        >
          Как это устроено
        </button>
      </main>
    );
  if (screen === "write")
    return (
      <main className="app-shell flex flex-col">
        <p className="app-eyebrow">{amount?.toLocaleString("ru-RU")} ₽</p>
        <form
          className="flex flex-1 flex-col"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            if (!amount || !text.trim()) return;
            const item: StaticIntention =
              current?.status === "draft"
                ? {
                    ...current,
                    text: text.trim(),
                    statement: statement(amount, text.trim()),
                  }
                : {
                    id: crypto.randomUUID(),
                    amount,
                    text: text.trim(),
                    statement: statement(amount, text.trim()),
                    status: "draft",
                    createdAt: new Date().toISOString(),
                  };
            void persist(
              {
                ...state,
                intentions:
                  current?.status === "draft"
                    ? state.intentions.map((existing) =>
                        existing.id === current.id ? item : existing,
                      )
                    : [...state.intentions, item],
              },
              "paper",
            );
          }}
        >
          <h1 className="mt-10 text-[clamp(2rem,9vw,3rem)] leading-[1.08] font-medium tracking-[-0.04em]">
            {content.intentions.question}
          </h1>
          <label
            className="mt-10 text-sm text-[var(--muted)]"
            htmlFor="intention-text"
          >
            {content.intentions.input_label}
          </label>
          <textarea
            id="intention-text"
            className="field-control mt-2 min-h-40 resize-y p-4 text-lg leading-7"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={content.intentions.input_placeholder}
            minLength={3}
            maxLength={500}
            required
          />
          <button className="primary-action mt-auto" disabled={busy}>
            {content.intentions.save_draft_action}
          </button>
          <button
            type="button"
            className="quiet-action mt-3"
            onClick={() => setScreen("amount")}
          >
            {content.backAction}
          </button>
        </form>
      </main>
    );
  if (screen === "paper" && current)
    return (
      <main className="app-shell flex flex-col">
        <p className="app-eyebrow">{content.appName} · 2 / 3</p>
        <h1 className="app-title mt-9">{content.intentions.paper_title}</h1>
        <p className="app-lead mt-6">{content.intentions.paper_instruction}</p>
        <blockquote className="surface-card my-10 whitespace-pre-line border-l-2 border-l-[var(--foreground)] p-5 text-xl leading-8">
          {displayStatement(current)}
        </blockquote>
        <div className="mt-auto space-y-3">
          <button
            className="primary-action"
            onClick={() => setScreen("technique")}
          >
            {content.intentions.paper_written_action}
          </button>
          <button
            className="quiet-action"
            onClick={() => {
              setText(current.text);
              setScreen("write");
            }}
          >
            {content.intentions.edit_action}
          </button>
        </div>
      </main>
    );
  if (screen === "technique" && current)
    return (
      <main className="app-shell flex flex-col justify-center">
        <p className="app-eyebrow">{content.appName} · 3 / 3</p>
        <p className="mt-8 text-sm text-[var(--muted)]">
          {content.intentions.technique_label}
        </p>
        <h1 className="app-title mt-4">Остановись на минуту</h1>
        <p className="surface-card mt-8 p-5 text-lg leading-8 text-[var(--muted)]">
          Прочитай написанное один раз. Заметь, что выбор уже сформулирован.
          Затем отложи лист и возвращайся к обычным делам.
        </p>
        <div className="mt-12 space-y-3">
          <button
            className="primary-action"
            onClick={() => {
            const now = new Date().toISOString();
            void persist(
              {
                ...state,
                intentions: state.intentions.map((item) =>
                  item.id === current.id
                    ? { ...item, status: "active", activatedAt: now }
                    : item,
                ),
              },
              "active",
            );
            }}
          >
            {content.activation.activate_action}
          </button>
          <button className="quiet-action" onClick={() => setScreen("paper")}>
            {content.backAction}
          </button>
        </div>
      </main>
    );
  if (screen === "active" && current)
    return (
      <main className="app-shell flex flex-col">
        <p className="app-eyebrow">ИНТЕНТА</p>
        <section className="flex flex-1 flex-col justify-center">
          <p className="text-sm text-[var(--muted)]">Наблюдаем</p>
          <h1 className="mt-4 text-7xl font-medium tracking-[-.07em]">
            {current.amount.toLocaleString("ru-RU")} ₽
          </h1>
          <p className="mt-10 text-2xl leading-tight">{current.text}</p>
          <p className="app-lead mt-16">
            Теперь ничего специально делать не нужно. Просто живи как обычно.
          </p>
        </section>
        <button
          className="primary-action"
          onClick={() => {
            setOutcomeResolution("happened");
            setScreen("outcome");
          }}
        >
          Кажется, случилось
        </button>
        <button
          className="secondary-action mt-3"
          onClick={() => {
            setOutcomeResolution("not_happened");
            setScreen("outcome");
          }}
        >
          Завершить наблюдение
        </button>
        <button
          className="quiet-action mt-3"
          onClick={() => setScreen("history")}
        >
          История
        </button>
        <button
          className="quiet-action mt-3"
          onClick={() => {
            setConfirmReplacement(false);
            setScreen("code");
          }}
        >
          Код доступа
        </button>
      </main>
    );
  if (screen === "outcome" && current)
    return (
      <main className="app-shell flex flex-col">
        <p className="app-eyebrow">{content.appName}</p>
        <h1 className="app-title mt-8">
          {outcomeResolution === "happened"
            ? content.outcomes.happened_title
            : content.outcomes.close_title}
        </h1>
        <p className="app-lead mt-5">
          {outcomeResolution === "happened"
            ? content.outcomes.happened_description
            : content.outcomes.close_confirm_description}
        </p>
        <form
          className="mt-8 space-y-7 pb-4"
          onSubmit={(event) => {
            event.preventDefault();
            setError("");
            if (outcomeResolution === "happened" && (!wasExpected || !spending)) {
              setError(content.outcomes.required_answers_error);
              return;
            }
            const amountMinor = receivedAmount.trim()
              ? Math.round(Number(receivedAmount.replace(",", ".")) * 100)
              : undefined;
            if (
              receivedAmount.trim() &&
              (amountMinor === undefined ||
                !Number.isSafeInteger(amountMinor) ||
                amountMinor < 0 ||
                amountMinor > 10_000_000_000)
            ) {
              setError(content.outcomes.amount_validation_error);
              return;
            }
            const now = new Date().toISOString();
            const saved: StaticOutcome = {
              resolution: outcomeResolution,
              outcomeType: outcomeResolution === "happened" ? outcomeType : "none",
              sourceType: outcomeResolution === "happened" ? sourceType : undefined,
              amountReceivedMinor: outcomeResolution === "happened" ? amountMinor : undefined,
              wasExpected: outcomeResolution === "happened" ? wasExpected : undefined,
              spending: outcomeResolution === "happened" ? spending : undefined,
              note: note.trim() || undefined,
              createdAt: now,
            };
            void persist(
              {
                ...state,
                intentions: state.intentions.map((item) =>
                  item.id === current.id
                    ? { ...item, status: "completed", completedAt: now, outcome: saved }
                    : item,
                ),
              },
              "outcome-summary",
            );
          }}
        >
          {outcomeResolution === "happened" ? (
            <>
              <label className="block text-sm text-[var(--muted)]">
                {content.outcomes.event_type_label}
                <select className="field-control mt-2" value={outcomeType} onChange={(event) => setOutcomeType(event.target.value as StaticOutcome["outcomeType"])}>
                  <option value="money">{content.outcomes.event_type_money}</option>
                  <option value="other_amount">{content.outcomes.event_type_other_amount}</option>
                  <option value="opportunity">{content.outcomes.event_type_opportunity}</option>
                  <option value="similar">{content.outcomes.event_type_similar}</option>
                  <option value="other">{content.outcomes.event_type_other}</option>
                </select>
              </label>
              <label className="block text-sm text-[var(--muted)]">
                {content.outcomes.amount_label}
                <input className="field-control mt-2" type="text" inputMode="decimal" value={receivedAmount} onChange={(event) => setReceivedAmount(event.target.value)} />
              </label>
              <label className="block text-sm text-[var(--muted)]">
                {content.outcomes.source_label}
                <select className="field-control mt-2" value={sourceType ?? ""} onChange={(event) => setSourceType(event.target.value as StaticOutcome["sourceType"] || undefined)}>
                  <option value="">{content.outcomes.source_none}</option>
                  <option value="gift">{content.outcomes.source_gift}</option><option value="refund">{content.outcomes.source_refund}</option>
                  <option value="bonus_or_cashback">{content.outcomes.source_bonus_or_cashback}</option><option value="extra_income">{content.outcomes.source_extra_income}</option>
                  <option value="found_money">{content.outcomes.source_found_money}</option><option value="saving_or_discount">{content.outcomes.source_saving_or_discount}</option><option value="other">{content.outcomes.source_other}</option>
                </select>
              </label>
              <fieldset>
                <legend className="text-sm text-[var(--muted)]">{content.outcomes.expected_label}</legend>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {(["yes", "no", "unsure"] as const).map((value) => (
                    <label key={value} className={`min-h-12 rounded-xl border p-3 text-center text-sm ${wasExpected === value ? "border-[var(--foreground)] bg-[var(--surface-strong)]" : "border-[var(--border)]"}`}>
                      <input className="mr-2 size-4 accent-[var(--foreground)]" type="radio" name="expected" checked={wasExpected === value} onChange={() => setWasExpected(value)} />
                      {value === "yes" ? content.outcomes.expected_yes : value === "no" ? content.outcomes.expected_no : content.outcomes.expected_unsure}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="block text-sm text-[var(--muted)]">
                {content.outcomes.spending_label}
                <select className="field-control mt-2" value={spending ?? ""} onChange={(event) => setSpending(event.target.value as StaticOutcome["spending"] || undefined)}>
                  <option value="" disabled>{content.outcomes.spending_placeholder}</option>
                  <option value="yes">{content.outcomes.spending_yes}</option><option value="not_yet">{content.outcomes.spending_not_yet}</option><option value="chose_other">{content.outcomes.spending_chose_other}</option><option value="did_not_spend">{content.outcomes.spending_did_not_spend}</option>
                </select>
              </label>
            </>
          ) : null}
          <label className="block text-sm text-[var(--muted)]">
            {content.outcomes.note_label}
            <textarea className="field-control mt-2 min-h-28 resize-y" value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
          {error ? <p role="alert" className="text-sm text-[var(--error)]">{error}</p> : null}
          <button className="primary-action" disabled={busy || (outcomeResolution === "happened" && (!wasExpected || !spending))}>{busy ? content.loading : content.outcomes.save_action}</button>
          <button type="button" className="quiet-action" onClick={() => setScreen("active")}>{content.backAction}</button>
        </form>
      </main>
    );
  if (screen === "outcome-summary") {
    const completed = [...state.intentions]
      .reverse()
      .find((item) => item.status === "completed" && item.completedAt);
    const saved = completed?.outcome;
    const resolution = typeof saved === "string" ? saved : saved?.resolution;
    return (
      <main className="app-shell flex flex-col justify-center">
        <p className="app-eyebrow">{content.appName}</p>
        <h1 className="app-title mt-10">{content.outcomes.summary_title}</h1>
        <p className="app-lead mt-6">{content.outcomes.summary_description}</p>
        <p className="mt-8 text-base leading-7">{resolution === "happened" ? content.outcomes.summary_happened : resolution === "uncertain" ? content.outcomes.summary_uncertain : content.outcomes.summary_not_happened}</p>
        <button className="primary-action mt-10" onClick={() => setScreen("amount")}>{content.outcomes.continue_experiment_action}</button>
        <button className="quiet-action mt-3" onClick={() => setScreen("history")}>{content.outcomes.view_history_action}</button>
      </main>
    );
  }
  if (screen === "code")
    return (
      <main className="app-shell flex flex-col justify-center">
        <p className="app-eyebrow">ИНТЕНТА</p>
        <h1 className="app-title mt-8">
          {hasRecovery ? "Создать новый код" : "Сохрани доступ"}
        </h1>
        {shownCode ? (
          <>
            <p className="field-control mt-8 break-all p-4 font-mono text-sm">
              {shownCode}
            </p>
            <button
              className="primary-action mt-6"
              onClick={() => setScreen("active")}
            >
              Я сохранил код
            </button>
            <button
              className="quiet-action mt-3"
              onClick={() => setScreen("active")}
            >
              {content.backAction}
            </button>
          </>
        ) : hasRecovery && !confirmReplacement ? (
          <>
            <p className="app-lead mt-6">
              Предыдущий код перестанет работать. Новый код будет показан только
              один раз.
            </p>
            <button
              className="primary-action mt-8"
              onClick={() => setConfirmReplacement(true)}
            >
              Продолжить
            </button>
            <button
              className="quiet-action mt-3"
              onClick={() => setScreen("active")}
            >
              {content.backAction}
            </button>
          </>
        ) : (
          <>
            <p className="app-lead mt-6">
              Код показывается один раз и поможет вернуться с другого
              устройства.
            </p>
            <button
              className="primary-action mt-8"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void issueRecovery(state)
                  .then(setShownCode)
                  .then(() => setHasRecovery(true))
                  .catch(() => setError("Не удалось выдать код."))
                  .finally(() => setBusy(false));
              }}
            >
              Показать код
            </button>
            {error && (
              <p className="mt-3 text-sm text-[var(--error)]">{error}</p>
            )}
            <button
              className="quiet-action mt-3"
              onClick={() => setScreen("active")}
            >
              {content.backAction}
            </button>
          </>
        )}
      </main>
    );
  if (screen === "detail") {
    const item = state.intentions.find(
      (intention) => intention.id === state.selectedIntentionId,
    );
    if (!item) {
      setScreen("history");
      return null;
    }
    const saved = item.outcome;
    const outcome: Partial<StaticOutcome> | undefined =
      typeof saved === "string" ? { resolution: saved } : saved;
    const status =
      item.status === "draft"
        ? content.history.status_draft
        : item.status === "active"
          ? content.history.status_active
          : outcome?.resolution === "happened"
            ? content.history.outcome_happened
            : outcome?.resolution === "uncertain"
              ? content.history.outcome_uncertain
              : content.history.outcome_not_happened;
    return (
      <main className="app-shell flex flex-col">
        <button className="inline-flex min-h-11 items-center text-sm text-[var(--muted)]" onClick={() => setScreen("history")}>← {content.history.back_action}</button>
        <p className="app-eyebrow mt-7">{content.appName}</p>
        <h1 className="app-title mt-5">{content.history.detail_title}</h1>
        <p className="mt-6 text-[clamp(3.5rem,18vw,5.5rem)] leading-none font-medium tracking-[-0.07em]">{item.amount.toLocaleString("ru-RU")} ₽</p>
        <section className="surface-card mt-10 p-5"><h2 className="text-sm text-[var(--muted)]">{content.history.intention_label}</h2><p className="mt-3 text-lg leading-7">{item.text}</p></section>
        <section className="surface-card mt-3 p-5"><h2 className="text-sm text-[var(--muted)]">{content.history.statement_label}</h2><p className="mt-3 whitespace-pre-wrap text-base leading-7">{displayStatement(item)}</p></section>
        <section className="surface-card mt-3 p-5"><h2 className="text-sm text-[var(--muted)]">{content.history.technique_label}</h2><h3 className="mt-3 text-lg font-medium">Остановись на минуту</h3><p className="mt-2 leading-7 text-[var(--muted)]">Прочитай написанное один раз, отложи лист и возвращайся к обычным делам.</p></section>
        <section className="surface-card mt-3 p-5">
          <h2 className="text-xl font-medium tracking-[-0.03em]">{content.history.outcome_title}</h2>
          <p className="mt-3 leading-7">{status}</p>
          {outcome?.outcomeType && outcome.outcomeType !== "none" ? (
            <div className="mt-4 space-y-3 text-base leading-7">
              <p><span className="text-[var(--muted)]">{content.outcomes.event_type_label}: </span>{outcomeTypeLabels[outcome.outcomeType]}</p>
              {outcome.sourceType ? <p><span className="text-[var(--muted)]">{content.outcomes.source_label}: </span>{sourceLabels[outcome.sourceType]}</p> : null}
              {outcome.wasExpected ? <p><span className="text-[var(--muted)]">{content.outcomes.expected_label}: </span>{expectedLabels[outcome.wasExpected]}</p> : null}
              {outcome.spending ? <p><span className="text-[var(--muted)]">{content.outcomes.spending_label}: </span>{spendingLabels[outcome.spending]}</p> : null}
            </div>
          ) : null}
          {outcome?.amountReceivedMinor !== undefined ? <p className="mt-4 text-2xl">{(outcome.amountReceivedMinor / 100).toLocaleString("ru-RU")} ₽</p> : null}
          {outcome?.note ? <p className="mt-4 whitespace-pre-wrap leading-7">{outcome.note}</p> : null}
        </section>
        {item.status === "draft" ? (
          <div className="mt-8 space-y-3">
            <button className="primary-action" onClick={() => setScreen("paper")}>Продолжить создание</button>
            <button
              className="quiet-action text-[var(--error)]"
              onClick={() => {
                const next = {
                  ...state,
                  intentions: state.intentions.filter(
                    (intention) => intention.id !== item.id,
                  ),
                  selectedIntentionId: undefined,
                };
                void persist(next, "history");
              }}
            >
              Удалить черновик
            </button>
          </div>
        ) : null}
      </main>
    );
  }
  return (
    <main className="app-shell">
      <p className="app-eyebrow">ИНТЕНТА</p>
      <h1 className="app-title mt-8">История</h1>
      <div className="mt-8 space-y-4">
        {[...state.intentions].reverse().map((item) => (
          <button
            type="button"
            onClick={() => {
              void persist(
                { ...state, selectedIntentionId: item.id },
                "detail",
              );
            }}
            className="surface-card block w-full p-5 text-left hover:border-[var(--foreground)]"
            key={item.id}
          >
            <p className="text-3xl font-medium">
              {item.amount.toLocaleString("ru-RU")} ₽
            </p>
            <p className="mt-3">{item.text}</p>
            <p className="mt-3 text-sm text-[var(--muted)]">
              {item.status === "completed"
                ? "Результат зафиксирован"
                : item.status === "active"
                  ? "Наблюдаем"
                  : "Черновик"}
            </p>
          </button>
        ))}
      </div>
      <button
        className="primary-action mt-8"
        onClick={() =>
          setScreen(current?.status === "active" ? "active" : "amount")
        }
      >
        Вернуться
      </button>
    </main>
  );
}
