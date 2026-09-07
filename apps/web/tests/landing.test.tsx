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

import { Landing } from "../src/features/auth/landing";

describe("Landing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue({ error: { status: 401 } });
  });

  it("creates an anonymous session transparently and opens onboarding", async () => {
    mocks.post.mockResolvedValue({
      data: { user: { onboarding_completed: false } },
    });
    render(<Landing />);

    fireEvent.click(screen.getByRole("button", { name: "Попробовать" }));

    await waitFor(() => {
      expect(mocks.post).toHaveBeenCalledWith("/api/v1/auth/anonymous");
      expect(mocks.push).toHaveBeenCalledWith("/onboarding");
    });
  });

  it("opens recovery from the landing CTA", () => {
    render(<Landing />);
    fireEvent.click(
      screen.getByRole("button", { name: "У меня уже есть код" }),
    );
    expect(mocks.push).toHaveBeenCalledWith("/recover");
  });
});
