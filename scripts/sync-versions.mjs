import { readFile, writeFile } from 'node:fs/promises';

const packagesUrl = new URL('../packages/', import.meta.url);

async function readJson(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

async function syncPresetVersion(dir) {
  const { version } = await readJson(
    new URL(`${dir}/package.json`, packagesUrl)
  );
  const presetUrl = new URL(`${dir}/src/preset.ts`, packagesUrl);
  const preset = await readFile(presetUrl, 'utf8');
  const updated = preset.replace(
    /^(\s*version: ')[^']*(',)$/m,
    `$1${version}$2`
  );
  if (updated === preset && !preset.includes(`version: '${version}',`)) {
    throw new Error(`No version field found in ${dir}/src/preset.ts.`);
  }
  await writeFile(presetUrl, updated);
  return version;
}

async function syncServerJson(dir, version) {
  const { mcpName } = await readJson(
    new URL(`${dir}/package.json`, packagesUrl)
  );
  const serverUrl = new URL(`${dir}/server.json`, packagesUrl);
  const server = await readJson(serverUrl);
  if (server.name !== mcpName) {
    throw new Error(
      `server.json name "${server.name}" must equal mcpName "${mcpName}".`
    );
  }
  server.version = version;
  for (const entry of server.packages) entry.version = version;
  await writeFile(serverUrl, `${JSON.stringify(server, null, 2)}\n`);
}

for (const dir of ['sistat', 'ssb', 'stat-ee', 'hagstova', 'statfin', 'scb']) {
  const version = await syncPresetVersion(dir);
  if (dir === 'sistat') await syncServerJson(dir, version);
}
