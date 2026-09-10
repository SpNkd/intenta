"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { content } from "../lib/content";
import {
  issueRecovery,
  loadState,
  nextAmount,
  recover,
  saveState,
  type StaticIntention,
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
  | "history"
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

const persistentScreens = new Set<Exclude<Screen, "recovery" | "code">>([
  "landing",
  "onboarding",
  "amount",
  "write",
  "paper",
  "technique",
  "active",
  "outcome",
  "history",
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
  const [outcome, setOutcome] = useState<StaticIntention["outcome"]>();
  const [code, setCode] = useState("");
  const [shownCode, setShownCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const hasLoaded = useRef(false);
  const current = useMemo(
    () => state?.intentions.find((item) => item.status !== "completed"),
    [state],
  );

  useEffect(() => {
    void loadState()
      .then((loaded) => {
        setState(loaded);
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
          <button className="primary-action" onClick={() => setScreen("write")}>
            Сформулировать намерение
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
            const item: StaticIntention = {
              id: crypto.randomUUID(),
              amount,
              text: text.trim(),
              statement: statement(amount, text.trim()),
              status: "draft",
              createdAt: new Date().toISOString(),
            };
            void persist(
              { ...state, intentions: [...state.intentions, item] },
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
          <button className="quiet-action" onClick={() => setScreen("write")}>
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
            setOutcome("happened");
            setScreen("outcome");
          }}
        >
          Кажется, случилось
        </button>
        <button
          className="secondary-action mt-3"
          onClick={() => {
            setOutcome("not_happened");
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
        <button className="quiet-action mt-3" onClick={() => setScreen("code")}>
          Код доступа
        </button>
      </main>
    );
  if (screen === "outcome" && current)
    return (
      <main className="app-shell flex flex-col justify-center">
        <p className="app-eyebrow">Результат</p>
        <h1 className="app-title mt-8">Что ты заметил?</h1>
        <div className="mt-8 space-y-3">
          {(["happened", "not_happened", "uncertain"] as const).map((value) => (
            <button
              key={value}
              className={
                outcome === value ? "primary-action" : "secondary-action"
              }
              onClick={() => setOutcome(value)}
            >
              {value === "happened"
                ? "Кажется, случилось"
                : value === "not_happened"
                  ? "Ничего не произошло"
                  : "Не уверен"}
            </button>
          ))}
        </div>
        <button
          className="primary-action mt-8"
          disabled={!outcome || busy}
          onClick={() => {
            const now = new Date().toISOString();
            void persist(
              {
                ...state,
                intentions: state.intentions.map((item) =>
                  item.id === current.id
                    ? {
                        ...item,
                        status: "completed",
                        completedAt: now,
                        outcome,
                      }
                    : item,
                ),
              },
              "amount",
            );
          }}
        >
          Сохранить результат
        </button>
        <button
          className="quiet-action mt-3"
          onClick={() => setScreen("active")}
        >
          {content.backAction}
        </button>
      </main>
    );
  if (screen === "code")
    return (
      <main className="app-shell flex flex-col justify-center">
        <p className="app-eyebrow">ИНТЕНТА</p>
        <h1 className="app-title mt-8">Сохрани доступ</h1>
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
  return (
    <main className="app-shell">
      <p className="app-eyebrow">ИНТЕНТА</p>
      <h1 className="app-title mt-8">История</h1>
      <div className="mt-8 space-y-4">
        {[...state.intentions].reverse().map((item) => (
          <article
            className="rounded-3xl border border-[var(--line)] p-5"
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
          </article>
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
