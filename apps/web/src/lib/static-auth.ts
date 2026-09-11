import { getStoredApiSession } from "./key-vault";
import {
  bootstrapApiSession,
  issueRemoteRecovery,
  recoverRemote,
} from "./yandex-api";

const recoveryAlphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
let creatingSession: Promise<void> | undefined;

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
  if (await getStoredApiSession()) return;
  if (!creatingSession) {
    creatingSession = bootstrapApiSession().then(() => undefined).catch((error) => {
      creatingSession = undefined;
      throw error;
    });
  }
  await creatingSession;
}

export async function attachRecoveryCode(
  publicId: string,
  secret: string,
  encryptedState: string,
  stateIv: string,
): Promise<void> {
  await issueRemoteRecovery(publicId, secret, encryptedState, stateIv);
}

export async function recoverWithCode(
  publicId: string,
  secret: string,
): Promise<void> {
  await recoverRemote(publicId, secret);
}
