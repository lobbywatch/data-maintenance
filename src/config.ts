export function get(
  key:
    "db_user" | "db_password" | "oidc_server" | "oidc_client_id" | "base_url",
): string {
  const fullKey = `LW_${key.toUpperCase()}`;
  if (process.env[fullKey]) {
    return process.env[fullKey];
  }
  throw new Error(`${fullKey} not in env`);
}
