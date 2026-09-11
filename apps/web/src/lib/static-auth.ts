import { supabase } from "./supabase";
import {
  ApiError,
  bootstrapApiSession,
  claimLegacyApiSession,
  getRemoteProfile,
  issueRemoteRecovery,
  recoverRemote,
} from "./yandex-api";

const recoveryAlphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function randomCrockford(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(
    bytes,
    (byte) => recoveryAlphabet[byte % recoveryAlphabet.length],
  ).join("");
}

export function createRecoveryCode(): {
  code: string;
  publicId: string;
  secret: string;
} {
  const publicId = randomCrockford(8);
  const secret = randomCrockford(20);
  return { code: `INTENTA-${publicId}-${secret}`, publicId, secret };
}

export async function ensureAnonymousSession(): Promise<void> {
  try {
    await getRemoteProfile();
    return;
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
  }

  // This bridge is temporary: it proves the existing Supabase access token
  // server-side, then reuses the already imported opaque profile in YDB.
  const { data: existing } = await supabase.auth.getSession();
  if (existing.session) {
    await claimLegacyApiSession(existing.session.user.id, existing.session.access_token);
    return;
  }
  await bootstrapApiSession();
}

/**
 * Converts the current anonymous identity into an invisible password identity.
 * Supabase retains only its password hash; this function never persists secret.
 */
export async function attachRecoveryCode(
  publicId: string,
  secret: string,
): Promise<void> {
  await issueRemoteRecovery(publicId, secret);
}

export async function recoverWithCode(
  publicId: string,
  secret: string,
): Promise<void> {
  try {
    await recoverRemote(publicId, secret);
  } catch (error) {
    // Existing codes are still verified by Supabase during the transition.
    // Once confirmed, ensureAnonymousSession claims the matching opaque YDB row.
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    const email = `${publicId.toLowerCase()}@recovery.intenta.invalid`;
    const { error: legacyError } = await supabase.auth.signInWithPassword({
      email,
      password: secret,
    });
    if (legacyError) {
      throw new Error("Не удалось восстановить доступ. Проверь код и попробуй ещё раз.");
    }
    await ensureAnonymousSession();
  }
}
