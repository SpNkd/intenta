import {
  clearApiSession,
  getStoredApiSession,
  storeApiSession,
} from "./key-vault";

const baseUrl = process.env.NEXT_PUBLIC_YANDEX_API_URL;

export type RemoteProfile = {
  recovery_public_id?: string | null;
  encrypted_state?: string | null;
  state_iv?: string | null;
};

type SessionResponse = { token: string; profile: RemoteProfile };

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  session = true,
): Promise<T> {
  if (!baseUrl) throw new Error("Yandex API configuration is required");
  const token = session ? await getStoredApiSession() : undefined;
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
  } & T;
  if (!response.ok) throw new ApiError(response.status, body.error ?? "API request failed");
  return body;
}

async function acceptSession(response: SessionResponse): Promise<RemoteProfile> {
  await storeApiSession(response.token);
  return response.profile;
}

export async function bootstrapApiSession(): Promise<RemoteProfile> {
  return acceptSession(await request<SessionResponse>("/bootstrap", { method: "POST", body: "{}" }, false));
}

export async function getRemoteProfile(): Promise<RemoteProfile> {
  return (await request<{ profile: RemoteProfile }>("/state")).profile;
}

export async function putRemoteState(
  encryptedState: string,
  stateIv: string,
): Promise<void> {
  await request("/state", {
    method: "PUT",
    body: JSON.stringify({ encrypted_state: encryptedState, state_iv: stateIv }),
  });
}

export async function issueRemoteRecovery(
  publicId: string,
  secret: string,
  encryptedState: string,
  stateIv: string,
): Promise<void> {
  await request("/recovery/issue", {
    method: "POST",
    body: JSON.stringify({
      public_id: publicId,
      secret,
      encrypted_state: encryptedState,
      state_iv: stateIv,
    }),
  });
}

export async function recoverRemote(
  publicId: string,
  secret: string,
): Promise<RemoteProfile> {
  return acceptSession(
    await request<SessionResponse>(
      "/recovery/login",
      { method: "POST", body: JSON.stringify({ public_id: publicId, secret }) },
      false,
    ),
  );
}

export async function forgetApiSession(): Promise<void> {
  await clearApiSession();
}
