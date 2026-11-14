import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { startServer } from "../../server/test/helpers";
import { startMcpServer, type McpAppOptions } from "../src/app";

export type RoomServer = Awaited<ReturnType<typeof startServer>>;
export type RunningMcp = Awaited<ReturnType<typeof startMcpServer>>;

export interface ToolResult {
  isError: boolean;
  text: string;
  /** The parsed result, when the tool returned JSON. */
  json: Record<string, unknown>;
  images: { data: string; mimeType: string }[];
}

/** An AI app's connection: the real SDK client over real HTTP. */
export class AiClient {
  private constructor(private client: Client, private transport: StreamableHTTPClientTransport) {}

  static async connect(url: string, headers: Record<string, string> = {}) {
    const client = new Client({ name: "test-ai", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } });
    await client.connect(transport);
    return new AiClient(client, transport);
  }

  get instructions() {
    return this.client.getInstructions();
  }

  get protocolVersion() {
    return this.transport.protocolVersion;
  }

  listTools() {
    return this.client.listTools();
  }

  async call(name: string, args: Record<string, unknown>, options: { signal?: AbortSignal } = {}): Promise<ToolResult> {
    const result = (await this.client.callTool({ name, arguments: args }, { timeout: 60_000, ...options })) as {
      isError?: boolean;
      content: { type: string; text?: string; data?: string; mimeType?: string }[];
    };
    const text = result.content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
    let json: Record<string, unknown> = {};
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      /* A plain message, such as a tool error. */
    }
    const images = result.content.filter((c) => c.type === "image").map((c) => ({ data: c.data ?? "", mimeType: c.mimeType ?? "" }));
    return { isError: result.isError === true, text, json, images };
  }

  close() {
    return this.client.close();
  }
}

export interface Stack {
  room: RoomServer;
  mcp: RunningMcp;
  ai: AiClient;
  close: () => Promise<void>;
}

/** A real room server, a real MCP server in front of it, and one AI app connected. */
export async function startStack(options: Partial<McpAppOptions> = {}, roomServer?: RoomServer): Promise<Stack> {
  const room = roomServer ?? (await startServer());
  const mcp = await startMcpServer({ roomServerUrl: room.base, allowedOrigins: ["http://localhost:5173"], ...options });
  const ai = await AiClient.connect(mcp.url);
  return {
    room,
    mcp,
    ai,
    close: async () => {
      await ai.close();
      await mcp.close();
      if (!roomServer) await room.close();
    },
  };
}

/** Polls `read` until `check` passes. The room reaches the MCP server's mirror a moment after a command. */
export async function eventually<T>(read: () => Promise<T> | T, check: (value: T) => boolean, timeoutMs = 2_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (check(value)) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting. Last value: ${JSON.stringify(value)}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

export const viewTokens = (view: ToolResult) => view.json.tokens as { id: string; name: string; column: number; row: number; yours: boolean; size: number }[];

type GmClient = Awaited<ReturnType<RoomServer["connect"]>>;
type GmCommand = Parameters<GmClient["command"]>[0];

/** A room with its GM connected, as a browser would be. */
export async function openTable(room: RoomServer, roomName = "Test Room") {
  const created = await room.createRoom("GM", { roomName });
  const gm = await room.connect({ roomId: created.roomId, guestToken: created.guestToken });
  return { ...created, gm };
}

/** Sends a GM command that must succeed, and waits for the GM's copy to catch up. */
export async function gmDoes(gm: GmClient, command: GmCommand) {
  const reply = await gm.command(command);
  if (reply.type !== "ack") throw new Error(`${command.type} refused: ${reply.message}`);
  if (reply.seq !== null) await gm.waitForSeq(reply.seq);
}

/** Creates a token and returns its id. */
export async function addToken(gm: GmClient, fields: Omit<Extract<GmCommand, { type: "token.create" }>, "type">) {
  const before = new Set(Object.keys(gm.state.tokens));
  await gmDoes(gm, { type: "token.create", ...fields });
  return Object.keys(gm.state.tokens).find((id) => !before.has(id))!;
}

/** The middle of a grid square, in board coordinates. */
export function squareCenter(gm: GmClient, column: number, row: number) {
  const { cellSize, offsetX, offsetY } = gm.state.scene.grid;
  return { x: offsetX + (column + 0.5) * cellSize, y: offsetY + (row + 0.5) * cellSize };
}

/** Sits an AI down, failing the test if the room refuses. */
export async function joinAs(ai: AiClient, inviteCode: string, name: string) {
  const joined = await ai.call("join_room", { invite: inviteCode, name });
  if (joined.isError) throw new Error(`join_room refused: ${joined.text}`);
  return { seat: joined.json.seat as string, participantId: joined.json.participantId as string, displayName: joined.json.displayName as string, brief: joined.json.brief as string };
}
