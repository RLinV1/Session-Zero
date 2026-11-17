import { createHash, randomBytes } from "node:crypto";
import type { HttpAccount } from "./helpers";

/**
 * A synthetic AI app going through delegated Studio access (ADR 0073, design D7) the way ChatGPT
 * did in M0: dynamic registration as a public client, then authorization code with PKCE (S256)
 * and the `resource` parameter. Only synthetic accounts and hosts are used.
 */

export const TEST_ORIGIN = "https://studio.test.invalid";
export const TEST_RESOURCE = `${TEST_ORIGIN}/mcp/studio`;
export const TEST_REDIRECT = "https://ai-app.test.invalid/oauth/callback";

export interface StudioTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export const pkcePair = () => {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
};

export async function registerClient(base: string, over: Record<string, unknown> = {}) {
  const res = await fetch(`${base}/api/oauth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "Test AI app", redirect_uris: [TEST_REDIRECT], token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], ...over,
    }),
  });
  return res;
}

export const form = (fields: Record<string, string>) => ({
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(fields).toString(),
});

export function authorizeParams(clientId: string, challenge: string, over: Record<string, string> = {}) {
  return {
    response_type: "code", client_id: clientId, redirect_uri: TEST_REDIRECT, state: "s-123", scope: "studio:build",
    resource: TEST_RESOURCE, code_challenge: challenge, code_challenge_method: "S256", ...over,
  };
}

/** The owner allows `buildIds` on the consent page; returns the redirect it sends the browser to. */
export async function consent(account: HttpAccount, params: Record<string, string>, buildIds: string[], decision: "allow" | "deny" = "allow") {
  return account.request("POST", "/api/oauth/authorize", { params, decision, buildIds });
}

export async function exchange(base: string, fields: Record<string, string>) {
  return fetch(`${base}/api/oauth/token`, form(fields));
}

/** The whole flow: register, consent for `buildIds`, exchange the code. */
export async function connectStudio(base: string, account: HttpAccount, buildIds: string[]) {
  const client = await (await registerClient(base)).json() as { client_id: string };
  const { verifier, challenge } = pkcePair();
  const params = authorizeParams(client.client_id, challenge);
  const allowed = await consent(account, params, buildIds);
  if (allowed.status !== 200) throw new Error(`consent ${allowed.status} ${await allowed.text()}`);
  const redirect = new URL((await allowed.json() as { redirectTo: string }).redirectTo);
  const code = redirect.searchParams.get("code")!;
  const res = await exchange(base, {
    grant_type: "authorization_code", code, redirect_uri: TEST_REDIRECT, client_id: client.client_id, code_verifier: verifier, resource: TEST_RESOURCE,
  });
  if (res.status !== 200) throw new Error(`token ${res.status} ${await res.text()}`);
  return { clientId: client.client_id, tokens: await res.json() as StudioTokens, code, verifier };
}

export const bearer = (token: string, extra: Record<string, string> = {}) => ({ authorization: `Bearer ${token}`, ...extra });
