const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type EncryptedValue = {
  ciphertext: string;
  iv: string;
  version: 1;
};

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded =
    value.replaceAll("-", "+").replaceAll("_", "/") +
    "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function asBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

/**
 * Derives a non-exportable AES key locally. The recovery secret is never sent
 * to the database and is intentionally not persisted by this module.
 */
export async function deriveContentKey(
  recoverySecret: string,
  publicId: string,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(recoverySecret),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode(`intenta-content-v1:${publicId}`),
      iterations: 310_000,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptValue(
  value: unknown,
  key: CryptoKey,
): Promise<EncryptedValue> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext,
  );
  return {
    ciphertext: toBase64Url(new Uint8Array(ciphertext)),
    iv: toBase64Url(iv),
    version: 1,
  };
}

export async function decryptValue<T>(
  value: EncryptedValue,
  key: CryptoKey,
): Promise<T> {
  if (value.version !== 1)
    throw new Error("Unsupported encrypted value version");
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: asBuffer(fromBase64Url(value.iv)) },
    key,
    asBuffer(fromBase64Url(value.ciphertext)),
  );
  return JSON.parse(decoder.decode(plaintext)) as T;
}
