import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

vi.mock("@intenta/api-client", () => ({
  api: { GET: mocks.get, POST: mocks.post },
}));

import { OnboardingFlow } from "../src/features/onboarding/onboarding-flow";

describe("OnboardingFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockImplementation((path: string) =>
      Promise.resolve(
        path === "/api/v1/me"
          ? { data: { onboarding_completed: false, flow_state: "onboarding" } }
          : { data: { csrf_token: "csrf-value" } },
      ),
    );
    mocks.post.mockResolvedValue({ data: { onboarding_completed: true } });
  });

  it("shows all four product steps and records completion", async () => {
    render(<OnboardingFlow />);

    expect(
      await screen.findByText(
        "Интента предложит небольшую сумму для личного эксперимента.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Дальше" }));
    expect(screen.getByText(/Заранее выберешь/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Дальше" }));
    expect(
      screen.getByText("Запишешь своё намерение от руки."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Дальше" }));
    expect(screen.getByText(/просто живи как обычно/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Начать" }));

    await waitFor(() => {
      expect(mocks.post).toHaveBeenCalledWith(
        "/api/v1/me/onboarding-completion",
        { headers: { "X-CSRF-Token": "csrf-value" } },
      );
      expect(mocks.push).toHaveBeenCalledWith("/intention");
    });
  });
});
