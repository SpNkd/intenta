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
                recovery_credential_issuable: true,
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

  it("does not offer issuance before the first activated Intention", async () => {
    mocks.get.mockImplementation((path: string) =>
      Promise.resolve(
        path === "/api/v1/me"
          ? {
              data: {
                flow_state: "ready_for_next",
                credential_exists: false,
                recovery_credential_issuable: false,
              },
            }
          : { data: { csrf_token: "csrf-value" } },
      ),
    );
    render(<RecoveryScreen />);

    expect(
      await screen.findByText(/можно выпустить после того/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Показать код" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Вернуться к Интенте" }),
    );
    expect(mocks.push).toHaveBeenCalledWith("/intention");
  });

  it("allows deferred issuance after a prior activation", async () => {
    mocks.get.mockImplementation((path: string) =>
      Promise.resolve(
        path === "/api/v1/me"
          ? {
              data: {
                flow_state: "ready_for_next",
                credential_exists: false,
                recovery_credential_issuable: true,
              },
            }
          : { data: { csrf_token: "csrf-value" } },
      ),
    );
    render(<RecoveryScreen />);

    expect(
      await screen.findByRole("button", { name: "Показать код" }),
    ).toBeInTheDocument();
  });

  it("recovers from a lost issuance response without asking for the old plaintext", async () => {
    let credentialExists = false;
    mocks.get.mockImplementation((path: string) =>
      Promise.resolve(
        path === "/api/v1/me"
          ? {
              data: {
                flow_state: "active",
                credential_exists: credentialExists,
                recovery_credential_issuable: true,
              },
            }
          : { data: { csrf_token: "csrf-value" } },
      ),
    );
    mocks.post.mockResolvedValue({ data: undefined });
    render(<RecoveryScreen />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Показать код" }),
    );
    credentialExists = true;

    await waitFor(() =>
      expect(
        screen.getByText(/Предыдущий код перестанет работать/),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "Создать новый код" }),
    ).toBeInTheDocument();
  });
});
