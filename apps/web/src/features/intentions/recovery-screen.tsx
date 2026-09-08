"use client";
import { api } from "@intenta/api-client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { content } from "../../lib/content";
import { routeForFlowState } from "../../lib/flow";

export function RecoveryScreen() {
  const router = useRouter();
  const [csrf, setCsrf] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [credentialExists, setCredentialExists] = useState(false);
  const [returnPath, setReturnPath] = useState("/home");
  useEffect(() => {
    void Promise.all([
      api.GET("/api/v1/me"),
      api.GET("/api/v1/auth/csrf"),
    ]).then(([me, token]) => {
      if (!me.data) router.replace("/");
      else if (
        !["active", "ready_for_next", "experiment_completed"].includes(
          me.data.flow_state,
        )
      ) {
        router.replace(routeForFlowState(me.data.flow_state));
      } else {
        setCredentialExists(me.data.credential_exists);
        setReturnPath(routeForFlowState(me.data.flow_state));
        if (token.data) setCsrf(token.data.csrf_token);
      }
    });
  }, [router]);
  async function issue() {
    setBusy(true);
    const path = credentialExists
      ? "/api/v1/me/recovery-credential/replacement"
      : "/api/v1/me/recovery-credential";
    const { data } = await api.POST(path, {
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
    router.push(returnPath);
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
            onClick={() => router.push(returnPath)}
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
          {credentialExists ? (
            <p className="mt-5 text-base leading-7 text-[var(--muted)]">
              {content.activation.replacement_warning}
            </p>
          ) : null}
          <button
            disabled={!csrf || busy}
            onClick={() => void issue()}
            className="mt-10 min-h-14 rounded-full bg-[var(--foreground)] text-white disabled:opacity-60"
          >
            {busy
              ? content.loading
              : credentialExists
                ? content.activation.replacement_action
                : content.activation.issue_code_action}
          </button>
          {!credentialExists ? (
            <button
              onClick={() => router.push(returnPath)}
              className="mt-3 min-h-12 w-full text-sm text-[var(--muted)]"
            >
              {content.activation.later_action}
            </button>
          ) : null}
        </>
      )}
    </main>
  );
}
