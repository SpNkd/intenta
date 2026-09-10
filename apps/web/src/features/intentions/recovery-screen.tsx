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
  const [canIssueRecovery, setCanIssueRecovery] = useState(false);
  const [returnPath, setReturnPath] = useState("/home");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void Promise.all([api.GET("/api/v1/me"), api.GET("/api/v1/auth/csrf")])
      .then(([me, token]) => {
        if (!me.data) router.replace("/");
        else if (
          !["active", "ready_for_next", "experiment_completed"].includes(
            me.data.flow_state,
          )
        ) {
          router.replace(routeForFlowState(me.data.flow_state));
        } else {
          setCredentialExists(me.data.credential_exists);
          setCanIssueRecovery(me.data.recovery_credential_issuable);
          setReturnPath(routeForFlowState(me.data.flow_state));
          if (token.data) setCsrf(token.data.csrf_token);
        }
      })
      .catch(() => setError(content.requestError))
      .finally(() => setLoading(false));
  }, [router]);
  async function issue() {
    if (busy) return;
    setBusy(true);
    try {
      const path = credentialExists
        ? "/api/v1/me/recovery-credential/replacement"
        : "/api/v1/me/recovery-credential";
      const { data } = await api.POST(path, {
        headers: { "X-CSRF-Token": csrf },
      });
      if (data) {
        setCode(data.code);
        return;
      }
      // A response can be lost after the credential is committed. Re-read state
      // instead of repeating an issuance that can no longer return plaintext.
      if (!credentialExists) {
        const me = await api.GET("/api/v1/me");
        if (me.data?.credential_exists) {
          setCredentialExists(true);
          setCanIssueRecovery(me.data.recovery_credential_issuable);
          setError("");
          return;
        }
      }
      setError(content.activation.recovery_error);
    } catch {
      setError(content.activation.recovery_error);
    } finally {
      setBusy(false);
    }
  }
  async function saved() {
    const { data } = await api.POST(
      "/api/v1/me/recovery-code-acknowledgement",
      {
        headers: { "X-CSRF-Token": csrf },
      },
    );
    if (!data) setError(content.requestError);
    else router.push(returnPath);
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setError(content.requestError);
    }
  }
  if (loading) return <main className="screen-state">{content.loading}</main>;
  return (
    <main className="app-shell flex flex-col justify-center">
      <p className="app-eyebrow">{content.appName}</p>
      <h1 className="app-title mt-10">{content.activation.recovery_title}</h1>
      <p className="app-lead mt-7">{content.activation.recovery_description}</p>
      {code ? (
        <>
          <code className="surface-card mt-10 break-all p-5 text-lg leading-8">
            {code}
          </code>
          <button onClick={() => void copy()} className="secondary-action mt-4">
            {copied
              ? content.activation.copied_action
              : content.activation.copy_action}
          </button>
          <button onClick={() => void saved()} className="primary-action mt-5">
            {content.activation.acknowledge_action}
          </button>
          <button
            onClick={() => router.push(returnPath)}
            className="quiet-action mt-3"
          >
            {content.activation.later_action}
          </button>
        </>
      ) : (
        <>
          {error ? (
            <p role="alert" className="mt-5 text-sm text-[var(--error)]">
              {error}
            </p>
          ) : null}
          {!credentialExists && !canIssueRecovery ? (
            <>
              <p className="mt-5 text-base leading-7 text-[var(--muted)]">
                {content.activation.recovery_unavailable_description}
              </p>
              <button
                onClick={() => router.push("/intention")}
                className="primary-action mt-10"
              >
                {content.activation.recovery_unavailable_action}
              </button>
            </>
          ) : (
            <>
              {credentialExists ? (
                <p className="mt-5 text-base leading-7 text-[var(--muted)]">
                  {content.activation.replacement_warning}
                </p>
              ) : null}
              <button
                disabled={!csrf || busy}
                onClick={() => void issue()}
                className="primary-action mt-10"
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
                  className="quiet-action mt-3"
                >
                  {content.activation.later_action}
                </button>
              ) : null}
            </>
          )}
        </>
      )}
    </main>
  );
}
