export function parseBearerToken(authorizationHeader) {
  if (!authorizationHeader) {
    return { token: null, error: "missing" };
  }

  const match = authorizationHeader.trim().match(/^Bearer\s+(\S+)$/i);

  if (!match) {
    return { token: null, error: "malformed" };
  }

  return { token: match[1], error: null };
}
