import type { Response } from "express";
import { z } from "zod";

/**
 * How `/mcp/studio` checks a delegated token (ADR 0073, design D7 "M1a implementation record").
 * This server never decides who a token belongs to: it asks the room server, over HTTP, about the
 * bearer the host sent, on every request, and keeps nothing. The answer's `aud` must be this
 * resource, so a token for another resource is refused here as well as there.
 */

export const STUDIO_ACCESS_PATH = "/mcp/studio";
export const STUDIO_ACCESS_SCOPE = "studio:build";

const INTROSPECTION_TIMEOUT_MS = 10_000;
const BEARER = /^Bearer (szs_at_[A-Za-z0-9_-]{43})$/;

export interface StudioAccessOptions {
  /** The website's origin, as the room server's STUDIO_PUBLIC_ORIGIN. The resource is `<origin>/mcp/studio`. */
  publicOrigin: string;
}

const Introspection = z.union([
  z.object({ active: z.literal(false) }),
  z.object({ active: z.literal(true), aud: z.string(), scope: z.string(), exp: z.number(), builds: z.array(z.string()) }),
]);

export class StudioAccess {
  readonly resource: string;
  readonly metadataUrl: string;

  constructor(private options: StudioAccessOptions & { roomServerUrl: string }) {
    this.resource = `${options.publicOrigin}${STUDIO_ACCESS_PATH}`;
    this.metadataUrl = `${options.publicOrigin}/.well-known/oauth-protected-resource${STUDIO_ACCESS_PATH}`;
  }

  /**
   * The token, when the room server says it is live for this resource; null when it says it isn't;
   * "unavailable" when it couldn't say (busy, limited or down), which is no reason to drop a token.
   * Anything the request carries besides its `Authorization` header, such as host metadata naming a
   * user, plays no part.
   */
  async verify(header: string | undefined, clientAddress: string): Promise<string | null | "unavailable"> {
    const token = header?.match(BEARER)?.[1];
    if (!token) return null;
    const response = await fetch(`${this.options.roomServerUrl}/api/oauth/introspect`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(INTROSPECTION_TIMEOUT_MS),
      // So the room server's limit on invalid tokens stays per client, as for passes (ADR 0052).
      headers: { authorization: `Bearer ${token}`, "x-forwarded-for": clientAddress },
    });
    if (!response.ok) return "unavailable";
    const answer = Introspection.safeParse(await response.json().catch(() => null));
    if (!answer.success || !answer.data.active) return null;
    const { aud, scope } = answer.data;
    return aud === this.resource && scope.split(" ").includes(STUDIO_ACCESS_SCOPE) ? token : null;
  }

  /** The room server couldn't check the token: try again, keeping it. Not a 401, which tells the host to discard it. */
  unavailable(res: Response) {
    res.setHeader("Retry-After", "5");
    res.setHeader("Cache-Control", "no-store");
    res.status(503).json({ jsonrpc: "2.0", error: { code: -32000, message: "Session Zero can't check this connection right now. Try again in a moment." }, id: null });
  }

  /** RFC 9728 §5.1: where to find how to get a token, which is how the host starts or restarts sign-in. */
  challenge(res: Response, hadToken: boolean) {
    const error = hadToken ? ', error="invalid_token", error_description="The connection has ended or is not valid. Reconnect."' : "";
    res.setHeader("WWW-Authenticate", `Bearer resource_metadata="${this.metadataUrl}", scope="${STUDIO_ACCESS_SCOPE}"${error}`);
    res.setHeader("Cache-Control", "no-store");
    // `data` names the reason the way a tool error does, so an open Studio view that gets this
    // back through its host can tell access ended (and clear what it shows) from a dropped call.
    res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Connect Session Zero to use these tools.", data: { "sessionzero/error": { status: 401, code: "access" } } }, id: null });
  }
}
