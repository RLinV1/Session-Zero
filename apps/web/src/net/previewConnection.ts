import type { CommandResult, RoomConnection } from "./roomConnection";

import { t } from "../i18n/locale";
/**
 * A connection that refuses to send while `isReadOnly()` is true (gm-view-as-player). Everything
 * reads through to the real connection; commands are refused locally and ephemeral messages
 * (pings, drag previews) are dropped, so nothing ever goes out in the previewed player's name or
 * the GM's while the GM looks through that player's eyes. `isReadOnly` is read on every call, so
 * the same object serves before, during and after a preview: nothing that holds it has to be
 * rebuilt when the preview starts or ends.
 */
export function guardedConnection(
  connection: RoomConnection,
  isReadOnly: () => boolean,
  name = t("preview.aPlayer"),
  message = t("preview.refused", { name }),
): RoomConnection {
  const refused = async (): Promise<CommandResult> => ({ ok: false, code: "forbidden", message });
  return new Proxy(connection, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (prop === "command") return (...args: Parameters<RoomConnection["command"]>) => (isReadOnly() ? refused() : target.command(...args));
      if (prop === "ephemeral" || prop === "preview" || prop === "endPreview") {
        return (...args: unknown[]) => {
          if (!isReadOnly()) (value as (...a: unknown[]) => void).apply(target, args);
        };
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/** A connection that is read-only for as long as it exists: the panels' view during a preview. */
export function previewConnection(connection: RoomConnection, name: string): RoomConnection {
  return guardedConnection(connection, () => true, name);
}

/** Read-only while a replay is showing (FR-PL-07): the replayed past is never edited. */
export function replayConnection(connection: RoomConnection): RoomConnection {
  return guardedConnection(connection, () => true, undefined, "You are watching a replay. Go back to the live table to make changes.");
}
