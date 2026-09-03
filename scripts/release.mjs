import { appendFile, readFile, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";

const packagesDirectory = new URL("../packages/", import.meta.url);
const entries = await readdir(packagesDirectory, { withFileTypes: true });
const published = [];

for (const entry of entries.sort((left, right) =>
  left.name.localeCompare(right.name),
)) {
  if (!entry.isDirectory()) continue;

  const directory = new URL(`${entry.name}/`, packagesDirectory);
  const manifest = JSON.parse(
    await readFile(new URL("package.json", directory), "utf8"),
  );

  if (manifest.private || !manifest.name?.startsWith("@tauri-native/")) {
    continue;
  }

  const registry = manifest.publishConfig?.registry ?? "https://registry.npmjs.org/";
  const response = await fetch(
    new URL(
      `${encodeURIComponent(manifest.name)}/${encodeURIComponent(manifest.version)}`,
      registry,
    ),
  );

  if (response.ok) {
    console.log(`${manifest.name}@${manifest.version} is already published.`);
    continue;
  }

  if (response.status !== 404) {
    throw new Error(
      `Could not check ${manifest.name}@${manifest.version}: ${response.status} ${response.statusText}`,
    );
  }

  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn("npm", ["publish"], {
      cwd: directory,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });

  if (exitCode !== 0) {
    throw new Error(`npm publish failed for ${manifest.name}.`);
  }

  published.push({ name: manifest.name, version: manifest.version });
}

if (process.env.CHANGESETS_OUTPUT) {
  const events = published.map(({ name, version }) =>
    JSON.stringify({
      type: "git-tag",
      tag: `${name}@${version}`,
      packageName: name,
    }),
  );

  await appendFile(
    process.env.CHANGESETS_OUTPUT,
    events.length === 0 ? "" : `${events.join("\n")}\n`,
  );
}
