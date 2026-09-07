"use client";
import { api } from "@intenta/api-client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { content } from "../../lib/content";

export function RecoveryScreen() {
  const router = useRouter();
  const [csrf, setCsrf] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void Promise.all([
      api.GET("/api/v1/me"),
      api.GET("/api/v1/auth/csrf"),
    ]).then(([me, token]) => {
      if (!me.data || me.data.flow_state !== "active") router.replace("/");
      else if (token.data) setCsrf(token.data.csrf_token);
    });
  }, [router]);
  async function issue() {
    setBusy(true);
    const { data } = await api.POST("/api/v1/me/recovery-credential", {
      headers: { "X-CSRF-Token": csrf },
    });
    if (!data) {
      setError(content.activation.recovery_error);
      setBusy(false);
    } else setCode(data.code);
  }
  async function saved() {
    await api.POST("/api/v1/me/recovery-code-acknowledgement", {
      headers: { "X-CSRF-Token": csrf },
    });
    router.push("/home");
  }
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10 sm:px-7">
      <h1 className="text-[clamp(2.7rem,13vw,4rem)] leading-none font-medium tracking-[-0.05em]">
        {content.activation.recovery_title}
      </h1>
      <p className="mt-7 text-lg leading-7 text-[var(--muted)]">
        {content.activation.recovery_description}
      </p>
      {code ? (
        <>
          <code className="mt-10 break-all rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-lg">
            {code}
          </code>
          <button
            onClick={() => void navigator.clipboard.writeText(code)}
            className="mt-4 min-h-12 text-sm"
          >
            {content.activation.copy_action}
          </button>
          <button
            onClick={() => void saved()}
            className="mt-5 min-h-14 rounded-full bg-[var(--foreground)] text-white"
          >
            {content.activation.acknowledge_action}
          </button>
          <button
            onClick={() => router.push("/home")}
            className="mt-3 min-h-12 text-sm text-[var(--muted)]"
          >
            {content.activation.later_action}
          </button>
        </>
      ) : (
        <>
          <p role="alert" className="mt-5 text-sm text-[var(--error)]">
            {error}
          </p>
          <button
            disabled={!csrf || busy}
            onClick={() => void issue()}
            className="mt-10 min-h-14 rounded-full bg-[var(--foreground)] text-white disabled:opacity-60"
          >
            {busy ? content.loading : content.activation.issue_code_action}
          </button>
        </>
      )}
    </main>
  );
}
