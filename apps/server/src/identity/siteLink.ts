export const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function siteLink(clientOrigin: string, path: string, token?: string): string {
  const base = clientOrigin.split(",")[0]!.trim().replace(/\/+$/, "");
  return token === undefined ? `${base}${path}` : `${base}${path}?token=${encodeURIComponent(token)}`;
}
