import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/history",
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock("@intenta/api-client", () => ({
  api: { GET: mocks.get },
}));

import { HistoryList } from "../src/features/history/history-list";

const completed = {
  id: "completed-id",
  status: "completed" as const,
  amount_minor: 50000,
  currency: "RUB",
  intention_text_raw: "Куплю себе книгу",
  completed_at: "2026-09-08T00:00:00Z",
  observation_days: 8,
  outcome_resolution: "uncertain" as const,
};

describe("HistoryList", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders saved results without exposing future steps and loads another page", async () => {
    mocks.get
      .mockResolvedValueOnce({
        data: { items: [completed], next_cursor: "cursor-1" },
      })
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              ...completed,
              id: "active-id",
              status: "active",
              completed_at: null,
              observation_days: 2,
              outcome_resolution: null,
            },
          ],
          next_cursor: null,
        },
      });
    render(<HistoryList />);

    expect(
      await screen.findByRole("heading", { name: "История" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Не уверен")).toBeInTheDocument();
    expect(screen.getByText("Наблюдение: 8 дн.")).toBeInTheDocument();
    expect(screen.queryByText(/шаг/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Показать ещё" }));
    await waitFor(() =>
      expect(mocks.get).toHaveBeenLastCalledWith("/api/v1/intentions", {
        params: { query: { cursor: "cursor-1" } },
      }),
    );
    expect(await screen.findByText("День 2")).toBeInTheDocument();
  });

  it("shows an empty state", async () => {
    mocks.get.mockResolvedValue({ data: { items: [], next_cursor: null } });
    render(<HistoryList />);
    expect(
      await screen.findByRole("heading", { name: "Здесь появятся Интенты" }),
    ).toBeInTheDocument();
  });
});
