const databaseName = "intenta-vault";
const storeName = "keys";
const deviceKeyName = "device-content-key";
const recoveryKeyName = "recovery-content-key";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function readKey(): Promise<CryptoKey | undefined> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).get(deviceKeyName);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as CryptoKey | undefined);
  });
}

async function writeKey(key: CryptoKey): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(key, deviceKeyName);
    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => resolve();
  });
}

export async function getStoredRecoveryContentKey(): Promise<
  CryptoKey | undefined
> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).get(recoveryKeyName);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as CryptoKey | undefined);
  });
}

export async function storeRecoveryContentKey(key: CryptoKey): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(key, recoveryKeyName);
    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => resolve();
  });
}

/** A device-only, non-exportable key used before the user receives a recovery code. */
export async function getDeviceContentKey(): Promise<CryptoKey> {
  const existing = await readKey();
  if (existing) return existing;
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  await writeKey(key);
  return key;
}
