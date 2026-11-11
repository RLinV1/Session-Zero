import { randomBytes } from "node:crypto";
import { Email } from "@vtt/shared";
import { hashPassword } from "../identity/passwords";
import { PostgresRoomStore } from "../store/postgresRoomStore";

/**
 * Operator password reset (ADR 0017 I5), until self-service reset exists. Gives the account a
 * random temporary password, ends every one of its sessions (and the seats bound to them), and
 * prints the password once. It has no HTTP route: only someone with the database can run it.
 *
 *   DATABASE_URL=postgres://… npm run account:reset-password --workspace=@vtt/server -- sam@example.com
 */
async function main() {
  const url = process.env.DATABASE_URL;
  const email = Email.safeParse(process.argv[2] ?? "");
  if (!url || !email.success) {
    console.error("Usage: DATABASE_URL=… npm run account:reset-password --workspace=@vtt/server -- <email>");
    process.exitCode = 2;
    return;
  }
  const store = await PostgresRoomStore.connect(url);
  try {
    const user = await store.findUserByEmail(email.data);
    if (!user) {
      console.error(`No account for ${email.data}`);
      process.exitCode = 1;
      return;
    }
    const temporary = randomBytes(12).toString("base64url");
    await store.setPasswordHash(user.id, await hashPassword(temporary), true);
    const ended = await store.deleteUserSessions(user.id);
    await store.endBuildPasses(user.ownerId);
    console.log(`Reset ${user.email}. Every session ended (${ended.credentialHashes.length} device seat(s) closed).`);
    console.log(`Temporary password (shown once): ${temporary}`);
  } finally {
    await store.close();
  }
}

await main();
