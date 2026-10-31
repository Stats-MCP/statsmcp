import { readFile, writeFile } from 'node:fs/promises';

const packageUrl = new URL('../packages/sistat/package.json', import.meta.url);
const serverUrl = new URL('../packages/sistat/server.json', import.meta.url);

const { version, mcpName } = JSON.parse(await readFile(packageUrl, 'utf8'));
const server = JSON.parse(await readFile(serverUrl, 'utf8'));

if (server.name !== mcpName) {
  throw new Error(
    `server.json name "${server.name}" must equal mcpName "${mcpName}".`
  );
}

server.version = version;
for (const entry of server.packages) entry.version = version;

await writeFile(serverUrl, `${JSON.stringify(server, null, 2)}\n`);
