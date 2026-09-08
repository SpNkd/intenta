import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ intentionId: "intention-id" }),
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@intenta/api-client", () => ({
  api: { GET: mocks.get },
}));

import { HistoryDetail } from "../src/features/history/history-detail";

const completedIntention = {
  id: "intention-id",
  status: "completed",
  amount_minor: 50000,
  currency: "RUB",
  intention_text_raw: "Куплю себе хорошие наушники",
  intention_statement: "Сохранённый statement",
  technique: {
    title: "Остановись на минуту",
    instruction: "Сохранённая инструкция.",
  },
  activated_at: "2026-09-01T00:00:00Z",
  completed_at: "2026-09-08T00:00:00Z",
  observation_days: 8,
};

describe("HistoryDetail", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows saved snapshots and the complete neutral Outcome", async () => {
    mocks.get.mockImplementation((path: string) =>
      Promise.resolve(
        path === "/api/v1/intentions/{intention_id}"
          ? { data: completedIntention }
          : {
              data: {
                resolution: "happened",
                outcome_type: "money",
                source_type: "gift",
                amount_received_minor: 50000,
                was_expected: "no",
                followed_original_intention: "not_yet",
                user_note: "Неожиданный подарок.",
                occurred_at: null,
                created_at: "2026-09-08T00:00:00Z",
              },
            },
      ),
    );
    render(<HistoryDetail />);

    expect(
      await screen.findByText("Сохранённый statement"),
    ).toBeInTheDocument();
    expect(screen.getByText("Сохранённая инструкция.")).toBeInTheDocument();
    expect(screen.getByText(/Подарок/)).toBeInTheDocument();
    expect(screen.getByText("Неожиданный подарок.")).toBeInTheDocument();
    expect(screen.getByText("Наблюдение: 8 дн.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /К истории/ })).toHaveAttribute(
      "href",
      "/history",
    );
  });

  it("shows an active Intention without inventing an Outcome", async () => {
    mocks.get.mockResolvedValue({
      data: {
        ...completedIntention,
        status: "active",
        completed_at: null,
        observation_days: 2,
      },
    });
    render(<HistoryDetail />);
    expect(
      await screen.findByText("Результат ещё не сохранён."),
    ).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });
});
