import crypto from "node:crypto";
import ydb from "ydb-sdk";

const {
  Driver,
  MetadataAuthService,
  AlterTableDescription,
  Column,
  TableDescription,
  Types,
  TypedData,
  TypedValues,
} = ydb;

const allowedOrigins = new Set(
  (process.env.APP_ORIGINS ?? "https://spnkd.github.io")
    // A semicolon is accepted too so a multi-origin value is safe to pass
    // through cloud CLIs whose key=value flag uses commas as a separator.
    .split(/[;,]/)
    .map((origin) => origin.trim())
    .filter(Boolean),
);
let requestOrigin = "https://spnkd.github.io";
const database = process.env.DATABASE;
const endpoint = process.env.ENDPOINT;
const recoveryHmacKey = process.env.RECOVERY_HMAC_KEY;

let driverPromise;
let schemaPromise;

function table(columns, primaryKey) {
  return new TableDescription(
    columns.map(([name, type]) => new Column(name, type)),
    primaryKey,
  );
}

async function createIfMissing(session, name, description) {
  try {
    await session.describeTable(name);
  } catch {
    try {
      await session.createTable(name, description);
    } catch (error) {
      // A concurrent cold start may have created this table after describe.
      if (!String(error).includes("ALREADY_EXISTS")) throw error;
    }
  }
}

async function ensureSessionTtl(session) {
  const description = await session.describeTable("sessions");
  const ttl = description.ttlSettings?.dateTypeColumn;
  if (ttl?.columnName === "expires_at" && ttl.expireAfterSeconds === 0) return;
  await session.alterTable(
    "sessions",
    new AlterTableDescription().withSetTtl("expires_at", 0),
  );
}

function response(statusCode, payload, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": requestOrigin,
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
      ...extraHeaders,
    },
    body: JSON.stringify(payload),
    isBase64Encoded: false,
  };
}

function badRequest(message) {
  return response(400, { error: message });
}

function readBody(event) {
  if (!event.body) return {};
  try {
    return JSON.parse(event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body);
  } catch {
    return null;
  }
}

function randomToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function tokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function recoveryHash(publicId, secret) {
  if (!recoveryHmacKey) throw new Error("RECOVERY_HMAC_KEY is not configured");
  return crypto
    .createHmac("sha256", recoveryHmacKey)
    .update(`${publicId}:${secret}`)
    .digest("hex");
}

function validPublicId(value) {
  return typeof value === "string" && /^[0-9A-HJKMNP-TV-Z]{8}$/.test(value);
}

function validSecret(value) {
  return typeof value === "string" && /^[0-9A-HJKMNP-TV-Z]{20}$/.test(value);
}

function authorization(event) {
  const headers = event.headers ?? {};
  const value = headers.authorization ?? headers.Authorization;
  return typeof value === "string" && value.startsWith("Bearer ")
    ? value.slice("Bearer ".length)
    : undefined;
}

async function getDriver() {
  if (!endpoint || !database) throw new Error("YDB endpoint/database are not configured");
  if (!driverPromise) {
    driverPromise = (async () => {
      const driver = new Driver({
        endpoint,
        database,
        authService: new MetadataAuthService(),
      });
      if (!(await driver.ready(10_000))) {
        throw new Error("YDB driver did not become ready");
      }
      return driver;
    })();
  }
  return driverPromise;
}

async function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const driver = await getDriver();
      await driver.tableClient.withSession(async (session) => {
        await createIfMissing(session, "profiles", table([
          ["user_id", Types.UTF8],
          ["recovery_public_id", Types.optional(Types.UTF8)],
          ["recovery_secret_hash", Types.optional(Types.UTF8)],
          ["encrypted_state", Types.optional(Types.UTF8)],
          ["state_iv", Types.optional(Types.UTF8)],
          ["created_at", Types.TIMESTAMP],
          ["updated_at", Types.TIMESTAMP],
        ], ["user_id"]));
        await createIfMissing(session, "recovery_index", table([
          ["public_id", Types.UTF8],
          ["user_id", Types.UTF8],
          ["recovery_secret_hash", Types.UTF8],
        ], ["public_id"]));
        await createIfMissing(session, "sessions", table([
          ["token_hash", Types.UTF8],
          ["user_id", Types.UTF8],
          ["expires_at", Types.TIMESTAMP],
        ], ["token_hash"]).withTtl("expires_at"));
        await ensureSessionTtl(session);
      });
    })();
  }
  return schemaPromise;
}

async function query(text, parameters = {}) {
  await ensureSchema();
  const driver = await getDriver();
  return driver.tableClient.withSession((session) => session.executeQuery(text, parameters));
}

