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
    <main className="app-shell flex flex-col justify-center">
      <button className="quiet-action w-fit" onClick={() => router.push("/")}>
        ← {content.returnAction}
      </button>
      <p className="app-eyebrow mt-8">{content.appName}</p>
      <h1 className="app-title mt-6">{content.recoverTitle}</h1>
      <p className="app-lead mt-6">{content.recoverDescription}</p>
      <form onSubmit={(e) => void submit(e)} className="mt-10">
        <label htmlFor="code" className="text-sm text-[var(--muted)]">
          {content.recoverInputLabel}
        </label>
        <textarea
          id="code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          className="field-control mt-2 min-h-32 resize-y p-4"
        />
        {error ? (
          <p role="alert" className="mt-3 text-sm text-[var(--error)]">
            {error}
          </p>
        ) : null}
        <button disabled={busy} className="primary-action mt-6">
          {busy ? content.loading : content.recoverSubmit}
        </button>
      </form>
    </main>
  );
}
