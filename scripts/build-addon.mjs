import { cp, mkdir, rm } from "node:fs/promises";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const rootDirectory = fileURLToPath(new URL("../", import.meta.url));
process.chdir(rootDirectory);
const sourceDirectory = "apps/firefox-addon";
const outputDirectory = `${sourceDirectory}/dist`;

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  cp(`${sourceDirectory}/manifest.json`, `${outputDirectory}/manifest.json`),
  cp(`${sourceDirectory}/popup.html`, `${outputDirectory}/popup.html`),
  cp(`${sourceDirectory}/popup.css`, `${outputDirectory}/popup.css`)
]);
await build({
  absWorkingDir: rootDirectory,
  entryPoints: [`${sourceDirectory}/src/background.ts`, `${sourceDirectory}/src/popup.ts`],
  outdir: outputDirectory,
  bundle: true,
  format: "esm",
  target: "firefox128"
});
