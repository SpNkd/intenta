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

import { RecoveryScreen } from "../src/features/intentions/recovery-screen";

describe("RecoveryScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockImplementation((path: string) =>
      Promise.resolve(
        path === "/api/v1/me"
          ? {
              data: {
                flow_state: "active",
                credential_exists: true,
              },
            }
          : { data: { csrf_token: "csrf-value" } },
      ),
    );
  });

  it("warns and uses replacement when an existing credential cannot be shown again", async () => {
    mocks.post.mockResolvedValue({ data: { code: "INTENTA-new-code" } });
    render(<RecoveryScreen />);

    expect(
      await screen.findByText(/Предыдущий код перестанет работать/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Создать новый код" }));

    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith(
        "/api/v1/me/recovery-credential/replacement",
        { headers: { "X-CSRF-Token": "csrf-value" } },
      ),
    );
    expect(await screen.findByText("INTENTA-new-code")).toBeInTheDocument();
  });
});
