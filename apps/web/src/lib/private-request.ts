type ApiResult = { response?: { status?: number } };

export function isUnauthorized(result: ApiResult): boolean {
  return result.response?.status === 401;
}
