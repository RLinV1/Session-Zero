import { randomUUID } from "node:crypto";
import type { RoomStore } from "../store/roomStore";
import { EmailTakenError } from "../store/identityStore";
import { hashPassword } from "./passwords";

export const DEV_ACCOUNT = { email: "t@gmail.com", password: "password", displayName: "Test GM" } as const;

/**
 * A known account for local development, so a fresh database needs no sign-up.
 * Opt-in (`SEED_DEV_ACCOUNT=1`, set by docker-compose.yml) and never in production: the
 * password is public. Returns whether it created the account.
 */
export async function seedDevAccount(store: RoomStore, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  if (env.SEED_DEV_ACCOUNT !== "1" || env.NODE_ENV === "production") return false;
  try {
    await store.createUser({
      id: randomUUID(),
      email: DEV_ACCOUNT.email,
      displayName: DEV_ACCOUNT.displayName,
      passwordHash: await hashPassword(DEV_ACCOUNT.password),
      emailVerifiedAt: new Date().toISOString(),
    });
    console.log(`[vtt] seeded dev account ${DEV_ACCOUNT.email}`);
    return true;
  } catch (err) {
    if (err instanceof EmailTakenError) return false;
    throw err;
  }
}
