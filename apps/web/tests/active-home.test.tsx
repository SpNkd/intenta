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
  usePathname: () => "/home",
}));

vi.mock("@intenta/api-client", () => ({
  api: { GET: mocks.get, POST: mocks.post },
}));

import { ActiveHome } from "../src/features/intentions/active-home";

const activeIntention = {
  id: "intention-id",
  status: "active",
  amount_minor: 50000,
  currency: "RUB",
  intention_text_raw: "Куплю себе книгу",
  observation_day: 8,
  reflection_due: true,
};

describe("ActiveHome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockImplementation((path: string) =>
      Promise.resolve(
        path === "/api/v1/intentions/current"
          ? { data: activeIntention }
          : { data: { csrf_token: "csrf" } },
      ),
    );
  });

  it("offers a non-blocking reflection prompt and defers it", async () => {
    mocks.post.mockResolvedValue({
      data: { ...activeIntention, reflection_due: false },
    });
    render(<ActiveHome />);

    expect(
      await screen.findByRole("heading", { name: "Как прошло наблюдение?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Кажется, случилось" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Продолжить наблюдение" }),
    );

    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith(
        "/api/v1/intentions/{intention_id}/reflection-deferral",
        {
          params: { path: { intention_id: "intention-id" } },
          headers: { "X-CSRF-Token": "csrf" },
        },
      ),
    );
  });

  it("routes an uncertain reflection response to the existing closure flow", async () => {
    render(<ActiveHome />);
    await screen.findByRole("heading", { name: "Как прошло наблюдение?" });
    fireEvent.click(screen.getByRole("button", { name: "Не уверен" }));
    expect(mocks.push).toHaveBeenCalledWith(
      "/outcome/intention-id?mode=close&resolution=uncertain",
    );
  });
});
