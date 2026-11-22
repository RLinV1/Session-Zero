import type { RoomStore } from "../store/roomStore";
import { EmailTakenError } from "../store/identityStore";
import { adminAccountIdsFromEnv } from "../http/adminStats";
import { hashPassword } from "./passwords";

export async function seedAdminAccount(store: RoomStore, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const email = env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = env.ADMIN_PASSWORD;
  const ids = [...adminAccountIdsFromEnv(env.ADMIN_ACCOUNT_IDS)];
  if (!email || !password || ids.length !== 1) return;
  const id = ids[0]!;
  if (await store.findUserById(id)) return;
  try {
    await store.createUser({
      id,
      email,
      displayName: "Admin",
      passwordHash: await hashPassword(password),
      emailVerifiedAt: new Date().toISOString(),
    });
  } catch (err) {
    if (!(err instanceof EmailTakenError)) throw err;
    console.warn("[vtt] ADMIN_EMAIL already belongs to another account; no admin account created");
  }
}
