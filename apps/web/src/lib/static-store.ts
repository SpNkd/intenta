import { decryptValue, deriveContentKey, encryptValue } from "./crypto";
import {
  getDeviceContentKey,
  getStoredRecoveryContentKey,
  storeRecoveryContentKey,
} from "./key-vault";
import {
  attachRecoveryCode,
  createRecoveryCode,
  ensureAnonymousSession,
  recoverWithCode,
} from "./static-auth";
import { getRemoteProfile, putRemoteState } from "./yandex-api";

export type StaticOutcome = {
  resolution: "happened" | "not_happened" | "uncertain";
  outcomeType: "money" | "other_amount" | "opportunity" | "similar" | "other" | "none";
  sourceType?:
    | "gift"
    | "refund"
    | "bonus_or_cashback"
    | "extra_income"
    | "found_money"
    | "saving_or_discount"
    | "other";
  amountReceivedMinor?: number;
  wasExpected?: "yes" | "no" | "unsure";
  spending?: "yes" | "not_yet" | "chose_other" | "did_not_spend";
  note?: string;
  createdAt: string;
};

export type StaticIntention = {
  id: string;
  amount: number;
  text: string;
  statement: string;
  status: "draft" | "active" | "completed";
  createdAt: string;
  activatedAt?: string;
  completedAt?: string;
  // String values are retained so drafts made by the first static build keep
  // opening correctly; all new outcomes use the complete object above.
  outcome?: StaticOutcome | StaticOutcome["resolution"];
};

export type StaticState = {
  onboarding: boolean;
  intentions: StaticIntention[];
  // This is encrypted together with the rest of the local state. It is only
  // navigation context, never a recovery secret.
  lastScreen?:
    | "landing"
    | "onboarding"
    | "amount"
    | "write"
    | "paper"
    | "technique"
    | "active"
    | "outcome"
    | "outcome-summary"
    | "history"
    | "detail";
  selectedIntentionId?: string;
};
const amounts = [500, 1000, 2000, 5000, 10000];

/**
 * The first static build permitted duplicate drafts and duplicate completion
 * writes. A step is identified by its fixed amount, so retain exactly one
 * record for it: a completed record wins; otherwise an active one wins over a
 * draft. The newest record of that kind is retained.
 */
export function normalizeState(state: StaticState): StaticState {
  const byAmount = new Map<number, StaticIntention[]>();
  for (const intention of state.intentions) {
    const current = byAmount.get(intention.amount) ?? [];
    current.push(intention);
    byAmount.set(intention.amount, current);
  }

  const kept = new Set<string>();
  for (const intentions of byAmount.values()) {
    const newest = (items: StaticIntention[]) =>
      [...items].sort((left, right) =>
        (right.completedAt ?? right.activatedAt ?? right.createdAt).localeCompare(
          left.completedAt ?? left.activatedAt ?? left.createdAt,
        ),
      )[0];
    const completed = intentions.filter((item) => item.status === "completed");
    const active = intentions.filter((item) => item.status === "active");
    const draft = intentions.filter((item) => item.status === "draft");
    const winner =
      (completed.length ? newest(completed) : undefined) ??
      (active.length ? newest(active) : undefined) ??
      (draft.length ? newest(draft) : undefined);
    if (winner) kept.add(winner.id);
  }

  return {
    ...state,
    intentions: state.intentions.filter((intention) => kept.has(intention.id)),
    selectedIntentionId: kept.has(state.selectedIntentionId ?? "")
      ? state.selectedIntentionId
      : undefined,
  };
}

type Profile = {
  recovery_public_id: string | null;
  encrypted_state: string | null;
  state_iv: string | null;
};

let profilePromise: Promise<Profile> | undefined;

function resetProfileCache(): void {
  profilePromise = undefined;
}

async function profile(): Promise<Profile> {
  if (!profilePromise) {
    profilePromise = (async () => {
      await ensureAnonymousSession();
      return (await getRemoteProfile()) as Profile;
    })().catch((error) => {
      profilePromise = undefined;
      throw error;
    });
  }
  return profilePromise;
}

export async function hasRecoveryCredential(): Promise<boolean> {
  return Boolean((await profile()).recovery_public_id);
}

async function keyFor(profileData: Profile): Promise<CryptoKey> {
  if (!profileData.recovery_public_id) return getDeviceContentKey();
  const key = await getStoredRecoveryContentKey();
  if (!key) throw new Error("RECOVERY_REQUIRED");
  return key;
}

export async function loadState(): Promise<StaticState> {
  const profileData = await profile();
  if (!profileData.encrypted_state || !profileData.state_iv)
    return { onboarding: false, intentions: [] };
  const decoded = await decryptValue<StaticState>(
    {
      ciphertext: profileData.encrypted_state,
      iv: profileData.state_iv,
      version: 1,
    },
    await keyFor(profileData),
  );
  const normalized = normalizeState(decoded);
  if (JSON.stringify(decoded) !== JSON.stringify(normalized)) {
    await saveState(normalized);
  }
  return normalized;
}

export async function saveState(state: StaticState): Promise<void> {
  const profileData = await profile();
  const encrypted = await encryptValue(state, await keyFor(profileData));
  await putRemoteState(encrypted.ciphertext, encrypted.iv);
}

export function nextAmount(state: StaticState): number | undefined {
  const completed = new Set(
    state.intentions
      .filter((item) => item.status === "completed")
      .map((item) => item.amount),
  );
  return amounts.find((amount) => !completed.has(amount));
}

export async function issueRecovery(state: StaticState): Promise<string> {
  await profile();
  const recovery = createRecoveryCode();
  await attachRecoveryCode(recovery.publicId, recovery.secret);
  const recoveryKey = await deriveContentKey(
    recovery.secret,
    recovery.publicId,
  );
  const encrypted = await encryptValue(state, recoveryKey);
  await putRemoteState(encrypted.ciphertext, encrypted.iv);
  await storeRecoveryContentKey(recoveryKey);
  resetProfileCache();
  return recovery.code;
}

export async function recover(code: string): Promise<StaticState> {
  const match =
    /^INTENTA-([0-9A-HJKMNP-TV-Z]{8})-([0-9A-HJKMNP-TV-Z]{20})$/i.exec(
      code.trim(),
    );
  if (!match) throw new Error("INVALID_CODE");
  const publicId = match[1].toUpperCase();
  const secret = match[2].toUpperCase();
  await recoverWithCode(publicId, secret);
  resetProfileCache();
  await storeRecoveryContentKey(await deriveContentKey(secret, publicId));
  return loadState();
}
