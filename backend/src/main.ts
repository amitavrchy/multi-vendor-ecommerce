import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { config } from './config';
@Catch()
class ApiErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    if (error instanceof HttpException)
      return res.status(error.getStatus()).json({ message: error.message });
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const status = error.code === 'P2002' ? 409 : error.code === 'P2025' ? 404 : 400;
      return res
        .status(status)
        .json({
          message:
            status === 409
              ? 'This record already exists'
              : status === 404
                ? 'Record not found'
                : 'The request could not be saved',
        });
    }
    console.error(error);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
}
async function main() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: config.CORS_ORIGINS.split(','), credentials: true });
  app.enableShutdownHooks();
  app.useGlobalFilters(new ApiErrors());
  const buckets = new Map<string, { count: number; expires: number }>();
  app.use((req: any, res: any, next: () => void) => {
    if (req.method !== 'GET' && !req.path.startsWith('/api/payments/webhooks/')) {
      const origin = req.headers.origin;
      if (origin && !config.CORS_ORIGINS.split(',').includes(origin))
        return res.status(403).json({ message: 'Origin is not allowed' });
    }
    const authAttempt =
      req.method === 'POST' && ['/api/auth/login', '/api/auth/register'].includes(req.path);
    const key = `${req.ip}:${authAttempt ? 'auth' : 'api'}`;
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || b.expires < now) {
      b = { count: 0, expires: now + 60000 };
      buckets.set(key, b);
    }
    if (++b.count > (key.endsWith(':auth') ? 30 : 300))
      return res.status(429).json({ message: 'Too many requests. Please wait a minute.' });
    if (buckets.size > 10000) for (const [k, v] of buckets) if (v.expires < now) buckets.delete(k);
    next();
  });
  await app.listen(config.PORT, '0.0.0.0');
}
void main();
