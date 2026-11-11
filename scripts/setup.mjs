import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
if (!existsSync('backend/.env')) {
  const template = readFileSync('backend/.env.example', 'utf8');
  writeFileSync(
    'backend/.env',
    template
      .replace('replace-with-at-least-32-random-characters', randomBytes(48).toString('hex'))
      .replace('replace-with-64-hex-characters', randomBytes(32).toString('hex'))
      .replace('SEED_PASSWORD=', 'SEED_PASSWORD=BazaarDemo2026!'),
  );
  console.log('Created local configuration with unique session and encryption keys.');
}
if (!existsSync('frontend/.env.local'))
  writeFileSync('frontend/.env.local', readFileSync('frontend/.env.example'));
function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0)
    throw new Error(
      `Setup failed at ${command} ${args.join(' ')}. Check Docker Desktop and command output.`,
    );
}
run('docker', ['compose', 'up', '-d', '--wait']);
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run through npm run setup');
for (const task of ['db:generate', 'db:migrate', 'db:seed'])
  run(process.execPath, [npmCli, 'run', task]);
console.log('Ready. Run npm run dev and open http://localhost:3187.');
