import { Injectable, Optional, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from './config';
@Injectable()
export class Db extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Optional() options?: { datasourceUrl?: string }) {
    super({
      adapter: new PrismaPg({ connectionString: options?.datasourceUrl || config.DATABASE_URL }),
    });
  }
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
  async atomic<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.$transaction(fn, { isolationLevel: 'Serializable', timeout: 15000 });
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2034' ||
          attempt >= 4
        )
          throw error;
        await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
      }
    }
  }
}
