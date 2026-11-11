import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const url = new URL(process.env.DATABASE_URL!);
url.pathname = '/bazaar_test';
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
async function main() {
  const exists = await db.$queryRaw<
    { datname: string }[]
  >`SELECT datname FROM pg_database WHERE datname='bazaar_test'`;
  if (!exists.length) await db.$executeRawUnsafe('CREATE DATABASE bazaar_test');
  await db.$disconnect();
  const result = spawnSync(
    process.execPath,
    [path.resolve('../node_modules/prisma/build/index.js'), 'db', 'push'],
    { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url.toString() } },
  );
  if (result.status !== 0) process.exit(result.status || 1);
}
void main();
