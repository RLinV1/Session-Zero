export function errorTag(err: unknown): string {
  if (!(err instanceof Error)) return "non-error";
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" || typeof code === "number" ? `${err.name} ${code}` : err.name;
}
