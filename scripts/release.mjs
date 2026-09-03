import { appendFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const child = spawn(
  "nub",
  [
    "publish",
    "--recursive",
    "--filter",
    "@tauri-native/*",
    "--provenance",
    "--no-git-checks",
    "--json",
  ],
  { stdio: ["inherit", "pipe", "inherit"] },
);

let stdout = "";
child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  stdout += chunk;
  process.stdout.write(chunk);
});

const exitCode = await new Promise((resolve, reject) => {
  child.on("error", reject);
  child.on("close", (code) => resolve(code ?? 1));
});

const lineStarts = [0];
for (let index = 0; index < stdout.length; index += 1) {
  if (stdout[index] === "\n") lineStarts.push(index + 1);
}

let outcomes;
for (const start of lineStarts.reverse()) {
  try {
    const parsed = JSON.parse(stdout.slice(start));
    outcomes = Array.isArray(parsed) ? parsed : [parsed];
    break;
  } catch {}
}

if (!outcomes) {
  throw new Error("Could not read Nub's publish result.");
}

if (process.env.CHANGESETS_OUTPUT) {
  const events = outcomes
    .filter(({ status }) => status === "published")
    .map(({ name, version }) =>
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

process.exitCode = exitCode;
