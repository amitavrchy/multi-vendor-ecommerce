import { CanActivate, ExecutionContext, Injectable, SetMetadata, createParamDecorator, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Db } from '../db';
export type Principal = {id:string;email:string;name:string;role:string};
export const Public = () => SetMetadata('public', true);
export const Roles = (...roles: string[]) => SetMetadata('roles', roles);
export const Actor = createParamDecorator((_: unknown, ctx: ExecutionContext):Principal => ctx.switchToHttp().getRequest().user);
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(private reflector:Reflector, private jwt:JwtService, private db:Db) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    if (this.reflector.getAllAndOverride<boolean>('public', [context.getHandler(), context.getClass()])) return true;
    try {
      const token = request.cookies?.session;
      const payload = await this.jwt.verifyAsync(token);
      request.user = await this.db.user.findUniqueOrThrow({where:{id:payload.sub},select:{id:true,email:true,name:true,role:true}});
    } catch { throw new UnauthorizedException('Please sign in to continue'); }
    const roles = this.reflector.getAllAndOverride<string[]>('roles', [context.getHandler(), context.getClass()]);
    if (roles && !roles.includes(request.user.role)) throw new ForbiddenException('You do not have access to this action');
    return true;
  }
}
