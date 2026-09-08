"use client";
import { api } from "@intenta/api-client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { content } from "../../lib/content";
import { routeForFlowState } from "../../lib/flow";
export default function RecoverPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error: requestError } = await api.POST("/api/v1/auth/recover", {
      body: { code },
    });
    if (requestError) {
      setError(content.recoverError);
      setBusy(false);
      return;
    }
    const { data } = await api.GET("/api/v1/me");
    router.push(data ? routeForFlowState(data.flow_state) : "/");
  }
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10 sm:px-7">
      <h1 className="text-[clamp(2.7rem,13vw,4rem)] leading-none font-medium tracking-[-0.05em]">
        {content.recoverTitle}
      </h1>
      <p className="mt-6 text-lg text-[var(--muted)]">
        {content.recoverDescription}
      </p>
      <form onSubmit={(e) => void submit(e)} className="mt-10">
        <label htmlFor="code" className="text-sm text-[var(--muted)]">
          {content.recoverInputLabel}
        </label>
        <textarea
          id="code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          className="mt-2 min-h-28 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
        />
        {error ? (
          <p role="alert" className="mt-3 text-sm text-[var(--error)]">
            {error}
          </p>
        ) : null}
        <button
          disabled={busy}
          className="mt-6 min-h-14 w-full rounded-full bg-[var(--foreground)] text-white"
        >
          {busy ? content.loading : content.recoverSubmit}
        </button>
      </form>
    </main>
  );
}
