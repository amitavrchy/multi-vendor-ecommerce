import { Controller, Get, Header, ServiceUnavailableException } from '@nestjs/common';
import { Db } from './db';
import { Public } from './auth/access';
import { CacheService } from './cache.service';
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private db: Db,
    private cache: CacheService,
  ) {}
  @Get() @Header('Cache-Control', 'no-store') async ready() {
    try {
      await this.db.$queryRaw`SELECT 1`;
      if (!(await this.cache.ready())) throw new Error();
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('Service dependencies are not ready');
    }
  }
}
