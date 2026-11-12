import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { z } from 'zod';

const adminInput = z.object({
  email: z.email().trim().toLowerCase(),
  name: z.string().trim().min(2).max(80),
  password: z
    .string()
    .min(12)
    .refine(
      (value) => Buffer.byteLength(value, 'utf8') <= 72,
      'Password must fit within 72 UTF-8 bytes',
    ),
});

export async function bootstrapAdmin(db: PrismaClient, value: unknown) {
  const data = adminInput.parse(value);
  if (await db.user.findUnique({ where: { email: data.email } }))
    throw new Error(
      'Email already exists; existing accounts cannot be promoted or reset by this command',
    );
  return db.user.create({
    data: {
      email: data.email,
      name: data.name,
      passwordHash: await hash(data.password, 12),
      role: 'PLATFORM_ADMIN',
    },
    select: { id: true, email: true, name: true, role: true },
  });
}
