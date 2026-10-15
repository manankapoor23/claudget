import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspacePaths = {
  core: 'packages/core',
  desktop: 'packages/desktop',
};
const [workspaceName, scriptName, ...args] = process.argv.slice(2);
const workspacePath = workspaceName ? workspacePaths[workspaceName] : undefined;

if (!workspacePath || !scriptName) {
  console.error('Usage: node scripts/run-workspace.mjs <core|desktop> <script> [args...]');
  process.exit(2);
}

const workspaceDir = path.join(repoRoot, workspacePath);
const packageJson = JSON.parse(await readFile(path.join(workspaceDir, 'package.json'), 'utf8'));
const command = packageJson.scripts?.[scriptName];

if (!command) {
  console.error(`Script "${scriptName}" not found in ${workspacePath}/package.json`);
  process.exit(2);
}

const binPaths = [
  path.join(workspaceDir, 'node_modules', '.bin'),
  path.join(repoRoot, 'node_modules', '.bin'),
  process.env.PATH ?? '',
];
const child = spawn(command, args, {
  cwd: workspaceDir,
  env: { ...process.env, PATH: binPaths.join(path.delimiter) },
  shell: true,
  stdio: 'inherit',
});

child.on('error', (error) => {
  console.error(`Could not run ${workspaceName}:${scriptName}:`, error.message);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exitCode = code ?? 1;
  }
});
