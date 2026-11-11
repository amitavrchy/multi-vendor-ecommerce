import { WebSocketGateway, WebSocketServer, OnGatewayConnection } from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { config } from './config';
import { Db } from './db';
@WebSocketGateway({cors:{origin:config.CORS_ORIGINS.split(','),credentials:true}})
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer() server!:Server;
  constructor(private jwt:JwtService,private db:Db) {}
  async handleConnection(socket:Socket) {
    try {
      const cookies=Object.fromEntries((socket.handshake.headers.cookie||'').split(';').map(v=>v.trim().split('=')));
      const p=await this.jwt.verifyAsync(cookies.session); const user=await this.db.user.findUniqueOrThrow({where:{id:p.sub}});
      await socket.join(`user:${user.id}`);
      const v=await this.db.vendor.findFirst({where:{OR:[{ownerId:user.id},{members:{some:{userId:user.id}}}]}});if(v) await socket.join(`vendor:${v.id}`);
    } catch { socket.disconnect(); }
  }
  notify(room:string,event:string,payload:unknown) {this.server?.to(room).emit(event,payload);}
}
