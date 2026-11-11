import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
export function input<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException(result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
  return result.data;
}
export const addressSchema = z.object({label:z.string().min(1).max(40), name:z.string().min(2).max(100), phone:z.string().regex(/^\+?[\d\s-]{10,18}$/), line1:z.string().min(5).max(300), city:z.string().min(2).max(80), postalCode:z.string().min(3).max(12)});
export const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(100);
