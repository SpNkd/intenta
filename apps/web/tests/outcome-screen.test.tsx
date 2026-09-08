import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  mode: "happened",
  resolution: null as string | null,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ intentionId: "intention-id" }),
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useSearchParams: () => ({
    get: (key: string) => (key === "mode" ? mocks.mode : mocks.resolution),
  }),
}));

vi.mock("@intenta/api-client", () => ({
  api: { GET: mocks.get, POST: mocks.post },
}));

import {
  MAX_OUTCOME_AMOUNT_MINOR,
  OutcomeScreen,
  parseOutcomeAmountToMinor,
} from "../src/features/outcomes/outcome-screen";

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
    mocks.resolution = null;
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
    expect(
      screen.getByRole("button", { name: "Сохранить результат" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "Нет" }));
    fireEvent.change(screen.getByLabelText("Потратил ли на записанное?"), {
      target: { value: "not_yet" },
    });
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
      await screen.findByRole("heading", { name: "Результат сохранён" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Продолжить эксперимент" }),
    );
    expect(mocks.push).toHaveBeenCalledWith("/intention");
    fireEvent.click(screen.getByRole("button", { name: "Посмотреть историю" }));
    expect(mocks.push).toHaveBeenCalledWith("/history");
  });

  it("requires deliberate happened answers and rejects an invalid amount before sending", async () => {
    render(<OutcomeScreen />);
    await screen.findByRole("heading", { name: "Что произошло?" });
    expect(screen.getByRole("radio", { name: "Да" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Нет" })).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: "Сохранить результат" }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole("radio", { name: "Нет" }));
    fireEvent.change(screen.getByLabelText("Потратил ли на записанное?"), {
      target: { value: "not_yet" },
    });
    fireEvent.change(
      screen.getByLabelText("Какая сумма появилась? (необязательно)"),
      { target: { value: "100000000.01" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Сохранить результат" }),
    );

    expect(
      await screen.findByText(
        "Укажи сумму от 0 до 100 000 000 ₽ с точностью до копейки.",
      ),
    ).toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("parses amount strings exactly within the fixed safe range", () => {
    expect(parseOutcomeAmountToMinor("100000000")).toBe(
      MAX_OUTCOME_AMOUNT_MINOR,
    );
    expect(parseOutcomeAmountToMinor("100000000.01")).toBeNull();
    expect(parseOutcomeAmountToMinor("90071992547409.92")).toBeNull();
    expect(parseOutcomeAmountToMinor("12,34")).toBe(1234);
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

  it("uses a reflection-selected closure resolution", async () => {
    mocks.mode = "close";
    mocks.resolution = "uncertain";
    render(<OutcomeScreen />);
    expect(
      await screen.findByText(
        "Сохраним это как результат твоего эксперимента.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Ничего не произошло" }),
    ).toBeNull();
  });
});
