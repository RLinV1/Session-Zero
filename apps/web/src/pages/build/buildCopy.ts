import type { TextId } from "../../i18n/locale";

/** What a user is told about rights, when starting a build and when publishing one (FR-GM-26). Shown with `t()`. */
export const RIGHTS_NOTICE: TextId = "build.rightsNotice";

/**
 * The message a user pastes into their AI app to hand it this build (FR-GM-26). English in every
 * language, like the Share dialog's AI messages: it is an instruction to the AI.
 */
export function buildMessage(origin: string, pass: string): string {
  return [
    "Please help me set up a tabletop game in Session Zero.",
    "",
    `Connect to this MCP server, with no sign-in: ${origin}/mcp/build`,
    `The build pass for this game is: ${pass}`,
    "",
    "Call get_build first, and tell me whose build it is before uploading anything.",
    "Then read my rules and character sheets and fill in the draft. Leave anything unclear blank and flag it. Don't invent values.",
    "I'll review it and publish it myself on the build page.",
  ].join("\n");
}

const UVTT_FILE = /\.(?:uvtt|dd2vtt|df2vtt)$/i;

/** What to tell the server a dropped file is. A UVTT file is one wherever it's dropped. */
export function uploadKindFor(fileName: string, droppedOn: "map" | "token"): "map" | "token" | "uvtt" {
  return UVTT_FILE.test(fileName) ? "uvtt" : droppedOn;
}

/** Copies text, reporting whether it worked: the clipboard can be refused on plain http. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
