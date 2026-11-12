import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { testDatabaseUrl } from './database';
const url = testDatabaseUrl();
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
async function main() {
  const databaseName = url.pathname.slice(1);
  const exists = await db.$queryRaw<
    { datname: string }[]
  >`SELECT datname FROM pg_database WHERE datname=${databaseName}`;
  if (!exists.length) await db.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
  await db.$disconnect();
  const result = spawnSync(
    process.execPath,
    [path.resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
    { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url.toString() } },
  );
  if (result.status !== 0) process.exit(result.status || 1);
}
void main();
