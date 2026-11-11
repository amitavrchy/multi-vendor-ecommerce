import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { config } from './config';
import { CacheService } from './cache.service';
@Catch()
class ApiErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    if (error instanceof HttpException)
      return res.status(error.getStatus()).json({ message: error.message });
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const status = error.code === 'P2002' ? 409 : error.code === 'P2025' ? 404 : 400;
      return res.status(status).json({
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
  const cache = app.get(CacheService);
  app
    .getHttpAdapter()
    .getInstance()
    .set(
      'trust proxy',
      process.env.TRUST_PROXY_HOPS ? Number(process.env.TRUST_PROXY_HOPS) : false,
    );
  app.use(async (req: any, res: any, next: () => void) => {
    if (
      req.method !== 'GET' &&
      !req.path.startsWith('/api/payments/webhooks/') &&
      req.path !== '/api/payments/return'
    ) {
      const origin = req.headers.origin;
      if (origin && !config.CORS_ORIGINS.split(',').includes(origin))
        return res.status(403).json({ message: 'Origin is not allowed' });
    }
    const authAttempt =
      req.method === 'POST' && ['/api/auth/login', '/api/auth/register'].includes(req.path);
    const key = `${req.ip}:${authAttempt ? 'auth' : 'api'}`;
    if (!(await cache.allow(key, authAttempt ? 30 : 600, 60000)))
      return res.status(429).json({ message: 'Too many requests. Please wait a minute.' });
    next();
  });
  await app.listen(config.PORT, '0.0.0.0');
}
void main();
