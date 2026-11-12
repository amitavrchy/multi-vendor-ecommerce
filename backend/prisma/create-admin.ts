import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { bootstrapAdmin } from '../src/auth/bootstrap';

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
async function main() {
  let value: unknown;
  if (process.stdin.isTTY) {
    let hidden = false;
    const output = new Writable({
      write(chunk, _encoding, callback) {
        if (!hidden) process.stdout.write(chunk);
        callback();
      },
    });
    const prompt = createInterface({ input: process.stdin, output, terminal: true });
    try {
      const name = await prompt.question('Admin name: ');
      const email = await prompt.question('Admin email: ');
      process.stdout.write('Password (12+ characters, hidden): ');
      hidden = true;
      const password = await prompt.question('');
      process.stdout.write('\n');
      value = { name, email, password };
    } finally {
      prompt.close();
    }
  } else {
    let body = '';
    for await (const chunk of process.stdin) {
      body += chunk.toString();
      if (Buffer.byteLength(body) > 4096) throw new Error('Input exceeds 4096 bytes');
    }
    value = JSON.parse(body);
  }
  const admin = await bootstrapAdmin(db, value);
  console.log(`Created platform admin: ${admin.email}`);
}
main()
  .catch((error) => {
    console.error(
      error instanceof Error && error.message.startsWith('Email already exists')
        ? error.message
        : 'Admin creation failed. Check database access and provide a valid name, email and 12–72 byte password.',
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
