/** What a user is told about rights, when starting a build and when publishing one (FR-GM-26). */
export const RIGHTS_NOTICE = "Only upload art and maps you have the right to use. Rooms share them with the people at your table.";

/** The message a user pastes into their AI app to hand it this build (FR-GM-26). */
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
