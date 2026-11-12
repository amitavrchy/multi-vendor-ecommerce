import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const backend = fileURLToPath(new URL('../', import.meta.url));
const frontend = fileURLToPath(new URL('../../frontend/', import.meta.url));
const cli = process.env.npm_execpath;
if (!cli) throw new Error('Run npm run verify from backend');
for (const [cwd, tasks] of [
  [backend, ['db:generate', 'typecheck', 'format:check', 'test', 'test:integration', 'build']],
  [frontend, ['typecheck', 'format:check', 'build']],
]) {
  for (const task of tasks) {
    const result = spawnSync(process.execPath, [cli, 'run', task], {
      cwd,
      stdio: 'inherit',
      env: process.env,
    });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
console.log(
  'All source, database and production build checks passed. Start both apps and run npm run test:e2e from frontend for browser verification.',
);
