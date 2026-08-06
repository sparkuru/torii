import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const rootDirectory = fileURLToPath(new URL("../", import.meta.url));
process.chdir(rootDirectory);

await build({
  absWorkingDir: rootDirectory,
  entryPoints: ["apps/mcp-server/src/cli.ts"],
  outfile: "apps/mcp-server/dist/cli.js",
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  external: ["@modelcontextprotocol/sdk/*", "env-paths", "ws"]
});
