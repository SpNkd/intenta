"use client";

import { api } from "@intenta/api-client";
import Link from "next/link";
import { useEffect, useState } from "react";

import { MainNavigation } from "../../components/main-navigation";
import { content } from "../../lib/content";

type HistoryItem = {
  id: string;
  status: "draft" | "active" | "completed" | "cancelled";
  amount_minor: number;
  currency: string;
  intention_text_raw: string;
  completed_at: string | null;
  observation_days: number | null;
  outcome_resolution: "happened" | "not_happened" | "uncertain" | null;
};

const amountLabel = (amountMinor: number, currency: string) =>
  `${new Intl.NumberFormat("ru-RU").format(amountMinor / 100)} ${currency === "RUB" ? "₽" : currency}`;

function statusLabel(item: HistoryItem): string {
  if (item.status === "draft") return content.history.status_draft;
  if (item.status === "active") return content.history.status_active;
  if (item.outcome_resolution === "happened")
    return content.history.outcome_happened;
  if (item.outcome_resolution === "not_happened")
    return content.history.outcome_not_happened;
  if (item.outcome_resolution === "uncertain")
    return content.history.outcome_uncertain;
  return content.history.status_completed;
}

export function HistoryList() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  async function load(cursor?: string) {
    const { data } = await api.GET("/api/v1/intentions", {
      params: cursor ? { query: { cursor } } : undefined,
    });
    if (!data) {
      setError(content.history.load_error);
      return;
    }
    setItems((current) => (cursor ? [...current, ...data.items] : data.items));
    setNextCursor(data.next_cursor);
  }

  useEffect(() => {
    let active = true;
    void api.GET("/api/v1/intentions").then(({ data }) => {
      if (!active) return;
      if (!data) {
        setError(content.history.load_error);
      } else {
        setItems(data.items);
        setNextCursor(data.next_cursor);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    setError("");
    await load(nextCursor);
    setLoadingMore(false);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-8 sm:px-7">
      <p className="text-xs font-semibold tracking-[0.28em] text-[var(--muted)]">
        {content.appName}
      </p>
      <h1 className="mt-8 text-4xl font-medium tracking-[-0.05em]">
        {content.history.title}
      </h1>
      {loading ? (
        <p className="mt-12 text-sm text-[var(--muted)]">{content.loading}</p>
      ) : items.length === 0 ? (
        <section className="flex flex-1 flex-col justify-center">
          <h2 className="text-2xl font-medium tracking-[-0.03em]">
            {content.history.empty_title}
          </h2>
          <p className="mt-3 text-base leading-7 text-[var(--muted)]">
            {content.history.empty_description}
          </p>
        </section>
      ) : (
        <section className="mt-8 space-y-3" aria-label={content.history.title}>
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/history/${item.id}`}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"
            >
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-2xl font-medium tracking-[-0.04em]">
                  {amountLabel(item.amount_minor, item.currency)}
                </h2>
                <p className="text-right text-xs text-[var(--muted)]">
                  {statusLabel(item)}
                </p>
              </div>
              <p className="mt-4 text-base leading-7">
                {item.intention_text_raw}
              </p>
              <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-sm text-[var(--muted)]">
                {item.completed_at ? (
                  <p>
                    {content.history.completed_label.replace(
                      "{date}",
                      new Intl.DateTimeFormat("ru-RU", {
                        dateStyle: "medium",
                      }).format(new Date(item.completed_at)),
                    )}
                  </p>
                ) : null}
                {item.observation_days ? (
                  <p>
                    {(item.status === "active"
                      ? content.history.active_days_label
                      : content.history.observation_days_label
                    ).replace("{days}", String(item.observation_days))}
                  </p>
                ) : null}
              </div>
            </Link>
          ))}
          {nextCursor ? (
            <button
              disabled={loadingMore}
              onClick={() => void loadMore()}
              className="min-h-12 w-full text-sm text-[var(--muted)] disabled:opacity-60"
            >
              {loadingMore ? content.loading : content.history.load_more_action}
            </button>
          ) : null}
        </section>
      )}
      {error ? (
        <p role="alert" className="mt-4 text-sm text-[var(--error)]">
          {error}
        </p>
      ) : null}
      <MainNavigation />
    </main>
  );
}
