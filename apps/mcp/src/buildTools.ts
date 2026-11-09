import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * The stub of the build tools at /mcp/build (task 1.3): one tool, to find out whether real AI apps
 * connect with no sign-in and send the pass as an argument. It checks nothing and reaches nothing.
 * The real tools replace it in task 5.2.
 */
export function createBuildMcpServer(): McpServer {
  const server = new McpServer({ name: "session-zero-build", version: "1.0.0" });

  server.registerTool("get_build", {
    title: "Read a build",
    description: "Stub for testing the connection. Send the build pass you were given. Replies with how long the pass was, and never the pass itself.",
    inputSchema: { pass: z.string().min(1).max(200).describe("The build pass from the Session Zero build page.") },
  }, ({ pass }) => ({ content: [{ type: "text", text: JSON.stringify({ stub: true, passCharacters: pass.length }) }] }));

  return server;
}
