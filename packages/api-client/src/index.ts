import createClient from "openapi-fetch";

import type { paths } from "./generated/schema";

export type { components, operations, paths } from "./generated/schema";

export function createApiClient(baseUrl = "") {
  return createClient<paths>({ baseUrl });
}

export const api = createApiClient();
