import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { mergeMap } from 'rxjs';
import { CacheService } from './cache.service';
@Injectable()
export class CacheInvalidation implements NestInterceptor {
  constructor(private cache: CacheService) {}
  intercept(ctx: ExecutionContext, next: CallHandler) {
    const request = ctx.switchToHttp().getRequest();
    if (request.method === 'GET' && !request.path.startsWith('/api/payments/webhooks/'))
      return next.handle();
    return next.handle().pipe(
      mergeMap(async (value) => {
        await this.cache.invalidate();
        return value;
      }),
    );
  }
}
