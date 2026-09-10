"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

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
  | "active"
  | "outcome"
  | "history"
  | "recovery"
  | "code";

const statement = (amount: number) =>
  `Когда в моей жизни неожиданно появятся ${amount.toLocaleString("ru-RU")} ₽, я потрачу их на то, что выбрал для себя.`;

export function StaticApp() {
  const [state, setState] = useState<StaticState | null>(null);
  const [screen, setScreen] = useState<Screen>("landing");
  const [text, setText] = useState("");
  const [outcome, setOutcome] = useState<StaticIntention["outcome"]>();
  const [code, setCode] = useState("");
  const [shownCode, setShownCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const current = useMemo(
    () => state?.intentions.find((item) => item.status !== "completed"),
    [state],
  );

  useEffect(() => {
    void loadState()
      .then((loaded) => {
        setState(loaded);
        if (loaded.onboarding)
          setScreen(
            loaded.intentions.find((item) => item.status === "active")
              ? "active"
              : "amount",
          );
      })
      .catch(() => setScreen("landing"));
  }, []);

  async function persist(next: StaticState, destination?: Screen) {
    setBusy(true);
    setError("");
    try {
      await saveState(next);
      setState(next);
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
              statement: statement(amount),
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
        </form>
      </main>
    );
  if (screen === "paper" && current)
    return (
      <main className="app-shell flex flex-col">
        <p className="app-eyebrow">ИНТЕНТА</p>
        <section className="flex flex-1 flex-col justify-center">
          <p className="text-sm text-[var(--muted)]">Перепиши от руки</p>
          <h1 className="mt-5 text-3xl font-medium leading-tight">
            {current.statement}
          </h1>
          <p className="app-lead mt-8">
            Остановись на минуту, прочитай написанное и отложи лист.
          </p>
        </section>
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
          Активировать
        </button>
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
