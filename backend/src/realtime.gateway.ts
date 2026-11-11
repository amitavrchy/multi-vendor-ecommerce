import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayInit,
} from '@nestjs/websockets';
import { OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { config } from './config';
import { Db } from './db';
@WebSocketGateway({ cors: { origin: config.CORS_ORIGINS.split(','), credentials: true } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayInit, OnModuleDestroy {
  private pub?: Redis;
  private sub?: Redis;
  @WebSocketServer() server!: Server;
  constructor(
    private jwt: JwtService,
    private db: Db,
  ) {}
  async afterInit(server: Server) {
    if (!config.REDIS_URL) return;
    this.pub = new Redis(config.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
    this.sub = this.pub.duplicate();
    this.pub.on('error', () => {});
    this.sub.on('error', () => {});
    try {
      await Promise.all([this.pub.connect(), this.sub.connect()]);
      server.adapter(createAdapter(this.pub, this.sub));
    } catch {
      this.pub.disconnect();
      this.sub.disconnect();
    }
  }
  onModuleDestroy() {
    this.pub?.disconnect();
    this.sub?.disconnect();
  }
  async handleConnection(socket: Socket) {
    try {
      const cookies = Object.fromEntries(
        (socket.handshake.headers.cookie || '').split(';').map((v) => v.trim().split('=')),
      );
      const p = await this.jwt.verifyAsync(cookies.session);
      const user = await this.db.user.findUniqueOrThrow({ where: { id: p.sub } });
      await socket.join(`user:${user.id}`);
      const v = await this.db.vendor.findFirst({
        where: { OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }] },
      });
      if (v) await socket.join(`vendor:${v.id}`);
    } catch {
      socket.disconnect();
    }
  }
  notify(room: string, event: string, payload: unknown) {
    this.server?.to(room).emit(event, payload);
  }
}
