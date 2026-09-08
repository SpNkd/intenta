import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));
vi.mock("@intenta/api-client", () => ({
  api: { GET: mocks.get, POST: mocks.post, PATCH: mocks.patch },
}));

import { IntentionEntry } from "../src/features/intentions/intention-entry";
import { PaperWriting } from "../src/features/intentions/paper-writing";
import { TechniqueScreen } from "../src/features/intentions/technique-screen";

const draft = {
  id: "draft-id",
  amount_minor: 50000,
  currency: "RUB",
  intention_text_raw: "Куплю себе наушники",
  intention_statement: "Сохранённый statement",
  technique: {
    title: "Остановись на минуту",
    instruction: "Прочитай написанное один раз.",
  },
};

describe("intention flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows backend amount, creates draft and opens paper screen", async () => {
    mocks.get.mockImplementation((path: string) =>
      Promise.resolve(
        path === "/api/v1/me"
          ? { data: { onboarding_completed: true } }
          : path === "/api/v1/auth/csrf"
            ? { data: { csrf_token: "csrf" } }
            : path === "/api/v1/experiment/next"
              ? { data: { amount_minor: 50000, currency: "RUB" } }
              : { data: undefined },
      ),
    );
    mocks.post.mockResolvedValue({ data: draft });
    render(<IntentionEntry />);
    expect(
      await screen.findByRole("heading", { name: "500 ₽" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));
    fireEvent.change(screen.getByLabelText("Моё намерение"), {
      target: { value: "Куплю себе наушники" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Сохранить намерение" }),
    );
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/intention/paper"),
    );
  });

  it("shows an API error without leaving the form", async () => {
    mocks.get.mockImplementation((path: string) =>
      Promise.resolve(
        path === "/api/v1/me"
          ? { data: { onboarding_completed: true } }
          : path === "/api/v1/auth/csrf"
            ? { data: { csrf_token: "csrf" } }
            : path === "/api/v1/experiment/next"
              ? { data: { amount_minor: 50000, currency: "RUB" } }
              : { data: undefined },
      ),
    );
    mocks.post.mockResolvedValue({ error: { status: 500 } });
    render(<IntentionEntry />);
    await screen.findByRole("heading", { name: "500 ₽" });
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));
    fireEvent.change(screen.getByLabelText("Моё намерение"), {
      target: { value: "Куплю себе книгу" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Сохранить намерение" }),
    );
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("shows the terminal state when the configured experiment is complete", async () => {
    mocks.get.mockImplementation((path: string) =>
      Promise.resolve(
        path === "/api/v1/me"
          ? {
              data: {
                onboarding_completed: true,
                flow_state: "experiment_completed",
              },
            }
          : path === "/api/v1/auth/csrf"
            ? { data: { csrf_token: "csrf" } }
            : { data: undefined },
      ),
    );
    render(<IntentionEntry />);
    expect(
      await screen.findByRole("heading", { name: "Эксперимент завершён" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "История скоро появится" }),
    ).toBeDisabled();
  });

  it("renders stored statement and then the backend-selected technique", async () => {
    mocks.get.mockResolvedValue({ data: draft });
    const { unmount } = render(<PaperWriting />);
    expect(
      await screen.findByText("Сохранённый statement"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Я записал" }));
    expect(mocks.push).toHaveBeenCalledWith("/intention/technique");
    unmount();
    render(<TechniqueScreen />);
    expect(await screen.findByText("Остановись на минуту")).toBeInTheDocument();
    expect(
      screen.getByText("Прочитай написанное один раз."),
    ).toBeInTheDocument();
  });
});