function rows(result) {
  return result.resultSets?.[0]
    ? TypedData.createNativeObjects(result.resultSets[0])
    : [];
}

async function userForToken(token) {
  if (!token) return undefined;
  const now = new Date();
  const result = await query(
    `DECLARE $token_hash AS Utf8;
     DECLARE $now AS Timestamp;
     SELECT user_id FROM sessions
     WHERE token_hash = $token_hash AND expires_at > $now;`,
    { $token_hash: TypedValues.utf8(tokenHash(token)), $now: TypedValues.timestamp(now) },
  );
  return rows(result)[0]?.user_id;
}

async function createSession(userId) {
  const token = randomToken();
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365);
  await query(
    `DECLARE $token_hash AS Utf8;
     DECLARE $user_id AS Utf8;
     DECLARE $expires_at AS Timestamp;
     UPSERT INTO sessions (token_hash, user_id, expires_at)
     VALUES ($token_hash, $user_id, $expires_at);`,
    {
      $token_hash: TypedValues.utf8(tokenHash(token)),
      $user_id: TypedValues.utf8(userId),
      $expires_at: TypedValues.timestamp(expires),
    },
  );
  return token;
}

async function currentProfile(userId) {
  const result = await query(
    `DECLARE $user_id AS Utf8;
     SELECT user_id, recovery_public_id, encrypted_state, state_iv
     FROM profiles WHERE user_id = $user_id;`,
    { $user_id: TypedValues.utf8(userId) },
  );
  return rows(result)[0];
}

/**
 * The usual authenticated read needs both the session owner and their profile.
 * Fetching them together saves one YDB round-trip versus first looking up the
 * session and then issuing a second profile query.
 */
async function authenticatedProfile(event) {
  const token = authorization(event);
  if (!token) return undefined;
  const result = await query(
    `DECLARE $token_hash AS Utf8;
     DECLARE $now AS Timestamp;
     SELECT s.user_id AS user_id,
            p.recovery_public_id AS recovery_public_id,
            p.encrypted_state AS encrypted_state,
            p.state_iv AS state_iv
     FROM sessions AS s
     LEFT JOIN profiles AS p ON p.user_id = s.user_id
     WHERE s.token_hash = $token_hash AND s.expires_at > $now;`,
    {
      $token_hash: TypedValues.utf8(tokenHash(token)),
      $now: TypedValues.timestamp(new Date()),
    },
  );
  return rows(result)[0];
}

async function requireUser(event) {
  const userId = await userForToken(authorization(event));
  if (!userId) return undefined;
  return userId;
}

async function bootstrap() {
  const userId = crypto.randomUUID();
  const now = new Date();
  await query(
    `DECLARE $user_id AS Utf8;
     DECLARE $now AS Timestamp;
     UPSERT INTO profiles (user_id, created_at, updated_at)
     VALUES ($user_id, $now, $now);`,
    { $user_id: TypedValues.utf8(userId), $now: TypedValues.timestamp(now) },
  );
  return response(201, { token: await createSession(userId), profile: {} });
}

async function getState(event) {
  const profile = await authenticatedProfile(event);
  if (!profile) return response(401, { error: "session is required" });
  return response(200, { profile: profile ?? {} });
}

async function putState(event) {
  const token = authorization(event);
  if (!token) return response(401, { error: "session is required" });
  const body = readBody(event);
  if (!body || typeof body.encrypted_state !== "string" || typeof body.state_iv !== "string") {
    return badRequest("encrypted_state and state_iv are required");
  }
  if (body.encrypted_state.length > 200_000 || body.state_iv.length > 128) {
    return badRequest("state is too large");
  }
  const result = await query(
    `DECLARE $token_hash AS Utf8;
     DECLARE $encrypted_state AS Utf8;
     DECLARE $state_iv AS Utf8;
     DECLARE $now AS Timestamp;
     $authorized = SELECT user_id FROM sessions
       WHERE token_hash = $token_hash AND expires_at > $now;
     UPDATE profiles
       SET encrypted_state = $encrypted_state, state_iv = $state_iv, updated_at = $now
       WHERE user_id IN $authorized;
     SELECT user_id FROM $authorized;`,
    {
      $token_hash: TypedValues.utf8(tokenHash(token)),
      $encrypted_state: TypedValues.utf8(body.encrypted_state),
      $state_iv: TypedValues.utf8(body.state_iv),
      $now: TypedValues.timestamp(new Date()),
    },
  );
  if (!rows(result)[0]?.user_id) {
    return response(401, { error: "session is required" });
  }
  return response(200, { ok: true });
}

