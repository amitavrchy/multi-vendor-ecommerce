import 'dotenv/config';
import { z } from 'zod';
const schema = z.object({
  DATABASE_URL: z.string().min(1), JWT_SECRET: z.string().min(32),
  BANK_ENCRYPTION_KEY: z.string().regex(/^[a-f\d]{64}$/i),
  PORT: z.coerce.number().default(4000), APP_URL: z.url().default('http://localhost:3000'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  RESERVATION_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  DEFAULT_COMMISSION_BPS: z.coerce.number().int().min(0).max(10000).default(1000),
  REDIS_URL: z.string().optional(),
});
export const config = schema.parse(process.env);
