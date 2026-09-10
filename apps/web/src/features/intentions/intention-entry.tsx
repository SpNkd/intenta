"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { api } from "@intenta/api-client";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { content } from "../../lib/content";
import { MainNavigation } from "../../components/main-navigation";
import { isUnauthorized } from "../../lib/private-request";

const unsavedIntentionStorageKey = "intenta:unsaved-intention";

function amountLabel(amountMinor: number, currency: string) {
  const value = new Intl.NumberFormat("ru-RU").format(amountMinor / 100);
  return `${value} ${currency === "RUB" ? "₽" : currency}`;
}

export function IntentionEntry() {
  const router = useRouter();
  const [step, setStep] = useState<{
    amount_minor: number;
    currency: string;
  } | null>(null);
  const [draft, setDraft] = useState<{
    id: string;
    intention_text_raw: string;
  } | null>(null);
  const [csrf, setCsrf] = useState("");
  const [text, setText] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [experimentCompleted, setExperimentCompleted] = useState(false);
  const [recoveryAvailable, setRecoveryAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [me, csrfResponse, current, next] = await Promise.all([
        api.GET("/api/v1/me"),
        api.GET("/api/v1/auth/csrf"),
        api.GET("/api/v1/intentions/current"),
        api.GET("/api/v1/experiment/next"),
      ]);
      if (
        isUnauthorized(me) ||
        isUnauthorized(csrfResponse) ||
        isUnauthorized(current) ||
        isUnauthorized(next)
      )
        return router.replace("/");
      if (!me.data) return setError(content.requestError);
      if (!me.data.onboarding_completed) return router.replace("/onboarding");
      setRecoveryAvailable(
        me.data.credential_exists || me.data.recovery_credential_issuable,
      );
      if (csrfResponse.data) setCsrf(csrfResponse.data.csrf_token);
      if (current.data) {
        setDraft(current.data);
        setText(current.data.intention_text_raw);
        setStep(current.data);
        setShowForm(true);
      } else if (next.data) {
        setStep(next.data);
        const unsavedText = window.sessionStorage.getItem(
          unsavedIntentionStorageKey,
        );
        if (unsavedText) {
          setText(unsavedText);
          setShowForm(true);
        }
      } else if (me.data.flow_state === "experiment_completed") {
        setExperimentCompleted(true);
      } else {
        setError(content.requestError);
      }
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

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const options = {
      body: { intention_text_raw: text },
      headers: { "X-CSRF-Token": csrf },
    };
    const result = draft
      ? await api.PATCH("/api/v1/intentions/{intention_id}", {
          params: { path: { intention_id: draft.id } },
          ...options,
        })
      : await api.POST("/api/v1/intentions", options);
    if (!result.data) {
      setError(content.requestError);
      setSaving(false);
      return;
    }
    window.sessionStorage.removeItem(unsavedIntentionStorageKey);
    router.push("/intention/paper");
  }

  function openAbout() {
    if (!draft && text.trim()) {
      window.sessionStorage.setItem(unsavedIntentionStorageKey, text);
    }
    router.push("/about?returnTo=/intention");
  }

  if (loading) {
    return <main className="screen-state">{content.loading}</main>;
  }

  if (experimentCompleted) {
    return (
      <main className="app-shell flex flex-col justify-center">
        <p className="app-eyebrow">{content.appName}</p>
        <h1 className="app-title mt-10">
          {content.intentions.experiment_completed_title}
        </h1>
        <p className="app-lead mt-6">
          {content.intentions.experiment_completed_description}
        </p>
        <button
          onClick={() => router.push("/history")}
          className="primary-action mt-10"
        >
          {content.intentions.history_action}
        </button>
        <button
          onClick={() => router.push("/recovery")}
          className="quiet-action mt-3"
        >
          {content.activation.manage_recovery_action}
        </button>
        <MainNavigation />
      </main>
    );
  }

  if (!step) {
    return (
      <main className="screen-state text-center">
        <div>
          <p role="alert" className="text-sm text-[var(--error)]">
            {error || content.requestError}
          </p>
          <button onClick={() => void load()} className="quiet-action mt-4">
            {content.retryAction}
          </button>
        </div>
      </main>
    );
  }

  if (!showForm) {
    return (
      <main className="app-shell flex flex-col">
        <p className="app-eyebrow">{content.appName}</p>
        <section className="flex flex-1 flex-col justify-center">
          <p className="text-sm text-[var(--muted)]">
            {content.intentions.amount_intro}
          </p>
          <h1 className="mt-4 text-[clamp(4.5rem,23vw,7rem)] leading-none font-medium tracking-[-0.07em]">
            {amountLabel(step.amount_minor, step.currency)}
          </h1>
        </section>
        <div className="space-y-3">
          <button className="primary-action" onClick={() => setShowForm(true)}>
            {content.intentions.amount_action}
          </button>
          <button
            className="quiet-action"
            onClick={openAbout}
          >
            {content.intentions.about_action}
          </button>
          {recoveryAvailable ? (
            <button
              className="quiet-action"
              onClick={() => router.push("/recovery")}
            >
              {content.activation.manage_recovery_action}
            </button>
          ) : null}
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell flex flex-col">
      <p className="app-eyebrow">
        {amountLabel(step.amount_minor, step.currency)}
      </p>
      <form
        className="flex flex-1 flex-col"
        onSubmit={(event) => void submit(event)}
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
          required
          minLength={3}
          maxLength={500}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={content.intentions.input_placeholder}
          className="field-control mt-2 min-h-40 resize-y p-4 text-lg leading-7"
        />
        <div className="flex-1" />
        {error ? (
          <p role="alert" className="mb-3 text-sm text-[var(--error)]">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          onClick={openAbout}
          className="quiet-action mt-6"
        >
          {content.intentions.about_action}
        </button>
        <button disabled={saving || !csrf} className="primary-action mt-8">
          {saving ? content.loading : content.intentions.save_draft_action}
        </button>
      </form>
    </main>
  );
}
