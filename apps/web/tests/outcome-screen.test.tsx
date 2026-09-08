import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  mode: "happened",
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ intentionId: "intention-id" }),
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useSearchParams: () => ({ get: () => mocks.mode }),
}));

vi.mock("@intenta/api-client", () => ({
  api: { GET: mocks.get, POST: mocks.post },
}));

import { OutcomeScreen } from "../src/features/outcomes/outcome-screen";

const activeIntention = {
  id: "intention-id",
  status: "active",
  amount_minor: 50000,
  currency: "RUB",
  intention_text_raw: "Куплю себе книгу",
};

describe("OutcomeScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mode = "happened";
    mocks.get.mockImplementation((path: string) =>
      Promise.resolve(
        path === "/api/v1/intentions/{intention_id}"
          ? { data: activeIntention }
          : { data: { csrf_token: "csrf" } },
      ),
    );
  });

  it("sends a user-classified happened outcome", async () => {
    mocks.post.mockResolvedValue({
      data: {
        resolution: "happened",
        outcome_type: "money",
        was_expected: "no",
        followed_original_intention: "not_yet",
        amount_received_minor: 50000,
        created_at: "2026-09-08T00:00:00Z",
      },
    });
    render(<OutcomeScreen />);
    await screen.findByRole("heading", { name: "Что произошло?" });
    fireEvent.change(
      screen.getByLabelText("Какая сумма появилась? (необязательно)"),
      { target: { value: "500" } },
    );
    fireEvent.change(
      screen.getByLabelText("Откуда пришло событие? (необязательно)"),
      {
        target: { value: "gift" },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Сохранить результат" }),
    );
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith(
        "/api/v1/intentions/{intention_id}/outcome",
        expect.objectContaining({
          body: expect.objectContaining({
            resolution: "happened",
            amount_received_minor: 50000,
            source_type: "gift",
            was_expected: "no",
          }),
          headers: { "X-CSRF-Token": "csrf" },
        }),
      ),
    );
    expect(
      screen.getByRole("heading", { name: "Результат сохранён" }),
    ).toBeInTheDocument();
  });

  it("offers uncertain closure without a negative evaluation", async () => {
    mocks.mode = "close";
    render(<OutcomeScreen />);
    expect(
      await screen.findByText(/Это не оценка эксперимента/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Не уверен" }));
    expect(
      screen.getByText("Сохраним это как результат твоего эксперимента."),
    ).toBeInTheDocument();
  });
});
