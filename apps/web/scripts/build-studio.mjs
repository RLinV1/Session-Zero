import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

/** Build the provider-free React surface with the existing web workspace toolchain. */
export async function buildStudio(write = false) {
  const { build } = await import("vite");
  const built = await build({
    configFile: false,
    root: fileURLToPath(new URL("..", import.meta.url)),
    logLevel: "error",
    esbuild: { jsx: "automatic" },
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      write: false,
      target: "es2022",
      minify: "esbuild",
      cssCodeSplit: false,
      lib: { entry: fileURLToPath(new URL("../src/studio/embedded.tsx", import.meta.url)), name: "SceneStudioBundle", formats: ["iife"] },
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  });
  const outputs = (Array.isArray(built) ? built : [built]).flatMap((result) => "output" in result ? result.output : []);
  const script = outputs.filter((item) => item.type === "chunk").map((item) => item.code).join("\n");
  const styles = outputs.filter((item) => item.type === "asset" && item.fileName.endsWith(".css")).map((item) => item.source).join("\n");
  if (!script || /(?:import\s*\(|https?:\/\/[^\s"']+\.js)/.test(script)) throw new Error("Studio bundle must be self-contained");
  const result = { script, styles };
  if (write) {
    const output = fileURLToPath(new URL("../../mcp/dist/studio.json", import.meta.url));
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify(result));
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildStudio(true);
