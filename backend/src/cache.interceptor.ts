import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { mergeMap } from 'rxjs';
import { CacheService } from './cache.service';
@Injectable()
export class CacheInvalidation implements NestInterceptor {
  constructor(private cache: CacheService) {}
  intercept(ctx: ExecutionContext, next: CallHandler) {
    if (ctx.switchToHttp().getRequest().method === 'GET') return next.handle();
    return next.handle().pipe(
      mergeMap(async (value) => {
        await this.cache.invalidate();
        return value;
      }),
    );
  }
}
