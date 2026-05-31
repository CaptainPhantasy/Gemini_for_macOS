export function resolveConfiguredHeaders(
  headers: Record<string, string> | undefined,
  env: Record<string, string> | undefined,
): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers || {})) {
    resolved[key] = value.replace(/\$\{([^}]+)\}/g, (_match, name: string) => env?.[name] || process.env[name] || '');
  }
  return resolved;
}
