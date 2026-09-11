/**
 * One-time, idempotent transfer of opaque Supabase profile blobs to YDB.
 *
 * Required environment variables are deliberately not read from a file:
 * SUPABASE_ACCESS_TOKEN, YC_IAM_TOKEN, YDB_ENDPOINT and YDB_DATABASE.
 * The script never decrypts or logs a user's state and never exports a
 * recovery secret. It leaves Supabase untouched, so it remains a rollback
 * source until the browser client has been switched and verified.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Column, Driver, TableDescription, TokenAuthService, Types, TypedValues } = require(
  "./function/node_modules/ydb-sdk",
);

const required = [
  "SUPABASE_ACCESS_TOKEN",
  "YC_IAM_TOKEN",
  "YDB_ENDPOINT",
  "YDB_DATABASE",
];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}

const supabaseResponse = await fetch(
  "https://api.supabase.com/v1/projects/ksltazqhrimgkcttehlp/database/query",
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `SELECT id, recovery_public_id, encrypted_state, state_iv,
                     created_at, updated_at
              FROM public.profiles`,
    }),
  },
);
if (!supabaseResponse.ok) {
  throw new Error(`Supabase export failed (${supabaseResponse.status})`);
}
const profiles = await supabaseResponse.json();
if (!Array.isArray(profiles)) throw new Error("Unexpected Supabase export response");

const driver = new Driver({
  endpoint: process.env.YDB_ENDPOINT,
  database: process.env.YDB_DATABASE,
  authService: new TokenAuthService(process.env.YC_IAM_TOKEN),
});
if (!(await driver.ready(10_000))) throw new Error("YDB driver is not ready");

try {
  await driver.tableClient.withSession(async (session) => {
    try {
      await session.describeTable("profiles");
    } catch {
      await session.createTable("profiles", new TableDescription([
        new Column("user_id", Types.UTF8),
        new Column("recovery_public_id", Types.optional(Types.UTF8)),
        new Column("recovery_secret_hash", Types.optional(Types.UTF8)),
        new Column("encrypted_state", Types.optional(Types.UTF8)),
        new Column("state_iv", Types.optional(Types.UTF8)),
        new Column("created_at", Types.TIMESTAMP),
        new Column("updated_at", Types.TIMESTAMP),
      ], ["user_id"]));
    }

    for (const profile of profiles) {
      await session.executeQuery(
        `DECLARE $user_id AS Utf8;
         DECLARE $recovery_public_id AS Utf8?;
         DECLARE $encrypted_state AS Utf8?;
         DECLARE $state_iv AS Utf8?;
         DECLARE $created_at AS Timestamp;
         DECLARE $updated_at AS Timestamp;
         UPSERT INTO profiles (
           user_id, recovery_public_id, encrypted_state, state_iv, created_at, updated_at
         ) VALUES (
           $user_id, $recovery_public_id, $encrypted_state, $state_iv, $created_at, $updated_at
         );`,
        {
          $user_id: TypedValues.utf8(profile.id),
          $recovery_public_id: profile.recovery_public_id
            ? TypedValues.optional(TypedValues.utf8(profile.recovery_public_id))
            : TypedValues.optionalNull(Types.UTF8),
          $encrypted_state: profile.encrypted_state
            ? TypedValues.optional(TypedValues.utf8(profile.encrypted_state))
            : TypedValues.optionalNull(Types.UTF8),
          $state_iv: profile.state_iv
            ? TypedValues.optional(TypedValues.utf8(profile.state_iv))
            : TypedValues.optionalNull(Types.UTF8),
          $created_at: TypedValues.timestamp(new Date(profile.created_at)),
          $updated_at: TypedValues.timestamp(new Date(profile.updated_at)),
        },
      );
    }
  });
  console.log(`Imported ${profiles.length} opaque profiles into YDB.`);
} finally {
  await driver.destroy();
}
