import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const preload = fileURLToPath(new URL('./preload-matchers.mjs', import.meta.url));
const [command = 'run', ...args] = process.argv.slice(2);
if (!['run', 'list'].includes(command)) throw new Error('Historical entry supports run or list.');
const values = new Set(['--grep', '--grep-invert', '--repeat-each']);
const switches = new Set(['--headed', '--trace', '--no-cache']);
for (let i = 0; i < args.length; i++) {
  if (switches.has(args[i])) continue;
  if (!values.has(args[i]) || !args[++i] || args[i].startsWith('--')) throw new Error('Unsupported historical selection.');
}
const output = `.e2e/historical/${Date.now()}-${process.pid}`;
mkdirSync(join(root, output), { recursive: true });
// The sole historical TesterArmy entry. Preload only this CLI and its workers;
// managed app commands restore the original value/presence through the config.
const env = {
  ...process.env,
  TESTERARMY_AI: '0', TESTERARMY_HISTORICAL: '1',
  E2E_TELEMETRY_DISABLED: '1', DO_NOT_TRACK: '1', PARITY_OUTPUT: output,
  E2E_APP_NODE_OPTIONS: process.env.NODE_OPTIONS ?? '',
  E2E_APP_NODE_OPTIONS_PRESENT: Object.hasOwn(process.env, 'NODE_OPTIONS') ? '1' : '0',
  NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import ${JSON.stringify(preload)}`.trim(),
};
const argv = ['--import', preload, join(root, 'node_modules/e2e/dist/cli/bin.js'), command, '--target', 'desktop', ...args];
function inputs(directory) {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? inputs(path) : /\.(ts|mjs)$/.test(path) ? [path] : [];
  });
}
const files = ['e2e.config.ts', 'package.json', 'package-lock.json', 'e2e/ui/helpers/api.ts', ...inputs('e2e/testerarmy')].sort();
const identity = Object.fromEntries(files.map(path => [path, createHash('sha256').update(readFileSync(join(root, path))).digest('hex')]));
const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
if (revision.status !== 0) throw new Error('Cannot identify the source revision.');
writeFileSync(join(root, output, 'command.json'), JSON.stringify({
  command: ['node', 'e2e/testerarmy/run-historical.mjs', command, ...args], target: 'desktop', output,
  node: process.version, sourceRevision: revision.stdout.trim(), inputSha256: identity,
  nodeOptionsRestored: Object.hasOwn(process.env, 'NODE_OPTIONS') ? 'original value' : 'absent',
}, null, 2) + '\n');
const child = spawn(process.execPath, argv, { cwd: root, env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.once('error', error => { console.error(error); process.exitCode = 1; });
child.once('close', code => { process.exitCode = code ?? 1; });
