import { supabase } from "./supabase";

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

export async function ensureAnonymousSession() {
  const { data: existing } = await supabase.auth.getSession();
  if (existing.session) return existing.session;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.session)
    throw error ?? new Error("Anonymous sign-in did not return a session");
  await supabase
    .from("profiles")
    .upsert({ id: data.session.user.id }, { onConflict: "id" });
  return data.session;
}

/**
 * Converts the current anonymous identity into an invisible password identity.
 * Supabase retains only its password hash; this function never persists secret.
 */
export async function attachRecoveryCode(
  publicId: string,
  secret: string,
): Promise<void> {
  const email = `${publicId.toLowerCase()}@recovery.intenta.invalid`;
  const { error: authError } = await supabase.auth.updateUser({
    email,
    password: secret,
  });
  if (authError) throw authError;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user)
    throw userError ?? new Error("Missing current user");
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      recovery_public_id: publicId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userData.user.id);
  if (profileError) throw profileError;
}

export async function recoverWithCode(
  publicId: string,
  secret: string,
): Promise<void> {
  const email = `${publicId.toLowerCase()}@recovery.intenta.invalid`;
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: secret,
  });
  if (error)
    throw new Error(
      "Не удалось восстановить доступ. Проверь код и попробуй ещё раз.",
    );
}