async function issueRecovery(event) {
  const current = await authenticatedProfile(event);
  if (!current) return response(401, { error: "session is required" });
  const userId = current.user_id;
  const body = readBody(event);
  const publicId = body?.public_id;
  const secret = body?.secret;
  if (!validPublicId(publicId) || !validSecret(secret)) return badRequest("invalid recovery credential");
  if (
    typeof body.encrypted_state !== "string" ||
    typeof body.state_iv !== "string" ||
    body.encrypted_state.length > 200_000 ||
    body.state_iv.length > 128
  ) {
    return badRequest("encrypted_state and state_iv are required");
  }
  const existing = rows(await query(
    `DECLARE $public_id AS Utf8;
     SELECT user_id FROM recovery_index WHERE public_id = $public_id;`,
    { $public_id: TypedValues.utf8(publicId) },
  ))[0];
  if (existing && existing.user_id !== userId) {
    return response(409, { error: "recovery credential already exists" });
  }
  const secretHash = recoveryHash(publicId, secret);
  const now = new Date();
  await query(
    `DECLARE $old_public_id AS Utf8?;
     DECLARE $public_id AS Utf8;
     DECLARE $user_id AS Utf8;
     DECLARE $secret_hash AS Utf8;
     DECLARE $encrypted_state AS Utf8;
     DECLARE $state_iv AS Utf8;
     DECLARE $now AS Timestamp;
     DELETE FROM recovery_index WHERE public_id = $old_public_id;
     UPSERT INTO recovery_index (public_id, user_id, recovery_secret_hash)
     VALUES ($public_id, $user_id, $secret_hash);
     UPSERT INTO profiles (user_id, recovery_public_id, recovery_secret_hash, encrypted_state, state_iv, created_at, updated_at)
     VALUES ($user_id, $public_id, $secret_hash, $encrypted_state, $state_iv, $now, $now);`,
    {
      $old_public_id: current?.recovery_public_id
        ? TypedValues.optional(TypedValues.utf8(current.recovery_public_id))
        : TypedValues.optionalNull(Types.UTF8),
      $public_id: TypedValues.utf8(publicId),
      $user_id: TypedValues.utf8(userId),
      $secret_hash: TypedValues.utf8(secretHash),
      $encrypted_state: TypedValues.utf8(body.encrypted_state),
      $state_iv: TypedValues.utf8(body.state_iv),
      $now: TypedValues.timestamp(now),
    },
  );
  return response(200, { ok: true });
}

async function recover(event) {
  const body = readBody(event);
  const publicId = body?.public_id;
  const secret = body?.secret;
  if (!validPublicId(publicId) || !validSecret(secret)) {
    return response(401, { error: "invalid recovery credential" });
  }
  const result = await query(
    `DECLARE $public_id AS Utf8;
     SELECT user_id, recovery_secret_hash FROM recovery_index WHERE public_id = $public_id;`,
    { $public_id: TypedValues.utf8(publicId) },
  );
  const entry = rows(result)[0];
  const supplied = Buffer.from(recoveryHash(publicId, secret), "hex");
  const expected = Buffer.from(entry?.recovery_secret_hash ?? crypto.randomBytes(32).toString("hex"), "hex");
  if (!entry || supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    return response(401, { error: "invalid recovery credential" });
  }
  const profile = await currentProfile(entry.user_id);
  return response(200, { token: await createSession(entry.user_id), profile: profile ?? {} });
}

export async function handler(event) {
  try {
    const headers = event.headers ?? {};
    const origin = headers.origin ?? headers.Origin;
    requestOrigin =
      typeof origin === "string" && allowedOrigins.has(origin)
        ? origin
        : "https://spnkd.github.io";
    if (event.httpMethod === "OPTIONS") return response(204, {});
    const path = event.path ?? event.requestContext?.http?.path ?? "/";
    if (event.httpMethod === "GET" && path.endsWith("/health")) {
      await ensureSchema();
      return response(200, { ok: true });
    }
    if (event.httpMethod === "POST" && path.endsWith("/bootstrap")) return bootstrap();
    if (event.httpMethod === "GET" && path.endsWith("/state")) return getState(event);
    if (event.httpMethod === "PUT" && path.endsWith("/state")) return putState(event);
    if (event.httpMethod === "POST" && path.endsWith("/recovery/issue")) return issueRecovery(event);
    if (event.httpMethod === "POST" && path.endsWith("/recovery/login")) return recover(event);
    return response(404, { error: "not found" });
  } catch (error) {
    console.error("intenta api request failed", error instanceof Error ? error.message : "unknown error");
    return response(500, { error: "temporary server error" });
  }
}
